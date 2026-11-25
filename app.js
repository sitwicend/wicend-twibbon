import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { dashboard } from './dashboard.js';
import { editor } from './editor.js';
import { loadSiteSettings, applySiteSettings } from './settings.js';
let currentSiteSettings = {};

const app = document.querySelector('#app');
export const esc = (s='') => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let supabase;
let diagShown = false;

function diagnostic(msg, type='error') {
  if (diagShown) return;
  diagShown = true;
  const cls = type === 'warn' ? 'rb-status' : 'rb-status';
  app.innerHTML = `<section class="wrap rb-auth"><div class="rb-panel rb-auth-panel"><h2>Konfigurasi belum lengkap</h2><p class="${cls}">${esc(msg)}</p><p>Periksa <strong>config.js</strong>, <strong>PANDUAN.md</strong>, dan pastikan SQL sudah dijalankan di Supabase Dashboard.</p><button class="btn outline" onclick="location.reload()">Coba lagi</button></div></section>`;
}

// Publishable key baru (sb_publishable_...) atau legacy anon JWT. service_role ditolak.
function validKey(key) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  try {
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'anon';
  } catch { return false; }
}

try {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    diagnostic('SUPABASE_URL atau SUPABASE_KEY kosong. Isi keduanya di config.js dengan nilai dari Supabase Dashboard.');
  } else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL)) {
    diagnostic('SUPABASE_URL tidak valid. Gunakan Project URL dari Supabase Dashboard (https://xxx.supabase.co, tanpa /auth/v1 atau path tambahan).');
  } else if (!validKey(SUPABASE_KEY)) {
    diagnostic('SUPABASE_KEY bukan publishable/anon key. Salin "Publishable key" atau legacy "anon public" dari Settings > API. Jangan pernah memakai service_role.');
  } else {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm')
      .catch(() => { throw new Error('Pustaka Supabase gagal diunduh dari cdn.jsdelivr.net. Periksa koneksi internet, pemblokir iklan, atau kebijakan CSP.'); });
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    // Tangani redirect dari email konfirmasi maupun reset kata sandi.
    const callback = new URLSearchParams(location.hash.replace(/^#\/?/, '').replace(/^[^?]*\?/, ''));
    const kind = callback.get('type');
    const { data: { session } } = await supabase.auth.getSession();
    if (callback.has('error') || callback.has('error_description')) {
      history.replaceState(null, '', '#/login');
      queueMicrotask(() => toast('Tautan email sudah kedaluwarsa atau tidak berlaku. Minta tautan baru.'));
    } else if (kind) {
      history.replaceState(null, '', session ? (kind === 'recovery' ? '#/reset-password' : '#/dashboard') : '#/login');
      if (!session) queueMicrotask(() => toast('Tautan email tidak dapat diverifikasi. Minta tautan baru.'));
    }
  }
} catch (err) {
  supabase = undefined;
  diagnostic(`Gagal memuat Supabase: ${err.message}`);
}

// Ubah galat Supabase menjadi pesan yang bisa ditindaklanjuti.
function describe(error) {
  const code = error?.code || '';
  const message = error?.message || 'Permintaan gagal.';
  if (['42P01', 'PGRST205'].includes(code) || /relation .* does not exist/i.test(message)) {
    return 'Tabel belum ada. Jalankan seluruh isi supabase.sql di Supabase Dashboard > SQL Editor.';
  }
  if (code === 'PGRST202' || /function .* does not exist/i.test(message)) {
    return 'Fungsi RPC belum ada. Jalankan ulang supabase.sql agar increment_views dan increment_downloads terbuat.';
  }
  if (code === '42501' || /row-level security/i.test(message)) {
    return 'Ditolak oleh Row Level Security. Pastikan kamu pemilik kampanye dan policy pada supabase.sql sudah dibuat.';
  }
  if (/Invalid API key|JWT/i.test(message)) {
    return 'Kunci API tidak valid. Salin ulang publishable/anon key ke config.js.';
  }
  if (/Failed to fetch|NetworkError/i.test(message)) {
    return 'Tidak dapat menghubungi Supabase. Periksa Project URL di config.js dan koneksi internet.';
  }
  if (/Bucket not found/i.test(message)) {
    return 'Bucket Storage "frames" belum ada. Jalankan bagian bucket pada supabase.sql.';
  }
  return message;
}

export async function api(path, options = {}) {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi. Isi config.js sesuai PANDUAN.md.');
  
  const method = options.method || 'GET';
  const body = options.body;

  if (path === '/api/me') {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error(describe(sessionError));
    if (!session) return { user: null };
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!user) return { user: null };
    const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
    return { user: { id: user.id, email: user.email, name: profile?.name || '', role: profile?.role || 'user' } };
  }

  if (path === '/api/login') {
    const { data, error } = await supabase.auth.signInWithPassword({ email: body.email, password: body.password });
    if (error) throw error;
    return { user: data.user };
  }

  if (path === '/api/register') {
    const redirectTo = location.href.split(/[?#]/)[0];
    const { data, error } = await supabase.auth.signUp({
      email: body.email,
      password: body.password,
      options: { data: { name: body.name }, emailRedirectTo: redirectTo }
    });
    if (error) throw error;
    return { user: data.user, confirmationRequired: !data.session };
  }

  if (path === '/api/logout') {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return {};
  }

  if (path === '/api/campaigns') {
    const { data, error } = await supabase.from('campaigns').select('*').eq('published', true).order('created_at', { ascending: false });
    if (error) throw new Error(describe(error));
    return data.map(c => ({
      slug: c.slug,
      title: c.title,
      category: c.category,
      theme: c.theme,
      description: c.description,
      caption: c.caption,
      frames: c.frames || [],
      views: c.views || 0,
      downloads: c.downloads || 0,
      created_at: c.created_at,
      ownerName: c.owner_name
    }));
  }

  if (path.startsWith('/api/campaigns/') && method === 'GET') {
    const slug = decodeURIComponent(path.split('/')[3]);
    const { data, error } = await supabase.from('campaigns').select('*').eq('slug', slug).eq('published', true).single();
    if (error) throw error;
    return {
      slug: data.slug,
      title: data.title,
      category: data.category,
      theme: data.theme,
      description: data.description,
      caption: data.caption,
      frames: data.frames || [],
      views: data.views || 0,
      downloads: data.downloads || 0,
      created_at: data.created_at,
      ownerName: data.owner_name,
      published: data.published
    };
  }

  if (/^\/api\/campaigns\/[^/]+\/view$/.test(path) && method === 'POST') {
    const slug = decodeURIComponent(path.split('/')[3]);
    const { error } = await supabase.rpc('increment_views', { campaign_slug: slug });
    if (error) console.warn('View increment:', error.message);
    return {};
  }

  if (/^\/api\/campaigns\/[^/]+\/download$/.test(path) && method === 'POST') {
    const slug = decodeURIComponent(path.split('/')[3]);
    const { error } = await supabase.rpc('increment_downloads', { campaign_slug: slug });
    if (error) console.warn('Download increment:', error.message);
    return {};
  }

  if (path === '/api/manage' && method === 'GET') {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Belum login.');
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = ['admin', 'superadmin'].includes(profile?.role);
    
    let query = supabase.from('campaigns').select('*').order('created_at', { ascending: false });
    if (!isAdmin) query = query.eq('owner', user.id);
    
    const { data, error } = await query;
    if (error) throw error;
    return data.map(c => ({
      slug: c.slug,
      title: c.title,
      category: c.category,
      theme: c.theme,
      description: c.description,
      caption: c.caption,
      frames: c.frames || [],
      views: c.views || 0,
      downloads: c.downloads || 0,
      created_at: c.created_at,
      ownerName: c.owner_name,
      published: c.published
    }));
  }

  if (path === '/api/manage' && method === 'POST') {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Belum login.');
    
    // Upload frames to Storage
    const uploadedFrames = [];
    for (let i = 0; i < body.frames.length; i++) {
      const frame = body.frames[i];
      if (frame.startsWith('data:image/png;base64,')) {
        const base64 = frame.split(',')[1];
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        if (bytes.length > 5 * 1024 * 1024) throw new Error(`Bingkai ${i + 1} lebih dari 5 MB.`);
        
        const filename = `${user.id}/${body.slug}/frame-${i}-${Date.now()}.png`;
        const { error: uploadError } = await supabase.storage.from('frames').upload(filename, bytes, { contentType: 'image/png', upsert: false });
        if (uploadError) throw new Error(`Gagal upload bingkai ${i + 1}: ${uploadError.message}`);
        
        const { data: { publicUrl } } = supabase.storage.from('frames').getPublicUrl(filename);
        uploadedFrames.push(publicUrl);
      } else {
        uploadedFrames.push(frame);
      }
    }

    const { data: profile } = await supabase.from('profiles').select('name').eq('id', user.id).single();
    const insert = {
      slug: body.slug,
      title: body.title,
      category: body.category,
      theme: body.theme,
      description: body.description || '',
      caption: body.caption || '',
      frames: uploadedFrames,
      owner: user.id,
      owner_name: profile?.name || '',
      published: true
    };

    const { error } = await supabase.from('campaigns').insert(insert);
    if (error) throw error;
    return { slug: body.slug };
  }

  if (path.startsWith('/api/manage/') && method === 'PUT') {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Belum login.');
    
    const slug = decodeURIComponent(path.split('/')[3]);
    const { data: existing, error: fetchError } = await supabase.from('campaigns').select('owner, frames').eq('slug', slug).single();
    if (fetchError) throw fetchError;
    
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = ['admin', 'superadmin'].includes(profile?.role);
    if (existing.owner !== user.id && !isAdmin) throw new Error('Tidak memiliki akses.');

    const uploadedFrames = [];
    for (let i = 0; i < body.frames.length; i++) {
      const frame = body.frames[i];
      if (frame.startsWith('data:image/png;base64,')) {
        const base64 = frame.split(',')[1];
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        if (bytes.length > 5 * 1024 * 1024) throw new Error(`Bingkai ${i + 1} lebih dari 5 MB.`);
        
        const filename = `${user.id}/${slug}/frame-${i}-${Date.now()}.png`;
        const { error: uploadError } = await supabase.storage.from('frames').upload(filename, bytes, { contentType: 'image/png', upsert: false });
        if (uploadError) throw new Error(`Gagal upload bingkai ${i + 1}: ${uploadError.message}`);
        
        const { data: { publicUrl } } = supabase.storage.from('frames').getPublicUrl(filename);
        uploadedFrames.push(publicUrl);
      } else {
        uploadedFrames.push(frame);
      }
    }

    const update = {
      title: body.title,
      category: body.category,
      theme: body.theme,
      description: body.description || '',
      caption: body.caption || '',
      frames: uploadedFrames
    };

    const { error } = await supabase.from('campaigns').update(update).eq('slug', slug);
    if (error) throw error;
    // Delete old frames from storage
    const oldFrames = existing.frames || [];
    for (const oldUrl of oldFrames) {
      if (oldUrl.startsWith(SUPABASE_URL + '/storage/v1/object/public/frames/') && !uploadedFrames.includes(oldUrl)) {
        const path = oldUrl.split('/frames/')[1];
        if (path) await supabase.storage.from('frames').remove([path]);
      }
    }

    return { slug };
  }

  if (path.startsWith('/api/manage/') && method === 'DELETE') {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Belum login.');
    
    const slug = decodeURIComponent(path.split('/')[3]);
    const { data: existing, error: fetchError } = await supabase.from('campaigns').select('owner, frames').eq('slug', slug).single();
    if (fetchError) throw fetchError;
    
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = ['admin', 'superadmin'].includes(profile?.role);
    if (existing.owner !== user.id && !isAdmin) throw new Error('Tidak memiliki akses.');

    const { error } = await supabase.from('campaigns').delete().eq('slug', slug);
    if (error) throw error;
    // Delete frames from storage
    const frames = existing.frames || [];
    for (const url of frames) {
      if (url.startsWith(SUPABASE_URL + '/storage/v1/object/public/frames/')) {
        const path = url.split('/frames/')[1];
        if (path) await supabase.storage.from('frames').remove([path]);
      }
    }

    return {};
  }

  if (path === '/api/users' && method === 'GET') {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Belum login.');
    
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!['admin', 'superadmin'].includes(profile?.role)) throw new Error('Hanya admin yang dapat melihat daftar pengguna.');
    
    const { data, error } = await supabase.from('profiles').select('id, name, email, role, created_at').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  throw new Error('Endpoint tidak dikenali.');
}

let timer;
export function toast(text) {
  const t = document.querySelector('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => t.classList.remove('show'), 3200);
}

export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Berhasil disalin.');
  } catch {
    const input = document.createElement('textarea');
    input.value = text;
    document.body.append(input);
    input.select();
    const ok = document.execCommand('copy');
    input.remove();
    if (ok) toast('Berhasil disalin.');
    else window.prompt('Salin teks berikut:', text);
  }
}

const num = n => new Intl.NumberFormat('id-ID').format(n);
const covers = { 'bumi-lebih-hijau': 'bumi', 'semangat-merdeka': 'merdeka', 'generasi-belajar': 'belajar' };
const card = c => `<article class="card"><a class="cover ${esc(c.theme)}" href="#/c/${encodeURIComponent(c.slug)}"><img src="${esc(covers[c.slug] ? `./assets/covers/${covers[c.slug]}.svg` : c.frames[0])}" alt="Pratinjau ${esc(c.title)}" loading="lazy"></a><div class="cardbody"><div class="cardmeta"><span class="pill ${esc(c.theme)}">${esc(c.category)}</span><small>↓ ${num(c.downloads)} unduhan</small></div><h3><a href="#/c/${encodeURIComponent(c.slug)}">${esc(c.title)}</a></h3><p>${esc(c.description)}</p><a class="cardlink" href="#/c/${encodeURIComponent(c.slug)}">Pakai Bingkai <span>→</span></a></div></article>`;

async function home(app, landing) {
  document.querySelectorAll('.nav nav a').forEach(a => a.removeAttribute('aria-current'));
  document.querySelector(`.nav nav a[href="${landing ? '#/' : '#/jelajah'}"]`)?.setAttribute('aria-current', 'page');
  
  app.innerHTML = `${landing ? `<section class="hero"><div class="wrap herogrid"><div class="herocopy"><div class="eyebrow hero-pill"><span>✨</span> BINGKAI DIGITAL, AKSI NYATA</div><h1>Satu bingkai,<br>banyak <em>cerita.</em></h1><p>Rayakan momen, suarakan dukungan, dan sebarkan semangat baik dengan Twibbon buatan komunitas.</p><div class="actions"><a class="btn primary" href="#/jelajah">Jelajahi Kampanye <span>↗</span></a><a class="btn outline" href="#/dashboard">🎨 Buat Kampanye</a></div><div class="perks"><span>✓ Tanpa login</span><span>✓ Gratis</span><span>✓ Tanpa watermark</span></div></div><div class="heroart"><img src="./assets/hero.svg" alt="Ilustrasi tiga bingkai kampanye komunitas"></div></div></section>` : ''}<section id="kampanye" class="wrap discovery"><div class="sectionhead"><div><div class="eyebrow"><span>✨</span> DARI KOMUNITAS UNTUK KOMUNITAS</div><h2>Jelajahi Kampanye</h2><p>Temukan bingkai yang mewakili ceritamu.</p></div><label class="search"><span aria-hidden="true">🔍</span><input type="search" id="search" placeholder="Cari kampanye…" aria-label="Cari kampanye"></label></div><div class="filters"><div id="categories" class="chips" aria-label="Kategori"></div><label class="sort"><span>Urutkan:</span> <select id="sort"><option value="trending">Trending</option><option value="new">Terbaru</option><option value="popular">Terbanyak dipakai</option></select></label></div><div class="grid" id="results" aria-live="polite">Memuat kampanye…</div></section>${landing ? `<section class="wrap"><div class="how"><div class="eyebrow">🚀 MUDAH DALAM 3 LANGKAH</div><h2>Siap membagikan ceritamu?</h2><div class="steps"><div><b>01</b><h3>Pilih bingkai</h3><p>Temukan kampanye yang ingin kamu dukung.</p></div><div><b>02</b><h3>Pasang fotomu</h3><p>Unggah dan sesuaikan foto langsung di perangkat.</p></div><div><b>03</b><h3>Unduh & bagikan</h3><p>Simpan hasilnya dan ajak teman ikut mendukung.</p></div></div></div></section>` : ''}`;
  
  let campaigns;
  try {
    campaigns = await api('/api/campaigns');
  } catch (err) {
    app.querySelector('#results').innerHTML = `<div class="empty"><strong>Kampanye belum bisa dimuat.</strong><p>${esc(err.message)}</p><button type="button" class="btn outline sm" onclick="location.reload()">Coba lagi</button></div>`;
    return;
  }
  
  let category = '';
  const categories = ['Lingkungan', 'Hari Besar Nasional', 'Pendidikan', 'Organisasi', 'Acara Kampus', 'Ulang Tahun', ...campaigns.map(c => c.category)];
  const chips = app.querySelector('#categories'), results = app.querySelector('#results'), search = app.querySelector('#search'), sort = app.querySelector('#sort');
  
  const render = () => {
    const q = search.value.trim().toLowerCase();
    const list = campaigns.filter(c => (!category || c.category === category) && `${c.title} ${c.category} ${c.description}`.toLowerCase().includes(q));
    const age = c => Math.max(0, (Date.now() - new Date(c.created_at)) / 86400000) || 0;
    const score = c => (c.downloads * 2 + c.views) / Math.sqrt(1 + age(c));
    list.sort((a, b) => sort.value === 'new' ? new Date(b.created_at) - new Date(a.created_at) : sort.value === 'popular' ? b.downloads - a.downloads : score(b) - score(a));
    results.innerHTML = list.length ? list.map(card).join('') : '<p class="empty">Tidak ada kampanye yang cocok. Coba kata kunci atau kategori lain.</p>';
  };
  
  chips.innerHTML = ['', ...new Set(categories)].map(c => `<button type="button" class="chip" data-category="${esc(c)}" aria-pressed="${!c}">${esc(c || 'Semua Kampanye')}</button>`).join('');
  chips.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    category = b.dataset.category;
    chips.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    render();
  });
  search.addEventListener('input', render);
  sort.addEventListener('change', render);
  render();
}

async function auth(mode = 'login', message = '') {
  const register = mode === 'register';
  const forgot = mode === 'forgot';
  
  if (forgot) {
    app.innerHTML = `<section class="wrap rb-auth"><div class="rb-auth-intro"><span class="rb-kicker">LUPA KATA SANDI</span><h1>Reset kata sandimu</h1><p>Kami akan mengirim tautan reset ke emailmu.</p></div><div class="rb-panel rb-auth-panel">
      <form class="rb-form"><h2>Reset kata sandi</h2>
      <label>Email<input name="email" type="email" autocomplete="email" required></label>
      <p class="rb-status" role="status">${esc(message)}</p>
      <button class="btn primary" type="submit">Kirim tautan reset</button>
      <button type="button" class="btn outline" data-back>Kembali ke masuk</button></form></div></section>`;
    
    app.querySelector('[data-back]').onclick = () => auth('login');
    const form = app.querySelector('form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const status = form.querySelector('.rb-status');
      status.textContent = '';
      const submit = form.querySelector('[type=submit]');
      submit.disabled = true;
      try {
        const email = new FormData(form).get('email');
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: location.href.split(/[?#]/)[0]
        });
        if (error) throw error;
        auth('login', 'Periksa email untuk tautan reset kata sandi.');
      } catch (error) {
        status.textContent = error.message || 'Gagal mengirim tautan reset.';
      } finally {
        submit.disabled = false;
      }
    };
    return;
  }
  
  app.innerHTML = `<section class="wrap rb-auth"><div class="rb-auth-intro"><span class="rb-kicker">RUANG KREATOR</span><h1>Buat bingkai untuk momen yang berarti.</h1><p>Terbitkan kampanye, kelola bingkai, dan pantau jangkauannya dari satu ruang.</p></div><div class="rb-panel rb-auth-panel">
    <div class="rb-auth-tabs" aria-label="Pilihan akun"><button type="button" class="btn ${register ? 'outline' : 'primary'}" aria-pressed="${!register}" data-auth="login">Masuk</button><button type="button" class="btn ${register ? 'primary' : 'outline'}" aria-pressed="${register}" data-auth="register">Daftar</button></div>
    <form class="rb-form"><h2>${register ? 'Buat akun' : 'Masuk ke akunmu'}</h2>
    ${register ? '<label>Nama<input name="name" autocomplete="name" required></label>' : ''}
    <label>Email<input name="email" type="email" autocomplete="email" required></label>
    <label>Kata sandi<input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" required></label>
    <p class="rb-status" role="status">${esc(message)}</p>
    <button class="btn primary" type="submit">${register ? 'Daftar' : 'Masuk'}</button>
    ${!register ? '<button type="button" class="btn outline" data-forgot>Lupa kata sandi?</button>' : ''}</form></div></section>`;
  
  app.querySelectorAll('[data-auth]').forEach(button => {
    button.onclick = () => auth(button.dataset.auth);
  });
  
  app.querySelector('[data-forgot]')?.addEventListener('click', () => auth('forgot'));
  
  const form = app.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const status = form.querySelector('.rb-status');
    status.textContent = '';
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    try {
      const result = await api(`/api/${mode}`, { method: 'POST', body: Object.fromEntries(new FormData(form)) });
      if (register && result.confirmationRequired) {
        auth('login', 'Periksa email (termasuk folder spam), konfirmasi pendaftaran, lalu masuk.');
        return;
      }
      if (location.hash === '#/dashboard') route();
      else location.hash = '/dashboard';
    } catch (error) {
      status.textContent = error.message || 'Terjadi kesalahan. Coba lagi.';
    } finally {
      submit.disabled = false;
    }
  };
}

async function resetPassword() {
  app.innerHTML = `<section class="wrap rb-auth"><div class="rb-auth-intro"><span class="rb-kicker">KATA SANDI BARU</span><h1>Buat kata sandi baru</h1><p>Masukkan kata sandi baru untuk akunmu.</p></div><div class="rb-panel rb-auth-panel">
    <form class="rb-form"><h2>Kata sandi baru</h2>
    <label>Kata sandi baru<input name="password" type="password" autocomplete="new-password" minlength="6" required></label>
    <p class="rb-status" role="status"></p>
    <button class="btn primary" type="submit">Simpan kata sandi</button></form></div></section>`;
  const form = app.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const status = form.querySelector('.rb-status');
    status.textContent = '';
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    try {
      const password = new FormData(form).get('password');
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast('Kata sandi berhasil diubah.');
      location.hash = '/dashboard';
    } catch (error) {
      status.textContent = error.message || 'Gagal mengubah kata sandi. Buka ulang tautan reset dari email.';
    } finally {
      submit.disabled = false;
    }
  };
}

const helpers = { api, esc, toast, copy, sb: supabase, onSiteSettingsSaved(settings) { currentSiteSettings = settings; applySiteSettings(settings); } };
if (supabase) {
  try { currentSiteSettings = await loadSiteSettings(supabase); }
  catch (error) { console.warn(error.message); }
}

async function route() {
  if (!supabase) return;
  
  const hash = location.hash.slice(1) || '/';
  const path = hash.split('?')[0];
  
  try {
    if (path === '/' || path === '') {
      await home(app, true);
      applySiteSettings(currentSiteSettings);
    } else if (path === '/jelajah') {
      await home(app, false);
    } else if (path === '/login' || path === '/register') {
      auth(path.slice(1));
    } else if (path === '/reset-password') {
      await resetPassword();
    } else if (path === '/dashboard') {
      await dashboard(app, helpers);
    } else if (path.startsWith('/c/')) {
      await editor(app, decodeURIComponent(path.slice(3)), helpers);
    } else {
      app.innerHTML = `<section class="wrap error"><h1>Halaman tidak tersedia</h1><p>Halaman yang kamu cari tidak ditemukan.</p><a class="btn primary" href="#/">Kembali ke beranda</a></section>`;
    }
  } catch (err) {
    app.innerHTML = `<section class="wrap error"><h1>Terjadi kesalahan</h1><p>${esc(err.message)}</p><a class="btn primary" href="#/">Kembali ke beranda</a></section>`;
  }
}

window.addEventListener('hashchange', route);
route();
