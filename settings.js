const fields = {
  site_title: ['Judul situs', 100],
  site_description: ['Deskripsi situs', 320],
  hero_heading: ['Judul hero', 160],
  hero_description: ['Deskripsi hero', 600],
  hero_cta_text: ['Teks tombol utama', 80],
};
const images = { favicon_url: 'Favicon', og_image_url: 'Gambar berbagi (Open Graph)' };
const assetUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/site-assets\/[a-zA-Z0-9_-]+\.(png|jpg|webp|ico)$/;
const safeAsset = value => typeof value === 'string' && assetUrl.test(value) ? value : '';

export async function loadSiteSettings(sb) {
  if (!sb) throw new Error('Koneksi Supabase belum tersedia.');
  const { data, error } = await sb.from('site_settings').select('settings').eq('id', 1).single();
  if (error) throw new Error(`Gagal memuat pengaturan situs: ${error.message}`);
  return data.settings;
}

// Keep the original head and landing markup so clearing a setting restores the default.
const originals = new WeakMap();
function restore(node, attribute, value) {
  if (!node) return;
  if (!originals.has(node)) originals.set(node, attribute ? node.getAttribute(attribute) : [...node.childNodes]);
  if (attribute) {
    const next = value || originals.get(node);
    if (next === null) node.removeAttribute(attribute);
    else node.setAttribute(attribute, next);
  } else if (value) node.textContent = value;
  else node.replaceChildren(...originals.get(node));
}
function headValue(selector, tag, attrs, attribute, value) {
  let node = document.head.querySelector(selector);
  if (!node && value) {
    node = document.createElement(tag);
    for (const [key, val] of Object.entries(attrs)) node.setAttribute(key, val);
    document.head.append(node);
  }
  restore(node, attribute, value);
}

export function applySiteSettings(settings = {}) {
  const text = key => typeof settings?.[key] === 'string' ? settings[key].trim() : '';
  restore(document.head.querySelector('title'), null, text('site_title'));
  headValue('meta[name="description"]', 'meta', { name: 'description' }, 'content', text('site_description'));
  for (const [property, value] of [['og:title', text('site_title')], ['og:description', text('site_description')], ['og:image', safeAsset(settings?.og_image_url)]]) {
    headValue(`meta[property="${property}"]`, 'meta', { property }, 'content', value);
  }
  headValue('link[rel="icon"]', 'link', { rel: 'icon' }, 'href', safeAsset(settings?.favicon_url));
  restore(document.querySelector('.hero .herocopy h1'), null, text('hero_heading'));
  restore(document.querySelector('.hero .herocopy > p'), null, text('hero_description'));
  restore(document.querySelector('.hero .herocopy .actions .primary'), null, text('hero_cta_text'));
}

async function imageType(file, key) {
  if (!file.size || file.size > 5 * 1024 * 1024) throw new Error(`${images[key]} harus berukuran maksimal 5 MB dan tidak kosong.`);
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const starts = (...signature) => signature.every((byte, i) => bytes[i] === byte);
  if (starts(137, 80, 78, 71, 13, 10, 26, 10)) return ['png', 'image/png'];
  if (starts(255, 216, 255)) return ['jpg', 'image/jpeg'];
  if (starts(82, 73, 70, 70) && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return ['webp', 'image/webp'];
  if (starts(0, 0, 1, 0) && (bytes[4] || bytes[5])) return ['ico', 'image/x-icon'];
  throw new Error(`${images[key]} harus berupa PNG, JPEG, WebP, atau ICO.`);
}

export async function settingsPanel(container, { sb, esc, perform, onSaved = applySiteSettings }, initialSettings) {
  const saved = initialSettings ?? await loadSiteSettings(sb);
  if (!container.isConnected) return;
  const e = value => esc(String(value ?? ''));
  const input = key => {
    const [label, max] = fields[key];
    const value = e(saved[key]);
    return `<label>${label}${key.endsWith('_description') ? `<textarea name="${key}" rows="3" maxlength="${max}">${value}</textarea>` : `<input name="${key}" maxlength="${max}" value="${value}">`}</label>`;
  };
  const imageInput = key => `<div class="rb-setting-image"><label>${images[key]}<input name="${key}" type="file" accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon,.ico"></label>
    ${safeAsset(saved[key]) ? `<img src="${e(saved[key])}" alt="Pratinjau ${images[key]}"><label class="rb-setting-remove"><input type="checkbox" name="remove_${key}"> Hapus gambar saat disimpan</label>` : ''}</div>`;
  container.innerHTML = `<form class="rb-panel rb-settings"><p>Kosongkan teks untuk menggunakan tampilan bawaan.</p>
    <fieldset><legend>Umum</legend><div class="rb-settings-fields">${['site_title', 'site_description'].map(input).join('')}${Object.keys(images).map(imageInput).join('')}</div><small>PNG, JPEG, WebP, atau ICO, maksimal 5 MB per gambar.</small></fieldset>
    <fieldset><legend>Halaman depan</legend><div class="rb-settings-fields">${['hero_heading', 'hero_description', 'hero_cta_text'].map(input).join('')}</div></fieldset>
    <p class="rb-settings-status" role="status"></p><button class="btn primary" type="submit">Simpan pengaturan</button></form>`;
  const form = container.querySelector('form');
  const status = form.querySelector('[role=status]');
  const button = form.querySelector('[type=submit]');
  form.onsubmit = event => {
    event.preventDefault();
    const data = new FormData(form);
    perform(button, async () => {
      status.textContent = 'Menyimpan…';
      const settings = {};
      for (const key of Object.keys(fields)) settings[key] = data.get(key).trim();
      const uploads = [];
      for (const key of Object.keys(images)) {
        const file = data.get(key);
        settings[key] = data.has(`remove_${key}`) ? '' : safeAsset(saved[key]);
        if (file?.name) uploads.push([key, file, ...await imageType(file, key)]);
      }
      const bucket = sb.storage.from('site-assets');
      for (const [key, file, ext, contentType] of uploads) {
        const path = `${key}-${crypto.randomUUID()}.${ext}`;
        const { error } = await bucket.upload(path, file, { contentType, upsert: false });
        if (error) throw new Error(`Gagal mengunggah ${images[key]}: ${error.message}`);
        const { data: { publicUrl } } = bucket.getPublicUrl(path);
        if (!safeAsset(publicUrl)) throw new Error('Alamat publik gambar tidak didukung.');
        settings[key] = publicUrl;
      }
      const { data: row, error } = await sb.from('site_settings').update({ settings }).eq('id', 1).select('settings').single();
      if (error) throw new Error(`Gagal menyimpan pengaturan: ${error.message}`);
      await onSaved(row.settings);
      await settingsPanel(container, { sb, esc, perform, onSaved }, row.settings);
      const message = container.querySelector('[role=status]');
      if (message) message.textContent = 'Pengaturan disimpan.';
    }, error => { status.textContent = error?.message || 'Gagal menyimpan pengaturan.'; });
  };
}
