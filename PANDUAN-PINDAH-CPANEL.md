# Panduan Pindah i-Pantas ke cPanel

Untuk: orang yang akan memasang sistem ini di cPanel.

## Ringkasan (baca dulu)

Sistem ini ada **3 bahagian**. Hanya satu yang berpindah ke cPanel.

| Bahagian | Di mana sekarang | Selepas pindah |
|---|---|---|
| Laman web (`public/`: `index.html`, `app.js`, `style.css`) | Netlify | **cPanel** (`public_html`) |
| Pangkalan data, login, simpanan fail | Supabase | **Kekal di Supabase**, tak perlu pindah |
| 2 tugas berjadual (`archive-to-drive`, `cleanup-old-files`) | Netlify Functions | **cPanel Cron Job** (guna `cpanel/run-function.js`) |

Laman web hanya fail statik, jadi memang boleh dipindahkan terus. Tugas berjadual **tidak akan jalan sendiri** di cPanel. Tanpa langkah 4, fail lampiran tidak akan disalin ke Google Drive dan fail lama tidak akan dibersihkan.

**Tiada kod aplikasi yang perlu diubah.** Alamat Supabase dalam `app.js` kekal sama.

## Sebelum mula: semak hosting cPanel

Tanya penyedia hosting atau lihat dalam cPanel:

1. **HTTPS / SSL aktif** untuk domain. Wajib. Boleh guna AutoSSL atau Let's Encrypt.
2. **Terminal atau SSH**, dan **Node.js 18 atau lebih baharu** (cari "Setup Node.js App" atau "Terminal" dalam cPanel). Perlu untuk langkah 4.
3. **Cron Jobs** tersedia dalam cPanel.

Jika Node.js tiada di hosting, lihat bahagian "Jika Node.js tiada" di hujung.

## Langkah 1: Muat naik laman web

1. Dapatkan kod terkini: `git clone https://github.com/Harris73/e-Aduan-Permohonan-Pembangunan-PPD-Pontian.git` (cabang `main`), atau muat turun ZIP dari GitHub.
2. Dalam cPanel, buka **File Manager** dan masuk ke `public_html` (atau folder subdomain).
3. Muat naik **hanya 3 fail ini** dari folder `public/`:
   - `index.html`
   - `app.js`
   - `style.css`
4. Salin kandungan `cpanel/htaccess.txt` ke `public_html/.htaccess`. Fail ini memaksa HTTPS dan menutup senarai folder.

> **Jangan** muat naik `.env`, `node_modules`, `netlify/`, `supabase/`, `.git` atau `preview.html` ke `public_html`. Fail-fail itu boleh dibaca oleh sesiapa jika berada di sini.

## Langkah 2: Semak tetapan Supabase

Log masuk ke dashboard Supabase (projek `hlxspdqxkvjwlbnifzkg`):

1. **Authentication → URL Configuration**: tukar **Site URL** kepada domain baharu, contohnya `https://aduan.contoh.my`. Tambah juga domain itu dalam **Redirect URLs**.
2. Log masuk menggunakan username dan kata laluan, jadi domain Netlify lama boleh dibiarkan sementara sehingga peralihan selesai.

Tidak perlu ubah RLS, jadual atau storage.

## Langkah 3: Uji laman web

Buka domain baharu dan semak satu per satu:

- [ ] Halaman login muncul dengan font dan gaya penuh
- [ ] Login sebagai Guru Besar berjaya. Hantar satu aduan ujian dengan gambar dan PDF.
- [ ] Login sebagai Pegawai PPD berjaya. Aduan tadi muncul dalam senarai giliran.
- [ ] Tab sejarah berfungsi
- [ ] Buka laman di telefon. Susun atur sepatutnya muat skrin.
- [ ] Padam atau tandakan siap aduan ujian itu

Jika ada ralat, buka Console pelayar (F12) dan hantar mesej ralat kepada pemilik sistem.

## Langkah 4: Pasang tugas berjadual (cron)

Dua tugas ini dahulunya jalan di Netlify. Di cPanel ia dijalankan oleh Cron Job melalui skrip `cpanel/run-function.js`.

### 4a. Letak kod di luar `public_html`

Di File Manager atau SSH, letak projek di folder **di luar** `public_html`, contohnya `/home/NAMAPENGGUNA/ipantas/`.

```bash
cd ~
git clone https://github.com/Harris73/e-Aduan-Permohonan-Pembangunan-PPD-Pontian.git ipantas
cd ipantas
npm install --omit=dev
```

`npm install` memasang `@supabase/supabase-js` yang diperlukan kedua-dua tugas. Jika terminal tiada, guna "Setup Node.js App" dalam cPanel dan tekan **Run NPM Install**.

### 4b. Buat fail `.env`

```bash
cp env.example .env
```

Isi nilai sebenar dalam `.env`:

```
SUPABASE_URL=https://hlxspdqxkvjwlbnifzkg.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...        # service_role dari Supabase > Project Settings > API
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
GDRIVE_FOLDER_ID=...
DRIVE_PUBLIC_LINKS=false
```

Nilai Google dan `service_role` diambil daripada **Netlify → Site settings → Environment variables**. Minta daripada pemilik sistem.

Kunci `service_role` memintas semua keselamatan pangkalan data. Pastikan:

```bash
chmod 600 .env
```

dan `.env` **tidak** berada dalam `public_html`.

### 4c. Uji secara manual

```bash
node cpanel/run-function.js archive-to-drive
node cpanel/run-function.js cleanup-old-files
```

Jawapan yang betul ialah `200 Nothing to archive` atau `200 Archived N, failed 0`. Jika keluar `Missing env: ...`, ada nilai dalam `.env` yang belum diisi.

### 4d. Tambah Cron Job

cPanel → **Cron Jobs** → **Add New Cron Job**. Gantikan `NAMAPENGGUNA` dan laluan `node` dengan yang sebenar. Taip `which node` di terminal untuk dapatkan laluan itu. Pada hosting dengan Node Selector, laluan biasanya seperti `/home/NAMAPENGGUNA/nodevenv/ipantas/18/bin/node`.

| Tugas | Jadual | Arahan |
|---|---|---|
| Salin fail ke Google Drive | Setiap 10 minit (`*/10 * * * *`) | `cd /home/NAMAPENGGUNA/ipantas && node cpanel/run-function.js archive-to-drive >> cron.log 2>&1` |
| Bersihkan fail lama (>6 bulan) | Setiap hari 3:00 pagi (`0 3 * * *`) | `cd /home/NAMAPENGGUNA/ipantas && node cpanel/run-function.js cleanup-old-files >> cron.log 2>&1` |

Selepas 10 hingga 15 minit, semak `cron.log` untuk memastikan tugas berjalan. Fail baharu yang dihantar sepatutnya mendapat pautan Google Drive.

## Langkah 5: Matikan yang lama di Netlify

Lakukan ini **selepas** langkah 3 dan 4 berjaya:

1. Di Netlify, matikan atau padam site lama supaya fungsi berjadual tidak jalan dua kali (cron cPanel dan Netlify serentak).
2. Beritahu pengguna tentang alamat baharu.

## Kemas kini pada masa depan

Setiap kali kod `public/` berubah, muat naik semula `index.html`, `app.js` dan `style.css` ke `public_html`. Jika fail `netlify/functions/*.js` berubah, jalankan `git pull` dalam folder `ipantas`.

## Jika Node.js tiada di hosting

Pilihan paling mudah ialah **biarkan hanya 2 fungsi berjadual di Netlify** (percuma), dan hos laman web di cPanel:

1. Kekalkan site Netlify, tetapi laman web sebenar ada di cPanel.
2. Pastikan pembolehubah persekitaran di Netlify masih ada, dan jangan padam site itu.
3. Langkah 4 dan 5 tidak diperlukan.

Pilihan lain ialah menulis semula kedua-dua fungsi dalam PHP, tetapi itu kerja tambahan dan perlu diuji semula.

## Perkara keselamatan

- Fail `.env` lama yang mengandungi kunci akaun perkhidmatan Google masih ada dalam sejarah git. **Kunci itu perlu diputar semula (rotate)** di Google Cloud Console.
- Jangan letak `.env` atau kunci `service_role` dalam `public_html`.
- Kunci Supabase dalam `app.js` ialah kunci *publishable* dan selamat untuk berada di sana.

## Masalah biasa

| Masalah | Sebab dan penyelesaian |
|---|---|
| Halaman putih atau gaya tiada | Fail `style.css` atau `app.js` tidak dimuat naik ke folder yang sama dengan `index.html` |
| Login gagal "tiada akses" | Peranan yang dipilih tidak sepadan dengan peranan pengguna dalam Supabase. Ini bukan isu cPanel. |
| Lampiran tidak sampai ke Google Drive | Cron belum jalan atau `.env` tidak lengkap. Semak `cron.log`. |
| `node: command not found` dalam cron | Guna laluan penuh ke `node` dalam arahan cron |
| `fetch is not defined` | Versi Node terlalu lama. Tukar kepada Node 18 atau lebih baharu. |
