# Pembaruan superadmin dan editor

1. Cadangkan database lewat Supabase sebelum upgrade. Jalankan seluruh `UPGRADE-SUPERADMIN.sql` di SQL Editor pada proyek yang sudah memakai skema GitHub Pages final. Skrip tidak menggantikan instalasi dasar `supabase.sql` atau migrasi skema Cloudflare.
2. Akun `sit.wicend@gmail.com` harus sudah terdaftar dan emailnya terkonfirmasi. Migrasi memberi peran superadmin hanya kepada akun terverifikasi tersebut. Jika belum ada, daftar/konfirmasi dahulu, lalu jalankan ulang migrasi. Logout/login sesudahnya.
3. Upload berkas aplikasi baru ke root repo yang sama. **Pertahankan nilai Project URL dan anon/publishable key milikmu di config.js.** Jangan menimpa konfigurasi dengan key kosong dari ZIP. Jangan gunakan service_role di browser.
4. Dashboard superadmin menyediakan pengaturan landing, identitas situs, favicon dan gambar share. Pengguna biasa tidak memiliki hak menulis pengaturan.

## Thumbnail WhatsApp/Facebook

`index.html` kini mempunyai Open Graph statis dan gambar default `assets/share-card.png` ukuran 1200×630. URL gambar harus publik dan memakai HTTPS. Setelah deployment selesai, platform dapat membaca metadata ini, tetapi hasil dan cache preview ditentukan platform.

Perubahan pengaturan di Supabase tampil dinamis pada browser. **Crawler WhatsApp tidak menjalankan JavaScript**: untuk menerapkan judul/gambar share baru, publikasikan metadata statis setelah menyimpan pengaturan. Dari folder aplikasi di komputer dengan Node.js 24+, jalankan:

```powershell
node scripts/publish-metadata.mjs https://sitwicend.github.io/wicend-twibbon/
```

Upload/commit `index.html` hasilnya ke repo. Alternatif tanpa Node: edit langsung nilai `og:title`, `og:description`, `og:image` dalam `index.html` di GitHub. Gunakan URL gambar hasil upload pada pengaturan. Deploy ulang lalu uji dengan tautan baru; preview lama mungkin tetap tersimpan di cache. Thumbnail per kampanye tidak dapat dibedakan memakai URL `#/c/...` karena hash tidak dikirim ke crawler; membutuhkan halaman HTML per kampanye atau hosting yang menghasilkan metadata server-side.

## Foto dan AI

Brightness dan contrast default 100% mempertahankan foto asli. Foto dipaskan ke area transparan bingkai secara best-effort; desain dengan beberapa lubang atau area transparan dekoratif mungkin membutuhkan penyesuaian manual. Hapus background mengunduh model AI dan memproses di browser, membutuhkan koneksi, RAM dan waktu. Ini bukan jaminan potongan sempurna, khususnya rambut halus, latar serupa warna pakaian, atau banyak subjek. Gunakan pemulihan foto asli bila hasil kurang cocok. Periksa lisensi paket/model pihak ketiga sebelum penggunaan komersial.

## Uji setelah deploy

- Login superadmin, lihat daftar akun dan ubah pengaturan; login kreator biasa dan pastikan menu pengaturan tidak tersedia.
- Uji upload favicon/gambar share, simpan, lalu muat ulang.
- Uji foto potret, hapus background, pulihkan asli, paskan foto, reset dan ekspor PNG pada rasio 1:1 dan 9:16.
- Pastikan migrasi SQL berhasil. Pengujian database produksi dan hasil segmentasi AI harus dilakukan pada proyek/perangkat nyata, bukan diasumsikan dari pemeriksaan sintaks.
