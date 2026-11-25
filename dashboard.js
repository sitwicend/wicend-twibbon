import { settingsPanel } from './settings.js';

const number = new Intl.NumberFormat('id-ID');
const date = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' });
const month = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const count = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const icons = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  campaigns: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m3 16 5-5 4 4 3-3 6 5"/><circle cx="15" cy="8" r="1"/>',
  create: '<path d="M12 5v14M5 12h14"/>',
  accounts: '<circle cx="10" cy="8" r="4"/><path d="M3 21v-2a7 7 0 0 1 14 0v2M17 4a4 4 0 0 1 0 8m2 3a5 5 0 0 1 3 5"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6"/>',
  views: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  downloads: '<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
};
const icon = key => `<svg class="rb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key]}</svg>`;
const displayDate = value => value && Number.isFinite(new Date(value).getTime()) ? date.format(new Date(value)) : '—';
const pngData = /^data:image\/png;base64,[a-z0-9+/]+={0,2}$/i;

async function readPng(file) {
  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (signature.join(',') !== '137,80,78,71,13,10,26,10') {
    throw new Error(`${file.name} bukan berkas PNG.`);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(`data:image/png;base64,${reader.result.split(',')[1]}`);
    reader.onerror = () => reject(new Error(`Gagal membaca ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

export async function dashboard(app, { api, esc, toast, copy, sb, onSiteSettingsSaved }) {
  const e = value => esc(String(value ?? ''));
  const campaignPath = slug => `#/c/${encodeURIComponent(slug)}`;
  const managePath = slug => `/api/manage/${encodeURIComponent(slug)}`;
  let user;
  let campaigns = [];
  let view = 'overview';
  let busy = false;
  const isSuperadmin = () => user?.role === 'superadmin';
  const isAdmin = () => isSuperadmin() || user?.role === 'admin' || user?.isAdmin === true;
  const post = (path, body) => api(path, { method: 'POST', body });
  const errorMessage = error => error?.message || 'Terjadi kesalahan. Coba lagi.';

  async function perform(button, task, onError = error => toast(errorMessage(error))) {
    if (busy) return;
    busy = true;
    button.disabled = true;
    try { await task(); }
    catch (error) { onError(error); }
    finally {
      busy = false;
      button.disabled = false;
    }
  }

  const tabs = { overview: 'Ringkasan', campaigns: 'Kampanye', create: 'Buat kampanye', accounts: 'Akun pengguna', settings: 'Situs & halaman depan' };
  const canView = key => key === 'settings' ? isSuperadmin() : key !== 'accounts' || isAdmin();
  function shell(current, title, subtitle) {
    const name = user.name?.trim() || user.email || 'Kreator';
    const initials = name.split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('id-ID');
    const role = isSuperadmin() ? 'Superadmin' : isAdmin() ? 'Administrator' : 'Kreator';
    app.innerHTML = `<section class="wrap rb-dash"><aside class="rb-sidebar rb-panel"><div class="rb-sidebar-brand"><span>${icon('campaigns')}</span><strong>Ruang Kreator</strong></div>
      <nav aria-label="Navigasi dasbor">${Object.entries(tabs).filter(([key]) => canView(key)).map(([key, label]) => `<button type="button" data-view="${key}" ${current === key ? 'aria-current="page"' : ''}>${icon(key)}<span>${label}</span></button>`).join('')}</nav>
      <button type="button" class="btn outline rb-logout">Keluar</button></aside>
      <div class="rb-main"><header class="rb-heading"><div><span class="rb-kicker">DASBOR</span><h1 tabindex="-1">${e(title)}</h1><p>${e(subtitle)}</p></div><div class="rb-identity"><span class="rb-avatar" aria-hidden="true">${e(initials)}</span><div><strong>${e(name)}</strong><small>${role}</small></div></div></header><div class="rb-body"></div></div></section>`;
    app.querySelectorAll('[data-view]').forEach(button => { button.onclick = () => { if (!busy) show(button.dataset.view); }; });
    const logout = app.querySelector('.rb-logout');
    logout.onclick = () => perform(logout, async () => {
      await post('/api/logout');
      user = null;
      campaigns = [];
      location.hash = "/login";
    });
    return app.querySelector('.rb-body');
  }

  function bar(label, value, max, tone = 'teal') {
    return `<div class="rb-bar-line"><svg role="img" aria-label="${e(label)}: ${number.format(value)}" viewBox="0 0 100 8" preserveAspectRatio="none"><rect width="100" height="8" class="rb-bar-track"/><rect width="${value / max * 100}" height="8" class="rb-bar-${tone}"/></svg><span aria-hidden="true">${number.format(value)}</span></div>`;
  }

  function categoriesChart() {
    const categories = new Map();
    for (const item of campaigns) {
      const label = item.category?.trim() || 'Tanpa kategori';
      categories.set(label, (categories.get(label) || 0) + 1);
    }
    const palette = ['#208a8a', '#78b9fa', '#ffcc00', '#86bd17', '#ffa500', '#e99bb8', '#0c5b5b'];
    const entries = [...categories].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'id'));
    let end = 0;
    const segments = entries.map(([label, value], i) => {
      const start = end;
      end = i === entries.length - 1 ? 100 : start + value / campaigns.length * 100;
      return { label, value, color: palette[i % palette.length], start, end };
    });
    return `<section class="rb-panel rb-chart"><div class="rb-section-head"><h2>Kategori kampanye</h2></div>${segments.length ? `<div class="rb-donut" aria-hidden="true" style="--rb-segments: ${segments.map(({color, start, end}) => `${color} ${start}% ${end}%`).join(', ')}"><strong>${number.format(campaigns.length)}</strong></div><table class="rb-category-table" aria-label="Distribusi kategori kampanye"><thead><tr><th scope="col">Kategori</th><th scope="col">Jumlah</th></tr></thead><tbody>${segments.map(({label, value, color}) => `<tr><th scope="row"><span class="rb-swatch" aria-hidden="true" style="--rb-swatch: ${color}"></span>${e(label)}</th><td>${number.format(value)}</td></tr>`).join('')}</tbody></table>` : '<p>Belum ada kategori untuk ditampilkan.</p>'}</section>`;
  }

  function growthChart(users) {
    const months = new Map();
    for (const account of users) {
      if (!account.created_at) continue;
      const created = new Date(account.created_at);
      if (!Number.isFinite(created.getTime())) continue;
      const key = Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), 1);
      months.set(key, (months.get(key) || 0) + 1);
    }
    const entries = [...months].sort((a, b) => a[0] - b[0]);
    const max = entries.reduce((largest, [, value]) => Math.max(largest, value), 1);
    return `<section class="rb-panel rb-chart"><div class="rb-section-head"><h2>Pendaftaran pengguna per bulan</h2></div><p class="rb-chart-note">Berdasarkan tanggal pendaftaran (UTC) dari akun yang masih terdaftar. Hanya bulan dengan data yang ditampilkan.</p>${entries.length ? entries.map(([key, value]) => { const label = month.format(key); return `<div class="rb-chart-row"><strong>${e(label)}</strong>${bar(`Pendaftaran ${label}`, value, max)}</div>`; }).join('') : '<p>Belum ada tanggal pendaftaran untuk ditampilkan.</p>'}</section>`;
  }

  function overview(body, users) {
    const totals = campaigns.reduce((result, item) => [result[0] + count(item.views), result[1] + count(item.downloads)], [0, 0]);
    const popular = [...campaigns].sort((a, b) => count(b.views) - count(a.views)).slice(0, 6);
    const max = Math.max(1, ...popular.map(item => Math.max(count(item.views), count(item.downloads))));
    const metrics = [['Kampanye', campaigns.length, 'campaigns'], ['Tayangan', totals[0], 'views'], ['Unduhan', totals[1], 'downloads']];
    if (users) metrics.push(['Pengguna', users.length, 'accounts']);
    body.innerHTML = `<section class="rb-hero"><div><span class="rb-kicker">RUANG UNTUK BERKREASI</span><h2>Buat bingkai, bagikan ceritamu.</h2><p>Siapkan kampanye baru dan ajak orang lain ikut meramaikan momenmu.</p><button class="btn primary" data-hero-create type="button">${icon('create')} Buat kampanye</button></div>
      <svg class="rb-hero-art" viewBox="0 0 300 185" fill="none" aria-hidden="true"><ellipse cx="154" cy="160" rx="119" ry="15" fill="#b3e4cc"/><circle cx="211" cy="77" r="65" fill="#ecf8d5"/><g transform="translate(156 22) rotate(15)"><rect x="5" y="5" width="95" height="115" rx="16" fill="#208a8a"/><rect width="95" height="115" rx="16" fill="#78b9fa"/><rect x="12" y="13" width="71" height="65" rx="10" fill="#eaf6ff"/><circle cx="63" cy="33" r="10" fill="#ffcc00"/><path d="m14 71 21-24 15 15 12-11 19 20v7H14Z" fill="#208a8a"/><path d="M20 94h38" stroke="#0c5b5b" stroke-width="5" stroke-linecap="round"/></g><g transform="translate(51 47) rotate(-12)"><rect x="5" y="5" width="107" height="112" rx="17" fill="#208a8a"/><rect width="107" height="112" rx="17" fill="#fffdf5"/><rect x="12" y="12" width="83" height="70" rx="11" fill="#f8ddea"/><circle cx="54" cy="36" r="13" fill="#ffa500"/><path d="M24 80a30 30 0 0 1 60 0" fill="#86bd17"/><path d="M20 97h52" stroke="#0c5b5b" stroke-width="5" stroke-linecap="round"/></g><path d="M41 19v26m-13-13h26m217 84v30m-15-15h30" stroke="#ffa500" stroke-width="5" stroke-linecap="round"/><circle cx="24" cy="101" r="5" fill="#208a8a"/></svg></section>
      <div class="rb-metrics">${metrics.map(([label, value, key]) => `<article class="rb-metric"><div class="rb-metric-icon">${icon(key)}</div><strong>${number.format(value)}</strong><span>${label}</span></article>`).join('')}</div>
      <div class="rb-charts"><section class="rb-panel rb-chart"><div class="rb-section-head"><h2>Kampanye teratas</h2><button class="btn outline" data-list type="button">Lihat kampanye</button></div>
      ${popular.length ? `<p class="rb-legend"><span>Tayangan</span><span>Unduhan</span></p>${popular.map(item => `<div class="rb-chart-row"><strong>${e(item.title)}</strong>${bar(`Tayangan ${item.title}`, count(item.views), max)}${bar(`Unduhan ${item.title}`, count(item.downloads), max, 'blue')}</div>`).join('')}` : '<p>Belum ada kampanye untuk ditampilkan.</p>'}</section>${categoriesChart()}</div>${users ? growthChart(users) : ''}`;
    body.querySelector('[data-list]').onclick = () => { if (!busy) show('campaigns'); };
    body.querySelector('[data-hero-create]').onclick = () => { if (!busy) show('create'); };
  }

  function campaignList(body) {
    body.innerHTML = `<div class="rb-section-head"><h2>Daftar kampanye</h2><button class="btn primary" type="button" data-new>+ Buat kampanye</button></div>
      ${campaigns.length ? `<div class="rb-campaigns">${campaigns.map((item, i) => `<article class="rb-panel rb-campaign"><div><span class="rb-kicker">${e(item.category || 'Kampanye')}</span><h3>${e(item.title)}</h3><p>${e(item.slug)} · ${e(displayDate(item.created_at))}${item.ownerName ? ` · ${e(item.ownerName)}` : ''}</p><p>${number.format(count(item.views))} tayangan · ${number.format(count(item.downloads))} unduhan</p></div><div class="rb-actions"><button type="button" class="btn outline" data-copy="${i}">Salin tautan</button><button type="button" class="btn outline" data-edit="${i}">Edit</button><button type="button" class="btn outline rb-danger" data-delete="${i}">Hapus</button></div></article>`).join('')}</div>` : '<p class="rb-panel rb-empty">Belum ada kampanye. Buat kampanye pertamamu untuk mulai membagikan bingkai.</p>'}`;
    body.querySelector('[data-new]').onclick = () => { if (!busy) show('create'); };
    body.querySelectorAll('[data-copy]').forEach(button => { button.onclick = () => perform(button, () => copy(new URL(campaignPath(campaigns[button.dataset.copy].slug), location.href.split(/[?#]/)[0]).href)); });
    body.querySelectorAll('[data-edit]').forEach(button => { button.onclick = () => { if (!busy) editor(campaigns[button.dataset.edit]); }; });
    body.querySelectorAll('[data-delete]').forEach(button => {
      button.onclick = () => {
        if (busy) return;
        const item = campaigns[button.dataset.delete];
        if (!confirm(`Hapus kampanye “${item.title}”? Tindakan ini tidak bisa dibatalkan.`)) return;
        perform(button, async () => {
          await api(managePath(item.slug), { method: 'DELETE' });
          toast('Kampanye dihapus.');
          await show('campaigns');
        });
      };
    });
  }

  function editor(item) {
    view = item ? 'edit' : 'create';
    const body = shell(item ? 'campaigns' : 'create', item ? 'Edit kampanye' : 'Buat kampanye', 'Atur informasi dan bingkai yang akan digunakan pengunjung.');
    const frames = [...(item?.frames || [])];
    body.innerHTML = `<form class="rb-panel rb-form rb-editor">
      <label>Judul<input name="title" value="${e(item?.title)}" required></label>
      <label>Slug<input name="slug" value="${e(item?.slug)}" ${item ? 'readonly' : 'required pattern="[a-z0-9]+(-[a-z0-9]+)*"'}><small>${item ? 'Slug tidak dapat diubah setelah kampanye dibuat.' : 'Gunakan huruf kecil, angka, dan tanda hubung.'}</small></label>
      <label>Kategori<input name="category" value="${e(item?.category)}" maxlength="100" required></label>
      <label>Tema<input name="theme" value="${e(item?.theme || 'green')}" pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="32" required><small>Contoh: green.</small></label>
      <label class="rb-full">Deskripsi<textarea name="description" rows="3">${e(item?.description)}</textarea></label>
      <label class="rb-full">Caption<textarea name="caption" rows="3">${e(item?.caption)}</textarea></label>
      <div class="rb-full"><label>Bingkai PNG<input type="file" accept="image/png,.png" multiple><small>Tambahkan beberapa PNG transparan. Bingkai pertama tampil paling awal.</small></label><ol class="rb-frames"></ol></div>
      <p class="rb-status rb-full" role="status"></p><div class="rb-actions rb-full"><button type="submit" class="btn primary">${item ? 'Simpan perubahan' : 'Terbitkan kampanye'}</button><button type="button" class="btn outline" data-cancel>Batal</button></div></form>`;
    const form = body.querySelector('form');
    const frameList = form.querySelector('.rb-frames');
    const picker = form.querySelector('[type=file]');
    const status = form.querySelector('.rb-status');
    const submit = form.querySelector('[type=submit]');
    const renderFrames = () => {
      frameList.innerHTML = frames.map((frame, i) => `<li>${typeof frame === 'string' && (pngData.test(frame) || /^\.\/assets\/frames\/[a-z0-9_-]+\.svg$/i.test(frame) || /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/frames\/[a-z0-9/_.-]+\.png$/i.test(frame)) ? `<img src="${e(frame)}" alt="" width="88" height="88">` : '<div class="rb-frame-placeholder"></div>'}<span>Bingkai ${i + 1}</span><div class="rb-frame-actions">
        <button type="button" data-index="${i}" data-step="-1" aria-label="Majukan bingkai ${i + 1}" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-index="${i}" data-step="1" aria-label="Mundurkan bingkai ${i + 1}" ${i === frames.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-index="${i}" data-remove aria-label="Hapus bingkai ${i + 1}">×</button></div></li>`).join('');
    };
    renderFrames();
    frameList.onclick = event => {
      const button = event.target.closest('button');
      if (!button || busy) return;
      const index = Number(button.dataset.index);
      if (button.hasAttribute('data-remove')) frames.splice(index, 1);
      else {
        const next = index + Number(button.dataset.step);
        [frames[index], frames[next]] = [frames[next], frames[index]];
      }
      renderFrames();
    };
    picker.onchange = async () => {
      if (busy) { picker.value = ''; return; }
      status.textContent = '';
      submit.disabled = true;
      await perform(picker, async () => {
        const results = await Promise.allSettled(Array.from(picker.files, readPng));
        for (const result of results) if (result.status === 'fulfilled') frames.push(result.value);
        status.textContent = results.filter(result => result.status === 'rejected').map(result => errorMessage(result.reason)).join(' ');
        renderFrames();
      }, error => { status.textContent = errorMessage(error); });
      picker.value = '';
      submit.disabled = false;
    };
    form.querySelector('[data-cancel]').onclick = () => { if (!busy) show('campaigns'); };
    form.onsubmit = event => {
      event.preventDefault();
      if (busy) return;
      status.textContent = '';
      if (!frames.length) { status.textContent = 'Tambahkan setidaknya satu bingkai PNG.'; picker.focus(); return; }
      const data = Object.fromEntries(new FormData(form));
      for (const key of Object.keys(data)) data[key] = data[key].trim();
      if (item) data.slug = item.slug;
      data.frames = [...frames];
      perform(submit, async () => {
        await api(item ? managePath(item.slug) : '/api/manage', { method: item ? 'PUT' : 'POST', body: data });
        toast(item ? 'Perubahan disimpan.' : 'Kampanye diterbitkan.');
        await show('campaigns');
      }, error => { status.textContent = errorMessage(error); });
    };
  }

  const protectedAccount = account => account.id === user.id || account.role === 'superadmin' || account.email?.trim().toLowerCase() === 'sit.wicend@gmail.com';
  const canManage = account => isSuperadmin() && account?.id && !protectedAccount(account);

  async function manageAccount(payload) {
    const { data, error } = await sb.functions.invoke('manage-users', { body: payload });
    if (error) {
      let response;
      try { response = await error.context?.json?.(); } catch { /* Not a JSON function response. */ }
      if (typeof response?.error === 'string' && response.error.trim()) throw new Error(response.error);
      if (error.context?.status === 404) throw new Error('Fungsi manage-users belum tersedia. Hubungi pengelola situs.');
      throw new Error('Tidak dapat menghubungi layanan pengelolaan akun. Coba lagi atau hubungi pengelola situs.');
    }
    if (typeof data?.error === 'string' && data.error.trim()) throw new Error(data.error);
    if (!(payload.action === 'delete' ? data?.ok === true : data?.user)) throw new Error('Layanan tidak mengonfirmasi perubahan akun. Muat ulang daftar sebelum mencoba lagi.');
  }

  function accountDialog(body, account, action) {
    if (busy || !canManage(account)) return;
    const deleting = action === 'delete';
    if (deleting && !account.email) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'rb-panel rb-account-dialog';
    dialog.setAttribute('aria-labelledby', 'rb-account-title');
    dialog.setAttribute('aria-describedby', 'rb-account-help');
    dialog.innerHTML = `<form class="rb-form"><h2 id="rb-account-title">${deleting ? 'Hapus akun login' : 'Edit akun pengguna'}</h2>
      ${deleting ? `<p id="rb-account-help"><strong>Penghapusan akun login permanen dan tidak bisa dibatalkan.</strong> Kampanye tetap ada tanpa pemilik (owner = NULL). Jika akun masih memiliki objek di Storage, server mungkin menolak penghapusan.</p><label>Ketik email <strong>${e(account.email)}</strong> untuk mengonfirmasi<input name="confirmation" type="email" required autocomplete="off" spellcheck="false" autofocus></label>` : `<p id="rb-account-help">${e(account.email)} · Email dan kata sandi tidak dapat diubah di sini.</p><label>Nama<input name="name" value="${e(account.name)}" maxlength="100" required autofocus></label><label>Peran<select name="role"><option value="user">Pengguna</option><option value="admin" ${account.role === 'admin' ? 'selected' : ''}>Admin</option></select></label>`}
      <p class="rb-status" role="alert"></p><div class="rb-actions"><button type="submit" class="btn ${deleting ? 'outline rb-danger' : 'primary'}">${deleting ? 'Hapus permanen' : 'Simpan perubahan'}</button><button type="button" class="btn outline" data-cancel>Batal</button></div></form>`;
    const form = dialog.querySelector('form');
    const status = dialog.querySelector('.rb-status');
    const submit = form.querySelector('[type=submit]');
    const cancel = form.querySelector('[data-cancel]');
    cancel.onclick = () => { if (!busy) dialog.close(); };
    dialog.oncancel = event => { if (busy) event.preventDefault(); };
    dialog.onclose = () => dialog.remove();
    form.onsubmit = event => {
      event.preventDefault();
      if (busy || !canManage(account)) return;
      status.textContent = '';
      const payload = { action, userId: account.id };
      if (deleting) {
        if (form.elements.confirmation.value.trim().toLowerCase() !== account.email.trim().toLowerCase()) {
          status.textContent = 'Email konfirmasi tidak cocok.';
          form.elements.confirmation.focus();
          return;
        }
        payload.confirmation = account.email;
      } else {
        payload.name = form.elements.name.value.trim();
        payload.role = form.elements.role.value;
        if (!payload.name || !['user', 'admin'].includes(payload.role)) {
          status.textContent = 'Masukkan nama dan pilih peran Pengguna atau Admin.';
          return;
        }
      }
      cancel.disabled = true;
      perform(submit, async () => {
        await manageAccount(payload);
        dialog.close();
        toast(deleting ? 'Akun login dihapus.' : 'Perubahan akun disimpan.');
        await show('accounts');
        app.querySelector('.rb-heading h1')?.focus();
      }, error => { status.textContent = errorMessage(error); }).finally(() => { cancel.disabled = false; });
    };
    body.append(dialog);
    dialog.showModal();
  }

  function accounts(body, users) {
    body.innerHTML = users.length ? `<div class="rb-panel rb-table" role="region" aria-label="Daftar akun pengguna" tabindex="0"><table><thead><tr><th scope="col">Nama</th><th scope="col">Email</th><th scope="col">Peran</th><th scope="col">Terdaftar</th>${isSuperadmin() ? '<th scope="col">Tindakan</th>' : ''}</tr></thead><tbody>${users.map((account, i) => `<tr><td>${e(account.name)}</td><td>${e(account.email)}</td><td>${e(account.role || (account.isAdmin ? 'admin' : 'user'))}</td><td>${e(displayDate(account.created_at))}</td>${isSuperadmin() ? `<td>${canManage(account) ? `<div class="rb-actions"><button type="button" class="btn outline" data-account="${i}" data-action="update" aria-label="Edit akun ${e(account.email || account.name)}">Edit</button>${account.email ? `<button type="button" class="btn outline rb-danger" data-account="${i}" data-action="delete" aria-label="Hapus akun ${e(account.email)}">Hapus</button>` : ''}</div>` : 'Dilindungi'}</td>` : ''}</tr>`).join('')}</tbody></table></div>` : '<p class="rb-panel rb-empty">Belum ada akun pengguna.</p>';
    body.querySelectorAll('[data-account]').forEach(button => { button.onclick = () => accountDialog(body, users[button.dataset.account], button.dataset.action); });
  }

  async function show(next) {
    if (!canView(next)) return;
    if (next === 'create') { editor(); return; }
    view = next;
    const subtitles = { overview: 'Pantau performa kampanye dalam satu tempat.', campaigns: 'Kelola kampanye dan bagikan tautannya.', accounts: 'Lihat akun yang terdaftar di wicend-twibbon.', settings: 'Kelola identitas situs dan isi halaman depan.' };
    const body = shell(next, tabs[next], subtitles[next]);
    body.innerHTML = '<p role="status">Memuat…</p>';
    try {
      if (next === 'settings') {
        await settingsPanel(body, { sb, esc, perform, onSaved: onSiteSettingsSaved });
        return;
      }
      const [data, users] = await Promise.all([
        api(next === 'accounts' ? '/api/users' : '/api/manage'),
        next === 'overview' && isAdmin() ? api('/api/users') : undefined,
      ]);
      if (view !== next || !app.contains(body)) return;
      if (next === 'accounts') accounts(body, data);
      else {
        campaigns = data;
        if (next === 'overview') overview(body, users);
        else campaignList(body);
      }
    } catch (error) {
      if (!app.contains(body)) return;
      body.innerHTML = `<p class="rb-status" role="alert">${e(errorMessage(error))}</p><button type="button" class="btn outline">Coba lagi</button>`;
      body.querySelector('button').onclick = () => { if (!busy) show(next); };
    }
  }

  user = (await api('/api/me')).user;
  if (!app.isConnected) return;
  if (user) await show('overview');
  else location.hash = '/login';
}
