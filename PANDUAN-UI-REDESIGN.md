# Panduan: Gabung Reka Bentuk Baru UI i-Pantas

Panduan ini untuk pemilik repo (Harris73). Ia disediakan oleh SyazAwie, dengan bantuan Claude Code.

Tak perlu mahir Git untuk ikut panduan ini. Setiap arahan ada penerangan: apa fungsinya, apa yang patut keluar di skrin, dan apa nak buat kalau keluar ralat. Ikut ikut urutan, satu bahagian pada satu masa.

> **Penting:** Bahagian 8 (Perkara Kritikal) mengandungi perkara keselamatan yang perlu dibuat **segera**, walaupun kau belum merge UI ini. Baca bahagian itu dahulu kalau masa terhad.

---

## Isi kandungan

1. [Ringkasan: apa yang berubah](#1-ringkasan-apa-yang-berubah)
2. [Sebelum mula: simpan kerja kau dahulu](#2-sebelum-mula-simpan-kerja-kau-dahulu)
3. [Cara A (disyorkan): Pull Request di GitHub](#3-cara-a-disyorkan-pull-request-di-github)
4. [Cara B: merge melalui terminal](#4-cara-b-merge-melalui-terminal)
5. [Kalau berlaku merge conflict](#5-kalau-berlaku-merge-conflict)
6. [Uji sebelum deploy](#6-uji-sebelum-deploy)
7. [Cara patah balik kalau ada masalah](#7-cara-patah-balik-kalau-ada-masalah)
8. [Perkara kritikal ⚠️](#8-perkara-kritikal)
9. [Glosari](#9-glosari)

---

## 1. Ringkasan: apa yang berubah

Semua perubahan ada dalam branch **`ui-redesign`**. Berbanding `main` kau sekarang (commit `ac446e3`), hanya **4 fail** yang berubah:

| Fail | Apa yang berubah |
|---|---|
| `public/index.html` | Markup baru: skrin log masuk penuh, navbar, borang dengan zon seret-lepas, tab PPD, kad sejarah |
| `public/app.js` | Bahagian yang **memaparkan** data sahaja (templat HTML, animasi, toast) |
| `public/style.css` | Reka bentuk baru sepenuhnya |
| `CLAUDE.md` | Nota projek untuk Claude Code (boleh diabaikan kalau kau tak guna Claude Code) |

### ✅ Yang TIDAK diubah

**Logik Supabase tidak disentuh langsung.** Semua 15 panggilan `sb.*` dalam `public/app.js` sama seperti dalam commit kau:
- log masuk dan semakan peranan
- hantar aduan, termasuk `emergency_level`
- muat naik fail
- hantar maklum balas siasatan
- Tanda Selesai
- carian dan penapis sejarah

Setiap peringkat migrasi disemak secara automatik untuk memastikan perkara ini. Nama fungsi global, ID elemen HTML, dan nilai `<select>` (contoh `Kecemasan`, `Kritikal`, `ppd_officer`) juga kekal sama.

Fungsi Netlify (`netlify/functions/`), `netlify.toml`, `package.json` dan fail `supabase/` **tidak diubah**.

### 🎨 Reka bentuk baru

- **Gaya:** gaya dashboard moden, fon Inter, dan ikon SVG menggantikan emoji.
- **Log masuk:** skrin penuh dengan panel biru di kiri; jadi satu lajur di telefon.
- **Guru Besar:** borang dalam kad, dengan kotak Tahap Kecemasan yang mengembang bila "Kecemasan" dipilih.
  - Gambar dan PDF boleh diseret ke zon muat naik, dengan pratonton dan butang buang.
  - Pembilang aksara pada tajuk dan keterangan.
- **PPD:** setiap kad aduan ada penunjuk langkah **Siasatan → Maklum Balas → Selesai**.
  - Tanda Selesai berkunci dengan tooltip sehingga maklum balas dihantar.
  - Statistik di atas senarai, dan queue auto muat semula setiap 60 saat.
- **Sejarah:** carian dan penapis; klik aduan untuk lihat garis masa dan maklum balas.
- **Animasi halus:** semuanya dimatikan untuk pengguna yang set *reduced motion* di komputer mereka.
- **Responsif:** kemas pada lebar telefon 360px.

### 🐛 Pepijat yang dibetulkan

| Pepijat | Sebelum | Sekarang |
|---|---|---|
| **Kelipan log masuk** | Setiap kali muat semula halaman, skrin log masuk berkelip sekejap walaupun dah log masuk | Skrin "Memuatkan sistem..." dipaparkan dulu |
| **Tersangkut di skrin loading** | Kalau internet lambat atau CDN gagal, halaman tersangkut | Selepas 8 saat, skrin log masuk muncul. Kalau supabase-js gagal dimuatkan, mesej "Gagal memuatkan sistem..." dipaparkan |
| **Ralat sejarah tersorok** | Bila sejarah gagal dimuatkan (contohnya rangkaian putus), keluar "Tiada rekod", jadi pengguna ingat memang tiada aduan | Mesej ralat sebenar dipaparkan |
| **Draf maklum balas hilang** | Bila PPD hantar maklum balas untuk satu kad, seluruh senarai dimuat semula, dan teks yang sedang ditaip di kad **lain** hilang | Draf (teks, fail dipilih, borang terbuka) dipelihara setiap kali senarai dimuat semula |
| **Respons carian lapuk** | Kalau menaip carian dengan pantas, hasil carian lama kadang-kadang tiba lewat dan menimpa hasil terbaru | Hasil lama diabaikan |
| **`alert()` menyekat skrin** | Semua mesej guna pop-up `alert()` | Toast kecil di bawah skrin. No. Rujukan aduan kekal dipaparkan dalam panel hijau supaya boleh disalin |
| **Bendera 🇲🇾 di Windows** | Keluar huruf "MY", bukan bendera | Diganti dengan logo inisial "iP" |

---

## 2. Sebelum mula: simpan kerja kau dahulu

Sebelum gabung apa-apa, pastikan kerja kau sendiri selamat. Langkah ini mengambil masa 2 minit dan boleh elak kerja hilang.

### 2.1 Buka terminal di folder projek

**Dalam VS Code:** buka folder projek (*File → Open Folder*), kemudian buka terminal (*Terminal → New Terminal*). Pastikan di kanan atas panel terminal tertulis `powershell`.

### 2.2 Semak sama ada ada perubahan belum di-commit

```powershell
git status
```

**Fungsi:** tunjuk fail yang kau ubah tapi belum di-commit.

**Output yang mungkin:**

- `nothing to commit, working tree clean`: tiada kerja tertunggak. Teruskan ke 2.3.
- Senarai fail di bawah `Changes not staged for commit` atau `Untracked files`: ada kerja belum disimpan. Pilih **satu** daripada dua cara di bawah.

**Pilihan 1: commit kerja itu** (kalau kerja itu memang nak disimpan):

```powershell
git add -A
git commit -m "Simpan kerja sebelum gabung UI baru"
```

- `git add -A` memilih semua fail yang berubah.
- `git commit` menyimpannya sebagai satu titik dalam sejarah.
- Output yang patut keluar: `[main abc1234] Simpan kerja sebelum gabung UI baru`, diikuti bilangan fail.

**Pilihan 2: simpan sementara dengan `git stash`** (kalau kerja itu belum siap dan kau tak nak commit lagi):

```powershell
git stash push -u -m "kerja saya sebelum UI baru"
```

- **Fungsi:** menyimpan semua perubahan (termasuk fail baru, kerana `-u`) ke dalam "laci" sementara, dan folder kau kembali bersih.
- **Output:** `Saved working directory and index state On main: kerja saya sebelum UI baru`
- Untuk lihat apa yang ada dalam laci: `git stash list`
- Untuk keluarkan semula **selepas** selesai merge: `git stash pop`

> ❗ **Kalau `git stash pop` keluar ralat `CONFLICT`:** kerja kau bertembung dengan perubahan baru. Lihat Bahagian 5. Kerja kau tidak hilang; ia kekal dalam stash sehingga konflik diselesaikan.

### 2.3 Semak sama ada ada commit belum di-push

```powershell
git fetch origin
git log origin/main..main --oneline
```

- `git fetch` memuat turun maklumat terkini dari GitHub, **tanpa** mengubah fail kau.
- `git log origin/main..main` menyenaraikan commit yang ada di komputer kau tapi belum ada di GitHub.

**Output:**
- **Kosong (tiada apa-apa):** semua commit dah di-push. Bagus.
- **Ada senarai commit:** push dahulu:

```powershell
git push origin main
```

Output yang patut keluar berakhir dengan sesuatu seperti `main -> main`.

> ❗ **Ralat `rejected ... (fetch first)`:** ada commit baru di GitHub yang kau belum ada. Jalankan `git pull origin main`, kemudian ulang `git push origin main`.

### 2.4 Buat branch backup (jaring keselamatan)

```powershell
git branch backup-sebelum-redesign main
git push origin backup-sebelum-redesign
```

**Fungsi:**
- Arahan pertama membuat salinan `main` sekarang dengan nama `backup-sebelum-redesign`.
- Arahan kedua menyimpan salinan itu di GitHub juga.
- Kalau apa-apa jadi selepas ini, kau boleh kembali ke keadaan ini (lihat Bahagian 7).

**Output:**
- Arahan pertama tiada output (itu normal).
- Arahan kedua keluar `* [new branch] backup-sebelum-redesign -> backup-sebelum-redesign`.

> ❗ **Ralat `a branch named 'backup-sebelum-redesign' already exists`:** kau dah pernah buat backup dengan nama ini. Guna nama lain, contohnya `backup-sebelum-redesign-2`.

---

## 3. Cara A (disyorkan): Pull Request di GitHub

Pull Request (PR) ialah cara paling selamat. Kau boleh **tengok setiap baris yang berubah** sebelum terima, dan GitHub akan beritahu kalau ada konflik.

### 3.1 Cari PR

SyazAwie akan push branch `ui-redesign` dan buka PR untuk kau.

1. Buka repo di GitHub: `https://github.com/Harris73/e-Aduan-Permohonan-Pembangunan-PPD-Pontian`
2. Klik tab **Pull requests** (di bawah nama repo).
3. Klik PR yang bertajuk lebih kurang "UI redesign".

> Kalau tiada PR di situ, tapi branch `ui-redesign` sudah ada (klik butang branch `main` di halaman utama repo untuk tengok senarai branch):
> 1. Klik **Pull requests → New pull request**.
> 2. Pilih **base: `main`** di kiri dan **compare: `ui-redesign`** di kanan.
> 3. Klik **Create pull request**, isi tajuk, kemudian klik **Create pull request** sekali lagi.

### 3.2 Semak perubahan dalam tab "Files changed"

1. Dalam halaman PR, klik tab **Files changed**.
2. Kau akan nampak 4 fail. Bagi setiap fail:
   - **Hijau (`+`)** = baris ditambah. **Merah (`-`)** = baris dibuang.
   - Klik **⋯ → View file** untuk tengok fail penuh.
   - Tandakan kotak **Viewed** di kanan atas fail selepas kau baca. GitHub akan lipat fail itu supaya senang jejak mana yang dah disemak.
3. **Fokus utama untuk `public/app.js`:** cari `sb.` (tekan `Ctrl+F` dalam pelayar). Setiap baris yang mengandungi `sb.from`, `sb.auth` atau `sb.storage` patut sama seperti kod kau.
   - Kalau baris itu berwarna, semak sama ada ia cuma beralih kedudukan atau inden (contohnya dimasukkan ke dalam `try`), bukan berubah isinya.
4. Kalau ada soalan pada baris tertentu, klik ikon **+** biru di sebelah nombor baris untuk tinggalkan komen.

### 3.3 Pratonton Netlify (semak dahulu sama ada aktif)

Netlify boleh buat **Deploy Preview**, iaitu laman ujian khas untuk setiap PR, dengan URL sendiri. Laman sebenar tidak terjejas. **Jangan anggap ciri ini aktif. Semak dahulu:**

1. Log masuk ke [app.netlify.com](https://app.netlify.com) dan pilih site i-Pantas.
2. Pergi ke **Site configuration → Build & deploy → Continuous deployment**, dan cari bahagian **Deploy Previews**.
3. Kalau tertulis **Any pull request against your production branch**, ciri ini aktif.

**Kalau aktif:**
- Dalam PR di GitHub, tunggu beberapa minit. Bot Netlify akan tinggalkan komen dengan pautan **Deploy Preview**.
- Buka pautan itu dan jalankan ujian dalam Bahagian 6.

> ⚠️ Deploy Preview **bersambung ke pangkalan data Supabase sebenar**. Apa sahaja yang kau hantar semasa uji akan masuk ke data sebenar. Tandakan aduan ujian dengan tajuk "UJIAN – sila abaikan", dan padam selepas itu (lihat Bahagian 8).

**Kalau tidak aktif:** guna Cara B (Bahagian 4) untuk uji di komputer sendiri dahulu.

### 3.4 Merge

1. Di bahagian bawah tab **Conversation** dalam PR, kau patut nampak **This branch has no conflicts with the base branch**.
   - Kalau keluar **This branch has conflicts**, lihat Bahagian 5.
2. Klik anak panah ▾ di sebelah butang hijau, dan pilih **Create a merge commit**. Pilihan ini memudahkan patah balik nanti (Bahagian 7).
3. Klik **Merge pull request**, kemudian **Confirm merge**.
4. Netlify akan deploy `main` yang baru secara automatik (kalau auto-deploy aktif). Pantau di **Deploys** dalam dashboard Netlify.

### 3.5 Kemas kini komputer kau

```powershell
git switch main
git pull origin main
```

**Fungsi:** tukar ke branch `main`, kemudian ambil hasil merge dari GitHub.

**Output:**
- `Switched to branch 'main'`
- Kemudian senarai fail yang berubah, dengan perkataan `Fast-forward`.

---

## 4. Cara B: merge melalui terminal

Guna cara ini kalau kau nak **uji di komputer sendiri** sebelum merge.

### 4.1 Ambil branch `ui-redesign`

```powershell
git fetch origin
git switch -c semak-ui-redesign origin/ui-redesign
```

**Fungsi:**
- `git fetch` memuat turun branch terbaru dari GitHub.
- `git switch -c` mencipta branch tempatan `semak-ui-redesign` daripada `ui-redesign`, kemudian bertukar ke branch itu. Fail dalam folder kau kini versi UI baru.

**Output:** `Switched to a new branch 'semak-ui-redesign'`

> ❗ **Ralat `invalid reference: origin/ui-redesign`:** branch itu belum ada dalam repo kau. Mungkin SyazAwie buka PR dari fork. Guna nombor PR (nampak dalam URL PR, contohnya `/pull/3`):
> ```powershell
> git fetch origin pull/3/head:semak-ui-redesign
> git switch semak-ui-redesign
> ```
> Tukar `3` dengan nombor PR sebenar.

> ❗ **Ralat `Your local changes ... would be overwritten`:** ada kerja belum disimpan. Kembali ke Bahagian 2.2.

### 4.2 Uji

Ikut Bahagian 6.

### 4.3 Merge ke `main` (selepas puas hati)

```powershell
git switch main
git pull origin main
git merge --no-ff semak-ui-redesign -m "Merge UI redesign"
git push origin main
```

**Fungsi setiap baris:**
1. Tukar balik ke `main`.
2. Pastikan `main` kau terkini.
3. Gabungkan UI baru ke `main`. `--no-ff` memastikan satu merge commit dicipta, supaya senang di-*revert* nanti.
4. Hantar ke GitHub. Netlify akan deploy.

**Output untuk `git merge`:** `Merge made by the 'ort' strategy.`, diikuti senarai 4 fail.

> ❗ **Keluar `CONFLICT (content): Merge conflict in ...`:** lihat Bahagian 5. Jangan push sebelum konflik selesai.

### 4.4 Kemas (pilihan)

```powershell
git branch -d semak-ui-redesign
```

Buang branch ujian tempatan. Output: `Deleted branch semak-ui-redesign`.

---

## 5. Kalau berlaku merge conflict

### Apa itu konflik?

Konflik berlaku bila **dua orang ubah baris yang sama** dalam fail yang sama, dan Git tak tahu versi mana yang betul. Git tak akan meneka; dia tanda tempat itu dan minta kau pilih.

Berbanding `ac446e3`, branch `ui-redesign` tidak ada konflik. Konflik hanya akan berlaku kalau kau ubah `public/index.html`, `public/app.js` atau `public/style.css` **selepas** `ac446e3`.

### Rupa penanda konflik

```text
<<<<<<< HEAD
versi kau (yang sedia ada dalam main)
=======
versi yang masuk (dari ui-redesign)
>>>>>>> ui-redesign
```

- Antara `<<<<<<<` dan `=======`: versi **kau** (*Current*).
- Antara `=======` dan `>>>>>>>`: versi **yang masuk** (*Incoming*).

Fail **tidak akan berfungsi** selagi penanda ini ada.

### Selesaikan dalam VS Code

1. Buka panel **Source Control** (ikon cabang di bar kiri, atau `Ctrl+Shift+G`).
2. Di bawah **Merge Changes**, klik fail yang berkonflik.
3. Di atas setiap konflik, VS Code tunjuk butang kecil:
   - **Accept Current Change:** simpan versi kau sahaja.
   - **Accept Incoming Change:** simpan versi `ui-redesign` sahaja.
   - **Accept Both Changes:** simpan kedua-duanya, satu selepas satu (selalunya perlu kemas sikit selepas itu).
   - **Compare Changes:** lihat kedua-dua versi sebelah-menyebelah.
4. Selepas semua konflik dalam fail diselesaikan, simpan fail (`Ctrl+S`), kemudian klik **+** (*Stage Changes*) di sebelah nama fail.
5. Bila semua fail selesai, tulis mesej di kotak atas Source Control (contoh: `Selesaikan konflik merge UI`) dan klik **✓ Commit**.

### Peraturan memilih

| Jenis kod | Pilih |
|---|---|
| **Logik kau:** panggilan `sb.*`, validasi, aliran log masuk, fungsi baru yang kau tambah | **Kekalkan versi kau** |
| **Rupa:** markup HTML, kelas CSS, templat HTML dalam `app.js`, `style.css` | **Kekalkan versi baru** (`ui-redesign`) |
| Fungsi baru kau yang perlukan HTML | Kekalkan logik kau, tapi guna kelas dan struktur HTML baru. Rujuk `CLAUDE.md` |

**Selepas selesai, semak tiada penanda tertinggal:**

```powershell
Select-String -Path public\*.html, public\*.js, public\*.css -Pattern '^(<<<<<<<|=======|>>>>>>>)'
```

- **Fungsi:** cari penanda konflik yang tertinggal.
- **Output yang dimahukan:** **kosong**. Kalau ada baris keluar, buka fail itu di nombor baris yang ditunjuk.

**Semak JavaScript tiada ralat sintaks** (perlukan Node.js; semak dengan `node -v`):

```powershell
node --check public/app.js
```

Tiada output bermaksud OK. Kalau ada ralat, ia tunjuk nombor baris.

> 💡 **Minta bantuan Claude Code:** buka Claude Code dalam folder projek dan taip, contohnya: *"Ada merge conflict selepas aku merge ui-redesign. Selesaikan: kekalkan semua logik dan panggilan sb.* aku, kekalkan markup dan style baru dari ui-redesign. Tunjuk setiap keputusan sebelum commit."* Claude Code akan baca `CLAUDE.md` untuk faham peraturan projek.

> 🆘 **Nak batal merge dan mula semula?**
> ```powershell
> git merge --abort
> ```
> Folder kau kembali seperti sebelum `git merge`. Selamat digunakan bila-bila masa sebelum commit.

---

## 6. Uji sebelum deploy

### 6.1 Jalankan di komputer

Perlukan **Node.js** (semak dengan `node -v`; kalau tiada, muat turun versi LTS di [nodejs.org](https://nodejs.org)).

```powershell
npx serve public
```

- **Fungsi:** jalankan pelayan web kecil untuk folder `public/`, sama seperti Netlify.
- **Kali pertama:** mungkin tanya `Need to install the following packages: serve ... Ok to proceed? (y)`. Taip `y` dan tekan Enter.
- **Output:** kotak dengan `Serving!` dan alamat `http://localhost:3000`. Buka alamat itu dalam pelayar.
- **Untuk berhenti:** tekan `Ctrl+C` dalam terminal.

> ❗ **Port 3000 sedang digunakan:** `serve` akan pilih port lain dan tunjuk alamatnya. Guna alamat yang ditunjuk.

> ⚠️ Kod ini bersambung ke **Supabase sebenar**. Apa yang kau hantar akan masuk ke data sebenar. Guna tajuk **"UJIAN – sila abaikan"** untuk semua aduan ujian, dan padam selepas itu (Bahagian 8).

**Sepanjang ujian:** tekan `F12` dalam pelayar dan buka tab **Console**. Tiada mesej merah patut keluar.

### 6.2 Senarai ujian

**Log masuk**
- [ ] Log masuk sebagai **Pengetua / Guru Besar** dengan akaun Guru Besar: paparan borang aduan muncul. Navbar tunjuk avatar inisial, nama dan peranan.
- [ ] Log keluar, kemudian log masuk sebagai **Pegawai PPD**: tab "Senarai Menunggu" dan "Sejarah" muncul.
- [ ] Pilih peranan yang **salah** untuk akaun: keluar mesej "Peranan yang dipilih tidak sepadan dengan akaun ini."
- [ ] Kata laluan salah: keluar "ID atau kata laluan tidak sah." dengan animasi goncang.
- [ ] Muat semula halaman semasa sudah log masuk: tiada kelipan skrin log masuk.

**Hantar aduan (Guru Besar)**
- [ ] Pilih keutamaan **Kecemasan**: kotak merah Tahap Kecemasan muncul. Tukar ke keutamaan lain: kotak hilang.
- [ ] Seret gambar dan PDF ke zon muat naik: pratonton muncul, dan butang ✕ membuang fail.
- [ ] Hantar aduan: butang tunjuk spinner kemudian ✓, panel hijau dengan **No Rujukan** muncul, dan aduan masuk dalam sejarah sekolah.

**Maklum balas siasatan (PPD)**
- [ ] Aduan tanpa maklum balas: butang **Tanda Selesai berkunci** (ikon mangga). Hover di atasnya keluar tooltip "Hantar maklum balas siasatan dahulu".
- [ ] Klik "Hantar Maklum Balas Siasatan", isi dapatan dan tindakan, lampirkan fail, kemudian hantar:
  - ringkasan maklum balas muncul dalam kad
  - penunjuk langkah maju ke "Selesai"
  - Tanda Selesai dibuka
- [ ] Taip sesuatu dalam borang maklum balas kad lain, kemudian hantar maklum balas pada kad pertama: teks di kad lain **tidak hilang**.

**Tanda Selesai (PPD)**
- [ ] Klik Tanda Selesai dan sahkan: kad meluncur keluar, dan nombor giliran serta statistik dikemas kini.

**Sejarah**
- [ ] PPD → tab Sejarah: tapis "Selesai", cari nama sekolah atau no. rujukan, dan buka satu aduan untuk lihat garis masa dan maklum balas.
- [ ] Guru Besar: cari dan tapis dalam kad sejarah sekolah. Hanya aduan sekolah sendiri muncul.

**Telefon 360px**
- [ ] Dalam pelayar, tekan `F12`, kemudian `Ctrl+Shift+M` (mod peranti), dan pilih lebar 360.
  - Semak semua skrin di atas: tiada skrol ke kiri-kanan, dan butang tidak terpotong.

---

## 7. Cara patah balik kalau ada masalah

### 7.1 Paling pantas: rollback di Netlify (laman kembali dalam beberapa saat)

Kalau laman sebenar rosak selepas merge:

1. Buka [app.netlify.com](https://app.netlify.com), pilih site i-Pantas, kemudian klik **Deploys**.
2. Cari deploy **sebelum** merge (lihat tarikh dan mesej commit).
3. Klik deploy itu, kemudian klik **Publish deploy**.

Laman kembali ke versi lama serta-merta. Kod di GitHub **tidak berubah**, jadi teruskan ke 7.2 untuk betulkan kod.

> Selepas rollback, Netlify mungkin "kunci" pada deploy lama itu (auto publishing dimatikan). Bila kod dah dibetulkan, pergi ke **Deploys** dan klik **Start auto publishing** semula.

### 7.2 Batalkan merge dalam kod: `git revert`

```powershell
git switch main
git pull origin main
git log --oneline --merges -5
```

**Fungsi:** senaraikan 5 merge commit terakhir.

**Output:** contohnya `9f8e7d6 Merge pull request #3 from .../ui-redesign`. Salin kod di depan (`9f8e7d6`).

```powershell
git revert -m 1 9f8e7d6
```

**Fungsi:** cipta commit baru yang **membatalkan** semua perubahan merge itu. Sejarah tidak dipadam, jadi selamat.
- `-m 1` bermaksud "kekalkan sisi `main`" (versi sebelum merge).
- Tukar `9f8e7d6` dengan kod sebenar.

**Output:** VS Code atau editor lain mungkin terbuka dengan mesej commit. Simpan dan tutup tab itu. Kemudian keluar `[main ...] Revert "Merge pull request ..."`.

```powershell
git push origin main
```

Netlify akan deploy versi tanpa UI baru.

> ❗ **Ralat `is a merge but no -m option was given`:** kau terlupa `-m 1`.

> ❗ **Ralat `CONFLICT` semasa revert:** ada commit lain yang ubah fail sama selepas merge. Lihat Bahagian 5, atau batalkan dengan `git revert --abort`.

### 7.3 Pilihan terakhir: kembali ke branch backup

Kalau semua cara lain gagal, branch `backup-sebelum-redesign` (Bahagian 2.4) masih ada. Minta bantuan sebelum guna cara ini, kerana ia menulis semula `main`.

---

## 8. Perkara kritikal

⚠️

Disusun ikut keutamaan:
- **[SEGERA]:** buat secepat mungkin, tak kira sama ada UI ini di-merge.
- **[PENTING]:** buat dalam minggu ini.
- **[BILA SEMPAT]:** penambahbaikan.

---

### [SEGERA] 1. Kunci peribadi Google masih boleh dibaca dalam sejarah Git, dan repo ini AWAM

> 📣 SyazAwie sudah maklumkan perkara ini kepada kau secara terus. Langkah penuh di bawah tetap disertakan sebagai rujukan, supaya tiada langkah yang tertinggal semasa rotate.

**Masalah:**
- Fail `.env` pernah di-commit dalam commit `ff63d96` (7 Okt 2026).
- Walaupun fail itu dah dibuang dalam `ac446e3`, versi lama masih kekal dalam sejarah Git.
- Sesiapa boleh buka commit lama itu di GitHub dan baca isinya.

**Nama pemboleh ubah yang pernah ada dalam `.env` itu** (nilai sengaja tidak ditulis di sini):

| Nama | Tahap bahaya |
|---|---|
| `GDRIVE_PRIVATE_KEY` | 🔴 **Tinggi.** Kunci peribadi akaun perkhidmatan (*service account*) Google. Sesiapa yang ada kunci ini boleh guna akaun itu untuk akses Google Drive yang dikongsi dengannya. |
| `GDRIVE_CLIENT_EMAIL` | 🟠 Email akaun perkhidmatan itu. Bukan rahsia dengan sendirinya, tapi digabungkan dengan kunci di atas, ia memberi akses penuh. |
| `GDRIVE_FOLDER_ID` | 🟡 ID folder Drive. Bukan rahsia, tapi beritahu orang folder mana yang disasarkan. |
| `GDRIVE_PRIVATE_KEY_BASE64` | ⚪ Kosong dalam versi itu. |
| `SUPABASE_KEY` | 🟢 Rendah. Ini kunci **`anon`** (memang direka untuk awam), untuk projek Supabase **lama** (`xlokucdgkiztwzuywemj`), bukan projek sekarang. Ia **bukan** kunci `service_role`. |
| `SUPABASE_URL` | ⚪ Alamat projek Supabase lama. Bukan rahsia. |

**Kenapa memadam fail tidak cukup:** Git menyimpan **setiap versi** setiap fail. Memadam `.env` hanya bermaksud versi *terkini* tiada fail itu; versi lama masih boleh dibuka sesiapa. Repo awam juga diimbas oleh bot dalam masa beberapa minit selepas push. Anggap kunci itu **sudah bocor**. Cara yang betul ialah **matikan kunci lama dan buat kunci baru (rotate)**.

**Semak repo awam atau peribadi:** di halaman utama repo GitHub, lihat label di sebelah nama repo, sama ada **Public** atau **Private**. Ketika panduan ini ditulis, repo ini **Public**. Untuk tukar: **Settings → General → Danger Zone → Change repository visibility**. Menjadikan repo *Private* tidak memadamkan kebocoran yang sudah berlaku, jadi rotate tetap wajib.

**Langkah: rotate kunci akaun perkhidmatan Google**

1. Buka [console.cloud.google.com](https://console.cloud.google.com) dengan akaun Google yang mencipta akaun perkhidmatan itu, dan pilih projek yang betul (menu di atas).
2. Pergi ke **IAM & Admin → Service Accounts**.
3. Cari akaun yang emailnya berakhir dengan `iam.gserviceaccount.com` dan pernah digunakan untuk i-Pantas. (Kalau tak pasti yang mana, semak `GDRIVE_CLIENT_EMAIL` dalam salinan `.env` lama di komputer kau. **Jangan** buka atau salin dari GitHub.)
4. Klik akaun itu, kemudian tab **Keys**.
5. Untuk setiap kunci yang ada, klik ikon 🗑 (**Delete**) untuk matikan kunci lama.
6. **Adakah akaun ini masih diperlukan?** Fungsi Netlify sekarang (`archive-to-drive.js`) **tidak** guna akaun perkhidmatan. Ia guna OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` dalam pemboleh ubah Netlify). Jadi kemungkinan besar akaun ini tidak digunakan lagi.
   - **Kalau tidak digunakan:** di halaman Service Accounts, klik ⋮ → **Disable** (atau **Delete**).
   - **Kalau masih digunakan di tempat lain:** **Add Key → Create new key → JSON**, dan simpan fail itu dengan selamat (**jangan** dalam folder repo). Kemas kini tempat yang menggunakannya.
7. Di Google Drive, buka folder arkib dan klik **Share**. Semak siapa yang ada akses, dan buang akaun perkhidmatan lama itu jika tidak diperlukan.
8. Semak **IAM & Admin → Audit Logs**, atau **Activity** di Google Drive, untuk sebarang akses pelik sejak 7 Okt 2026.

**Langkah: projek Supabase lama (`xlokucdgkiztwzuywemj`)**

Kunci `anon` direka untuk didedahkan, jadi risikonya rendah. Tetapi kalau projek lama itu **tidak digunakan lagi**:

1. Log masuk ke [supabase.com/dashboard](https://supabase.com/dashboard) dan buka projek lama itu.
2. **Project Settings → General → Pause project** (atau **Delete project** kalau pasti tiada data penting).

> Untuk rujukan masa depan: kalau kunci **`service_role`** (atau kunci `sb_secret_...`) **mana-mana projek** pernah bocor, itu 🔴 bahaya tinggi, kerana kunci itu memintas semua RLS. Untuk reset:
> - Buka **Project Settings → API Keys** di dashboard Supabase dan jana semula atau buat kunci rahsia baru (nama menu mungkin berbeza sedikit mengikut versi dashboard).
> - Kemas kini `SUPABASE_SERVICE_ROLE_KEY` dalam **Netlify → Site configuration → Environment variables**.
> - Deploy semula.

**Pilihan (lanjutan): padam `.env` dari sejarah Git.** Ini boleh dibuat dengan alat seperti `git filter-repo`, tetapi ia menulis semula seluruh sejarah, dan semua orang perlu clone semula. Ini **tidak** menggantikan rotate. Buat hanya selepas rotate, dan dengan bantuan.

---

### [PENTING] 2. Pangkalan data TIDAK menyekat "Selesai" tanpa maklum balas

**Keputusan ujian (20 Okt 2026, oleh SyazAwie):**
- **Ujian:** sebagai Pegawai PPD, jalankan arahan ini dalam Console pelayar pada aduan yang **belum ada** maklum balas:
  ```js
  sb.from('reports').update({ status: 'Selesai' }).eq('id', ID).select()
  ```
- **Keputusan:** **BERJAYA.** Status bertukar ke Selesai tanpa ralat.

**Maknanya:**
- Sekatan "hantar maklum balas dahulu" **hanya wujud di skrin** (butang dimatikan).
- Sesiapa yang log masuk sebagai PPD boleh memintasnya melalui Console pelayar.
- Komen dalam `public/app.js` (fungsi `markCompleted`) yang berbunyi *"The database also enforces this"* adalah **tidak tepat**.

**Kenapa penting:** aliran kerja yang dijanjikan kepada sekolah (setiap aduan disiasat sebelum ditutup) boleh dilangkau tanpa jejak.

**Langkah membetulkan:**

> ⚠️ **AMARAN: SQL di bawah ialah DRAF.**
> - Ia **belum diuji** pada skema sebenar kau. Ia ditulis berdasarkan nama yang digunakan oleh kod (`report_feedback`, `report_id`), bukan dari pangkalan data kau.
> - **Semak nama jadual dan lajur dahulu** (lihat langkah 2).
> - **Uji dengan aduan ujian** sebelum bergantung padanya untuk aduan sebenar (langkah 6–7).
> - **Buat backup dahulu** (langkah 1).
> - Kalau trigger ini tersilap dan **menyekat semua Selesai** (termasuk aduan yang sudah ada maklum balas), buang terus dengan SQL **"Buang trigger"** di hujung bahagian ini.

1. **Backup dahulu.** Buka dashboard Supabase projek sekarang (`hlxspdqxkvjwlbnifzkg`), kemudian **Database → Backups**.
   - Kalau ada backup automatik, catat tarikh backup terkini.
   - Kalau pelan kau tiada backup automatik: buka **Table Editor**, pilih jadual `reports`, dan klik **Export → CSV**. Ulang untuk `report_feedback`. Simpan fail CSV itu di komputer kau (**bukan** dalam folder repo).
2. **Semak nama sebenar.** Buka **SQL Editor → New query** dan jalankan:
   ```sql
   select table_name, column_name from information_schema.columns
   where table_schema = 'public' and table_name in ('reports', 'report_feedback')
     and column_name in ('id', 'status', 'report_id');
   ```
   Kau patut nampak tiga baris: `reports.id`, `reports.status` dan `report_feedback.report_id`. Kalau ada nama yang berbeza, **jangan teruskan**; betulkan SQL di bawah dahulu (atau minta bantuan).
3. Buka **New query** yang baru, kemudian tampal dan semak SQL ini:
   ```sql
   -- DRAF, belum diuji pada skema sebenar. Baca amaran di atas dahulu.
   -- Tolak status 'Selesai' jika aduan belum ada maklum balas siasatan
   create or replace function public.require_feedback_before_done() returns trigger
   language plpgsql security definer set search_path = public as $$
   begin
     if new.status = 'Selesai' and old.status <> 'Selesai'
        and not exists (select 1 from public.report_feedback f where f.report_id = new.id) then
       raise exception 'Hantar maklum balas siasatan dahulu sebelum menandakan aduan sebagai Selesai';
     end if;
     return new;
   end $$;

   drop trigger if exists trg_require_feedback_before_done on public.reports;
   create trigger trg_require_feedback_before_done before update on public.reports
     for each row execute function public.require_feedback_before_done();
   ```
   `security definer` membolehkan semakan melihat `report_feedback` walaupun RLS menyorokkan baris itu daripada pengguna.
4. Klik **Run**. Output patut keluar `Success. No rows returned`.
5. **Buat dua aduan ujian** sebagai Guru Besar, dengan tajuk **"UJIAN TRIGGER 1"** dan **"UJIAN TRIGGER 2"**.
   - Nama ini berbeza daripada aduan "UJIAN 1" / "UJIAN 2" yang sudah wujud dari ujian sebelum ini, supaya tidak tertukar.
   - Jangan uji pada aduan sebenar.
6. **Uji sekatan** pada "UJIAN TRIGGER 1" (tanpa maklum balas). Sebagai PPD, jalankan arahan Console di atas dengan `id` aduan itu.
   - Kini patut keluar `error` dengan mesej "Hantar maklum balas siasatan dahulu...", dan status kekal **Menunggu**.
7. **Uji aliran biasa** pada "UJIAN TRIGGER 2": hantar maklum balas melalui skrin, kemudian klik Tanda Selesai. **Mesti berjaya.**
   - ❗ Kalau langkah 7 **gagal** dengan mesej yang sama, trigger ini menyekat semua Selesai secara salah. **Buang trigger dengan segera** (SQL di bawah), kemudian minta bantuan.
8. Bila kedua-dua ujian lulus, simpan SQL ini dalam fail migrasi (lihat perkara 3) dan commit.
9. Padam aduan ujian, termasuk aduan yang ditanda Selesai tanpa maklum balas semasa ujian asal (lihat perkara 4).

**Buang trigger** (kalau ia menyekat secara salah, atau kau nak batalkan):

```sql
drop trigger if exists trg_require_feedback_before_done on public.reports;
drop function if exists public.require_feedback_before_done();
```

- Klik **Run**. Output: `Success. No rows returned`.
- Pangkalan data kembali seperti sebelum trigger dipasang. Tiada data yang terjejas, kerana trigger hanya menyemak dan tidak mengubah data.

---

### [PENTING] 3. SQL terkini tiada dalam folder `supabase/`

**Masalah:** kod sekarang perlukan perkara ini dalam pangkalan data, tetapi **tiada satu pun** ada dalam `supabase/schema.sql` atau `supabase/migration-drive.sql`:
- jadual `report_feedback`, termasuk lajur yang diisi oleh pangkalan data: `officer_name` dan `created_at`
- lajur `reports.emergency_level` dan kekangannya
- lajur `file_metadata.kind` (`photo`, `pdf`, `fb_photo`, `fb_pdf`)
- RLS dan policy untuk `report_feedback`, serta trigger yang mengisi `file_metadata` untuk fail maklum balas

**Kenapa bahaya:** kalau projek Supabase rosak, terpadam, atau perlu dibina semula (contohnya untuk projek ujian), SQL dalam repo akan menghasilkan pangkalan data yang **tidak serasi** dengan kod. Aplikasi akan gagal, dan tiada siapa tahu sebabnya.

**Langkah:**

1. **Cari SQL asal kau dahulu:** di Supabase, buka **SQL Editor**. Lihat senarai query yang disimpan dan sejarah query di panel kiri. SQL yang kau jalankan dulu untuk ciri maklum balas biasanya masih ada di situ.
2. **Kalau tak jumpa, ambil definisi daripada pangkalan data.** Jalankan setiap query ini dalam SQL Editor, dan salin hasilnya:
   ```sql
   -- (a) Lajur jadual / lajur baru
   select table_name, column_name, data_type, is_nullable, column_default
   from information_schema.columns
   where table_schema = 'public'
     and (table_name = 'report_feedback'
          or (table_name = 'reports' and column_name = 'emergency_level')
          or (table_name = 'file_metadata' and column_name = 'kind'))
   order by table_name, ordinal_position;

   -- (b) Kekangan (check, foreign key, unique)
   select conrelid::regclass as jadual, conname, pg_get_constraintdef(oid) as definisi
   from pg_constraint
   where connamespace = 'public'::regnamespace
     and conrelid::regclass::text in ('reports', 'report_feedback', 'file_metadata');

   -- (c) Policy RLS
   select tablename, policyname, cmd, roles, qual, with_check
   from pg_policies where schemaname = 'public';

   -- (d) Fungsi dan trigger
   select pg_get_functiondef(p.oid)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public';

   select pg_get_triggerdef(t.oid)
   from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal;
   ```
3. **Tulis fail migrasi baru** di VS Code: `supabase/migration-003-feedback.sql`.
   - Masukkan `create table if not exists ...`, `alter table ... add column if not exists ...`, policy dan trigger, berdasarkan hasil di atas.
   - Masukkan juga trigger dari perkara 2.
   - Ikut gaya fail sedia ada: boleh dijalankan berulang kali tanpa ralat (`if not exists`, `drop ... if exists`).
   - Claude Code boleh bantu tukar hasil query kepada fail migrasi.
4. **Uji fail itu** pada projek Supabase **ujian** yang kosong (buat projek percuma baru):
   - Jalankan `schema.sql`, kemudian `migration-drive.sql`, kemudian `migration-003-feedback.sql`.
   - Semua patut berjaya tanpa ralat.
5. Commit:
   ```powershell
   git add supabase/migration-003-feedback.sql
   git commit -m "Tambah SQL migrasi untuk maklum balas siasatan dan emergency_level"
   git push origin main
   ```

---

### [PENTING] 4. Padam data ujian

Semasa ujian, beberapa aduan dan maklum balas sebenar dicipta dalam pangkalan data, dengan tajuk **"UJIAN – sila abaikan"**, **"UJIAN 1"** atau **"UJIAN 2"**. Ujian trigger dalam perkara 2 pula menambah **"UJIAN TRIGGER 1"** dan **"UJIAN TRIGGER 2"**. Termasuk dalam data ini ialah aduan yang ditanda Selesai **tanpa** maklum balas semasa ujian perkara 2.

**Kenapa:**
- Ia mengelirukan statistik dan sejarah sekolah.
- Fail ujian juga memakan ruang Storage dan Google Drive.

> 🛑 **Jangan sekali-kali padam dengan carian kabur** seperti `title ilike '%UJIAN%'`. Carian seperti itu juga akan memadam aduan sebenar yang tajuknya kebetulan mengandungi perkataan itu, contohnya *"Pengujian sistem penggera kebakaran"*. Langkah di bawah memadam **hanya** `ref_no` yang kau sendiri sahkan.

**Urutan penting:** padam **fail dahulu**, kemudian baris pangkalan data. Kalau baris dipadam dahulu, laluan fail hilang, dan fail tertinggal tanpa jejak.

**Langkah 1: senaraikan aduan dengan tajuk TEPAT** (SQL Editor):

```sql
select ref_no, title, school_name, status, submitted_at
from reports
where title in ('UJIAN – sila abaikan', 'UJIAN - sila abaikan', 'UJIAN 1', 'UJIAN 2',
                'UJIAN TRIGGER 1', 'UJIAN TRIGGER 2')
order by submitted_at;
```

- **Fungsi:** padanan **tepat** sahaja (`in (...)`, bukan `ilike`). "Pengujian ..." **tidak** akan muncul.
- Dua versi "sila abaikan" disertakan kerana sengkang mungkin ditaip sebagai `–` (sengkang panjang) atau `-` (sengkang biasa).
- Kalau SyazAwie beritahu ada tajuk ujian lain, tambah tajuk tepat itu dalam senarai.

**Langkah 2: semak senarai itu dengan mata kau sendiri**

- Baca setiap baris: tajuk, sekolah, tarikh (semua aduan ujian dibuat sekitar 20 Okt 2026).
- **Kalau ada satu pun yang kau tak pasti, jangan masukkan.**
- Salin `ref_no` yang disahkan ke Notepad. Contoh format (**bukan** ref_no sebenar):
  ```text
  ADU-20261020-0099
  ADU-20261020-0100
  ```

**Langkah 3: senaraikan fail bagi `ref_no` yang disahkan sahaja**

Tukar senarai `ref_no` di bawah dengan senarai kau dari langkah 2. Kekalkan tanda petik tunggal dan koma.

```sql
-- GANTI senarai ini dengan ref_no sebenar dari langkah 2 (yang di bawah hanya CONTOH)
select r.ref_no, f.kind, f.file_path, f.drive_link
from file_metadata f
join reports r on r.id = f.report_id
where r.ref_no in ('ADU-20261020-0099', 'ADU-20261020-0100')
order by r.ref_no, f.kind;
```

- `kind` menunjukkan jenis fail: `photo` / `pdf` (lampiran aduan), `fb_photo` / `fb_pdf` (lampiran maklum balas).
- `drive_link` kosong bermaksud fail itu belum disalin ke Drive.

**Langkah 4: padam fail di Supabase Storage**

1. **Storage → bucket `evidence`**.
2. Untuk setiap `file_path` dari langkah 3 (format: `<id-pengguna>/<nama-fail>`), buka folder `<id-pengguna>`, tanda fail dengan nama yang **sama tepat**, kemudian klik **Delete**.

> Jangan padam fail dengan SQL (`delete from storage.objects`). Cara itu hanya membuang rekod, dan fail sebenar tertinggal.

**Langkah 5: padam salinan di Google Drive**

Fungsi `archive-to-drive` menyalin fail ke Drive setiap 10 minit.

1. Untuk setiap baris dari langkah 3 yang ada `drive_link`, buka pautan itu dan padam fail (**⋮ → Move to trash**).
2. Semak juga folder arkib Drive untuk fail yang namanya bermula dengan `ref_no` itu, kerana fail mungkin disalin selepas kau jalankan langkah 3. Contohnya:
   - `ADU-20261020-0099_gambar.jpg`
   - `ADU-20261020-0099_surat.pdf`
   - `ADU-20261020-0099_maklumbalas-gambar.jpg`
   - `ADU-20261020-0099_maklumbalas-borang.pdf`
3. Kosongkan **Trash** di Drive kalau mahu ruang dibebaskan serta-merta.

**Langkah 6: padam baris pangkalan data, ikut `ref_no` sahaja**

Guna senarai `ref_no` yang **sama** seperti langkah 3.

**(a) Semak dahulu.** Jalankan ini **sahaja**:

```sql
-- GANTI senarai ini dengan ref_no sebenar dari langkah 2 (yang di bawah hanya CONTOH)
select count(*) from reports
where ref_no in ('ADU-20261020-0099', 'ADU-20261020-0100');
```

Bilangan mesti **sama** dengan bilangan `ref_no` dalam senarai kau. Kalau tidak sama, **berhenti** dan semak semula.

**(b) Padam, dalam satu transaksi.** Jalankan keseluruhan blok ini sekali gus:

```sql
begin;

-- GANTI senarai ref_no di bawah (dua tempat) dengan ref_no sebenar dari langkah 2. Yang ada hanya CONTOH.

-- 1) maklum balas siasatan bagi aduan ujian
delete from report_feedback
where report_id in (select id from reports where ref_no in ('ADU-20261020-0099', 'ADU-20261020-0100'));

-- 2) aduan ujian (file_metadata ikut terpadam: on delete cascade, lihat supabase/schema.sql baris 38)
delete from reports
where ref_no in ('ADU-20261020-0099', 'ADU-20261020-0100');

commit;
```

- **Kenapa transaksi (`begin; ... commit;`):** semua pemadaman berlaku serentak, atau tiada langsung. Tiada keadaan separuh jalan, contohnya maklum balas sudah terpadam tetapi aduannya masih ada.
- **Output:** `Success. No rows returned`. Untuk sahkan, jalankan semula (a); patut keluar `0`.
- **`file_metadata`** tidak perlu dipadam sendiri. Dalam `supabase/schema.sql` (baris 38), `file_metadata.report_id` merujuk `reports` dengan `on delete cascade`, jadi barisnya dipadam bersama aduan.
- **`report_feedback`** tiada dalam `schema.sql`, jadi ia dipadam secara eksplisit dahulu. Kalau jadual itu juga ada `on delete cascade`, langkah 1) tetap selamat.

> ❗ **Kalau keluar ralat** seperti `violates foreign key constraint`: transaksi **dibatalkan secara automatik**, dan **tiada data terpadam**. Ini bermaksud ada jadual lain yang merujuk aduan itu, yang panduan ini tidak tahu. **BERHENTI** di sini dan minta bantuan. Jangan cuba padam dengan cara lain.

**Langkah 7: sahkan**

Jalankan semula SQL langkah 1. Output patut **kosong**.

---

### [BILA SEMPAT] 5. Sahkan nama dan logo "iP"

Logo baru ialah kotak biru dengan huruf **"iP"** (i-Pantas), dilukis dengan SVG ringkas. Ia **bukan** logo atau jata rasmi. Sila sahkan:
- Nama **i-Pantas** dan teks "Sistem Aduan Pembangunan • Pejabat Pendidikan Daerah Pontian" betul.
- PPD tidak mempunyai logo rasmi yang perlu digunakan. Kalau ada, kita boleh gantikan simbol `logo-ip` dalam `public/index.html`.

---

### [BILA SEMPAT] 6. Peraturan baru untuk sesiapa yang ubah kod

Butiran penuh ada dalam **`CLAUDE.md`**. Ringkasnya:

- **Fungsi global** yang dipanggil terus dari HTML (contoh `onclick="..."`) **mesti kekal nama sama**:
  - `handleLogin`, `logout`, `submitReport`
  - `previewLocalImage`, `previewLocalPdf`, **`removeFile`** (baru: butang ✕ pada pratonton fail)
  - `onPriorityChange`, `showPpdTab`, `loadHistory`, `debouncedHistory`
  - **`fetchFifoQueue`** (kini juga dipanggil terus oleh butang Muat Semula)
- **Auto muat semula queue PPD setiap 60 saat.** Ia sengaja **tidak** berjalan bila:
  - borang maklum balas dibuka, atau ada teks atau fail di dalamnya
  - fail sedang dimuat naik, atau Tanda Selesai sedang diproses (termasuk ketika dialog pengesahan terbuka)
  - keterangan kad dikembangkan ("Baca lagi")
  - tab pelayar tidak aktif

  Dua muat semula juga tidak boleh berjalan serentak. Jangan buang semakan `queueIsBusy()` ini.
- **Semakan PDF awal:** fail bukan PDF atau lebih 5 MB ditolak sebaik dipilih. Semakan semasa hantar (`uploadOptionalFiles`) masih ada juga. Kekalkan kedua-duanya.
- **Nilai `<select>`** (contoh `Kecemasan`, `Kritikal`, `ppd_officer`) mesti sama dengan pangkalan data. Label boleh ditukar; `value` tidak boleh.

---

### [BILA SEMPAT] 7. `node_modules` masih dijejak oleh Git

**Masalah:**
- 1085 fail dalam `node_modules/` masih ada dalam repo, walaupun `.gitignore` sudah menyenaraikan `node_modules/`.
- `.gitignore` hanya menghalang fail **baru**; fail yang pernah di-commit terus dijejak.

**Kesan:** repo besar dan lambat di-clone, dan diff PR jadi bising.

**Betulkan:**

```powershell
git rm -r --cached node_modules
git commit -m "Berhenti menjejak node_modules"
git push origin main
```

- `--cached` buang dari Git **sahaja**. Folder di komputer kau tidak terusik.
- **Output:** senarai panjang `rm 'node_modules/...'`, diikuti mesej commit.

---

### [BILA SEMPAT] 8. `netlify-cli` dalam `dependencies`

`netlify-cli` ialah alat pembangunan, tetapi kini disenaraikan sebagai kebergantungan biasa dalam `package.json`. Netlify mungkin memasangnya pada setiap deploy, jadi deploy lebih lambat. Pindahkan ke `devDependencies`:

```powershell
npm uninstall netlify-cli
npm install --save-dev netlify-cli
```

Kemudian commit `package.json` dan `package-lock.json`.

---

### [BILA SEMPAT] 9. Kunci versi supabase-js dari CDN

`public/index.html` memuatkan `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`, iaitu **sentiasa versi 2.x terbaru**. Kalau versi baru membawa perubahan yang mengejutkan, laman boleh rosak tanpa sebarang perubahan kod.

**Cadangan:** tetapkan versi tepat yang sudah diuji, contohnya `supabase-js@2.117.2` (versi dalam `package.json`). Uji selepas menukar.

---

### [BILA SEMPAT] 10. Betulkan komen yang tidak tepat dalam `markCompleted`

Selepas trigger dalam perkara 2 dipasang, komen *"The database also enforces this"* dalam `public/app.js` menjadi betul. **Sebelum** itu, ia mengelirukan. Sama ada pasang trigger dahulu, atau tukar komen itu.

---

## 9. Glosari

| Istilah | Maksud ringkas |
|---|---|
| **Repository (repo)** | Folder projek yang dijejak oleh Git, termasuk seluruh sejarah perubahannya. |
| **Commit** | Satu "titik simpan" dalam sejarah. Ada mesej, pengarang, dan kod pengenal (contoh `ac446e3`). |
| **Branch** | Satu "jalur" kerja berasingan. `main` ialah jalur utama; `ui-redesign` ialah jalur untuk reka bentuk baru. Perubahan dalam satu branch tidak menjejaskan branch lain sehingga di-merge. |
| **Merge** | Menggabungkan perubahan dari satu branch ke branch lain. |
| **Pull** | Ambil commit terbaru dari GitHub ke komputer kau (`git pull`). |
| **Push** | Hantar commit dari komputer kau ke GitHub (`git push`). |
| **Fetch** | Muat turun maklumat terbaru dari GitHub **tanpa** mengubah fail kau. |
| **Pull Request (PR)** | Permintaan di GitHub untuk merge satu branch ke branch lain. Tempat untuk semak perubahan, beri komen, dan merge. |
| **Conflict (konflik)** | Bila dua branch ubah baris yang sama, dan Git perlukan manusia untuk pilih versi mana. |
| **Stash** | "Laci" sementara untuk simpan perubahan yang belum di-commit. |
| **Revert** | Cipta commit baru yang membatalkan commit lama. Sejarah tidak dipadam, jadi selamat. |
| **Deploy Preview** | Laman ujian Netlify untuk sesuatu PR, dengan URL berasingan dari laman sebenar. |
| **Rotate (kunci)** | Matikan kunci atau kata laluan lama dan buat yang baru, supaya kunci yang bocor tidak boleh digunakan lagi. |
