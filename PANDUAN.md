# Panduan Deploy wicend-twibbon ke GitHub Pages

Ikuti langkah-langkah berikut untuk mendeploy aplikasi wicend-twibbon Anda ke GitHub Pages dengan backend Supabase.

---

## 1. Buat Proyek Supabase Baru

1. Buka [supabase.com](https://supabase.com/) dan login.
2. Klik **New Project**.
3. Isi nama proyek, database password (simpan baik-baik!), pilih region terdekat (misalnya `Southeast Asia (Singapore)`).
4. Tunggu proyek selesai dibuat (~2 menit).

---

## 2. Jalankan Skema SQL

1. Di dashboard Supabase, buka **SQL Editor** (menu kiri).
2. Klik **New query**.
3. Buka file `supabase.sql` dari folder proyek ini, **salin seluruh isinya**.
4. Paste ke SQL Editor dan klik **Run** (atau tekan `Ctrl+Enter`).
5. Jika berhasil, Anda akan melihat "Success. No rows returned." di bagian bawah.

**Apa yang dilakukan SQL ini:**
- Membuat tabel `profiles` untuk menyimpan data pengguna (nama, email, role).
- Membuat tabel `campaigns` untuk kampanye twibbon.
- Membuat fungsi helper `is_admin()` dan trigger otomatis saat user baru register.
- Mengatur Row Level Security (RLS) agar data aman: publik hanya bisa baca campaign published, owner bisa CRUD miliknya, admin bisa kelola semua.
- Membuat bucket Storage `frames` untuk menyimpan file bingkai PNG.
- Menyisipkan 3 kampanye contoh dengan bingkai SVG lokal dari folder `assets/`.

**Gunakan proyek Supabase BARU untuk paket final ini.** Skema versi Cloudflare sebelumnya berbeda; jangan menjalankan SQL ini di atas tabel lama. Skrip ini dapat diulang pada proyek yang sudah memakai skema final yang sama, tetapi bukan alat migrasi dari versi lama. Jika membuat proyek baru, ganti URL yang sudah diisi di `config.js` dengan Project URL baru.

---

## 3. Konfigurasi Authentication

1. Di dashboard Supabase, buka **Authentication > URL Configuration**.
2. Isi **Site URL** dengan URL GitHub Pages Anda:
   ```
   https://USERNAME.github.io/REPO-NAME/
   ```
   Contoh: `https://johndoe.github.io/wicend-twibbon/`
   
   **Penting:** Pastikan diakhiri dengan `/` (slash).

3. Tambahkan **Redirect URLs** berikut (satu per baris):
   ```
   https://USERNAME.github.io/REPO-NAME/**
   ```
   Wildcard `**` memperbolehkan redirect dari hash routing dan konfirmasi email.

4. Simpan perubahan.

5. *(Opsional untuk produksi)* Konfigurasi **Email Templates** di **Authentication > Email Templates** untuk mengatur custom SMTP dan template email konfirmasi/reset password. Untuk testing, Supabase menyediakan SMTP default (email bisa masuk spam).

---

## 4. Salin Konfigurasi ke `config.js`

1. Di dashboard Supabase, buka **Settings > API**.
2. Salin **Project URL** (misal: `https://abcdefghij.supabase.co`).
3. Salin **anon public** key (panjang, diawali `eyJ...`). **JANGAN** salin `service_role` key.
4. Buka file `config.js` di folder proyek:
   ```js
   export const SUPABASE_URL = 'https://abcdefghij.supabase.co';
   export const SUPABASE_KEY = 'eyJ...panjang-sekali...';
   ```
5. Simpan file.

**Verifikasi:**
- `SUPABASE_URL` harus `https://xxx.supabase.co` (tanpa `/auth/v1` atau path tambahan).
- `SUPABASE_KEY` adalah publishable/anon key (aman untuk browser), **bukan** service_role.

---

## 5. Upload ke GitHub

1. **Buat repository baru** di GitHub (misalnya `wicend-twibbon`). Bisa public atau private.
2. Upload **semua file dan folder** dari direktori `wicend-twibbon-final` ke **root repository**, yaitu:
   ```
   wicend-twibbon/
   ├── index.html
   ├── config.js
   ├── app.js
   ├── editor.js
   ├── dashboard.js
   ├── style.css
   ├── editor.css
   ├── dashboard.css
   ├── supabase.sql
   ├── PANDUAN.md
   ├── 404.html
   ├── .nojekyll
   └── assets/
       ├── hero.svg
       ├── covers/
       │   ├── bumi.svg
       │   ├── merdeka.svg
       │   └── belajar.svg
       └── frames/
           ├── bumi.svg
           ├── bumi-alt.svg
           ├── merdeka.svg
           └── belajar.svg
   ```

   **Jangan** upload sebagai subfolder atau dalam file ZIP. File `index.html` harus berada di root repository.

3. Commit dan push ke branch `main` atau `master`.

---

## 6. Aktifkan GitHub Pages

1. Di repository GitHub, buka **Settings > Pages**.
2. Di **Source**, pilih branch `main` (atau `master`) dan folder `/root`.
3. Klik **Save**.
4. Tunggu ~1 menit, lalu refresh halaman. Anda akan melihat URL deployment:
   ```
   https://USERNAME.github.io/REPO-NAME/
   ```
5. Klik URL tersebut atau buka di browser baru.

---

## 7. Checklist Testing

Setelah deploy, lakukan testing berikut:

- [ ] **Halaman beranda** (`#/`) tampil dengan hero, tombol "Jelajahi Kampanye", dan 3 kampanye contoh di bawah.
- [ ] **Halaman jelajah** (`#/jelajah`) menampilkan daftar kampanye. Coba search, filter kategori, dan ubah sorting.
- [ ] **Halaman editor** (`#/c/bumi-lebih-hijau`) membuka editor bingkai. Upload foto atau ambil dari kamera, geser foto dengan mouse/touch, ubah zoom/rotate/brightness/filter, pilih rasio, unduh PNG HD. Pastikan PNG tanpa watermark dan sisi terpanjangnya 1200–2400 piksel. Ukuran berkas bergantung pada foto.
- [ ] **Share buttons**: WhatsApp, Facebook, X membuka dialog share di tab baru. Tombol "Bagikan hasil" (native file share) berfungsi di mobile. Salin link dan caption.
- [ ] **Register** akun baru: masukkan nama, email, password. Cek email (termasuk spam) untuk link konfirmasi. Klik link, lalu login.
- [ ] **Login** dengan akun yang sudah dikonfirmasi. Redirect otomatis ke dashboard.
- [ ] **Dashboard > Ringkasan** menampilkan metrik (jumlah kampanye, tayangan, unduhan) dan chart "Kampanye teratas".
- [ ] **Dashboard > Kampanye** menampilkan daftar kampanye milik user. Klik "Buat kampanye" untuk buat baru.
- [ ] **Dashboard > Buat kampanye**: isi judul, slug (hanya huruf kecil & `-`), kategori, tema, deskripsi, caption. Upload 1-3 file PNG transparan (<5 MB per file). Klik "Terbitkan kampanye". Kampanye muncul di daftar dan publik.
- [ ] **Dashboard > Edit kampanye**: ubah judul/deskripsi, tambah/hapus/reorder bingkai. Slug tidak bisa diubah. Simpan perubahan.
- [ ] **Dashboard > Hapus kampanye**: konfirmasi, kampanye dan bingkai di Storage terhapus.
- [ ] **Logout** dari dashboard, kembali ke halaman login.
- [ ] **Lupa password**: masukkan email, cek email untuk link reset. Klik link, masukkan password baru (fitur ini memerlukan custom SMTP untuk produksi).

Jika salah satu gagal, lihat **Troubleshooting** di bawah.

---

## 8. Jadikan User Pertama sebagai Admin

Secara default, semua user baru memiliki role `user`. Untuk memberikan akses admin (melihat semua kampanye dan akun pengguna):

1. Register akun pertama Anda melalui web, lalu konfirmasi email dan login.
2. Kembali ke **Supabase Dashboard > SQL Editor**.
3. Jalankan SQL berikut (ganti `admin@example.com` dengan email Anda):
   ```sql
   update public.profiles
   set role = 'admin'
   where email = 'admin@example.com';
   ```
4. Logout dan login kembali di aplikasi.
5. Menu **Akun pengguna** kini muncul di dashboard. Anda bisa melihat semua user dan mengelola semua kampanye.

---

## Troubleshooting

### "SUPABASE_URL atau SUPABASE_KEY kosong"
- Periksa file `config.js`, pastikan kedua variabel diisi dengan benar (tanpa spasi atau karakter tersembunyi).
- Jangan lupa commit dan push `config.js` yang sudah diisi ke GitHub.

### "SUPABASE_URL tidak valid"
- `SUPABASE_URL` harus `https://xxx.supabase.co` (tanpa `/auth/v1`, `/rest/v1`, atau path tambahan).
- Salin dari **Settings > API > Project URL**.

### "Gagal memuat Supabase"
- Periksa koneksi internet.
- Cek browser console (`F12` > Console). Jika ada error CORS atau CSP, pastikan GitHub Pages tidak memblokir CDN jsdelivr.net.
- Verifikasi `app.js` memuat Supabase JS v2 dari `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm`.

### "Kampanye belum bisa dimuat" atau "Network error"
- Pastikan SQL sudah dijalankan (`supabase.sql`) dan tabel `campaigns` ada.
- Cek RLS policies di **Database > Tables > campaigns > Policies**. Harus ada policy `campaigns_read_published`.
- Verifikasi seed data berhasil diinsert (buka **Table Editor > campaigns**, harus ada 3 baris).

### Email konfirmasi tidak diterima
- Cek folder spam/promosi.
- Verifikasi **Site URL** dan **Redirect URLs** di **Authentication > URL Configuration** sudah benar dan diakhiri `/`.
- Untuk produksi, konfigurasi custom SMTP di **Authentication > Email Templates** (Supabase SMTP default sering masuk spam).

### "Gagal upload bingkai"
- Pastikan bucket Storage `frames` ada dan public (cek **Storage** di dashboard).
- Verifikasi policies storage.objects ada (SQL bagian 9). Policy `frames_read_public`, `frames_insert_own`, `frames_update_own`, `frames_delete_own_or_admin`.
- File harus PNG, maksimal 5 MB. Jangan upload JPEG atau WebP untuk bingkai.
- Jika error "Bucket not found", jalankan ulang SQL bagian 8:
  ```sql
  insert into storage.buckets (id, name, public)
  values ('frames', 'frames', true)
  on conflict (id) do update set public = true;
  ```

### "Tidak memiliki akses" saat edit/delete campaign
- Pastikan Anda login sebagai owner campaign atau admin.
- Cek `campaigns.owner` di Table Editor, harus berisi UUID user Anda. Jika null, berarti campaign adalah seed data publik; hanya admin bisa edit.

### Canvas editor tidak menampilkan foto
- Periksa browser console. Jika ada error CORS, bingkai dari Supabase Storage harus public (bucket `frames` public = true).
- Jika bingkai dari URL eksternal, server harus kirim header `Access-Control-Allow-Origin: *`. Bingkai lokal (`./assets/frames/*.svg`) tidak ada masalah CORS.

### Halaman tidak ter-redirect setelah konfirmasi email
- Pastikan **Redirect URLs** di **Authentication > URL Configuration** mengandung `https://USERNAME.github.io/REPO-NAME/**`.
- Cek URL konfirmasi di email, harus mengandung `access_token` dan `type=signup`.
- Jika tetap gagal, coba logout dan login manual.

---

## Catatan Keamanan

1. **Jangan pernah** taruh `service_role` key di `config.js` atau commit ke GitHub. Service role key adalah admin-level access key yang hanya boleh ada di server backend, bukan di browser.
2. `anon` / `publishable` key aman untuk browser. RLS policies akan membatasi akses sesuai role user.
3. Semua operasi sensitif (increment views/downloads, insert/update/delete campaign, read user list) dilindungi oleh RLS dan security definer functions.
4. User tidak bisa mengubah role mereka sendiri (dicegah oleh policy `profiles_update_own`).
5. Frames disimpan di Storage bucket public, tapi hanya owner folder (auth.uid()) yang bisa insert/update, dan owner atau admin yang bisa delete.

---

## Custom Domain (Opsional)

Jika Anda ingin menggunakan domain sendiri (misal `twibbon.example.com`):

1. Di GitHub Pages settings, tambahkan **Custom domain** dan verifikasi DNS.
2. Update **Site URL** dan **Redirect URLs** di Supabase Authentication dengan domain baru:
   ```
   Site URL: https://twibbon.example.com/
   Redirect URLs: https://twibbon.example.com/**
   ```
3. Jangan lupa update `config.js` jika base path berubah (tapi biasanya tidak perlu).

---

## Dukungan

Jika Anda mengalami masalah yang tidak tercantum di Troubleshooting, periksa:
- **Supabase Dashboard > API Logs** untuk melihat request yang gagal.
- **Browser Console** (`F12` > Console) untuk error JavaScript.
- **Network tab** (`F12` > Network) untuk melihat HTTP status code dan response body.

Selamat mencoba! 🎨🚀
