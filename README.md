# wicend-twibbon — GitHub Pages

1. Buat repository **Public** bernama `wicend-twibbon`.
2. Ekstrak ZIP. Di GitHub pilih **Add file → Upload files**, unggah isi hasil ekstrak (termasuk `covers/` dan `frames/`), lalu **Commit changes**. Pastikan `index.html` terlihat langsung di halaman utama repo, bukan di dalam subfolder. Jangan unggah ZIP-nya sebagai satu file.
3. Buka **Settings → Pages**, pilih **Deploy from a branch**, branch **main**, folder **/ (root)**, lalu **Save**.
4. Tunggu deploy sukses di tab **Actions**, lalu klik **Visit site** di **Settings → Pages**. URL normal: `https://USERNAME.github.io/wicend-twibbon/`.

Versi ini mendukung jelajah, pemasangan foto, pilihan rasio, ekspor PNG HD dan berbagi tautan tanpa server. Foto tetap di perangkat. Ubah `campaigns.js` dan tambahkan file bingkai ke `frames/` untuk memperbarui kampanye. Login, dashboard, dan statistik server tersedia di paket backend Cloudflare + Supabase, bukan di GitHub Pages.

Jika 404, cek hasil deploy, nama repo, branch dan posisi `index.html`. Jika gambar tidak terlihat, pastikan kedua folder aset ikut terunggah dengan nama dan huruf yang sama. Uji melalui URL HTTPS, bukan dengan klik dua kali pada `index.html` (modul JS bisa diblokir pada `file://`).
