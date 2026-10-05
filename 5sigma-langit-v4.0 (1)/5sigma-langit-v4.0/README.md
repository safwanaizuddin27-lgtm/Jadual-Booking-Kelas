# Langit 5 Sigma · 5 Sigma Class Hub v4.0

**Versi sebenar: data sebenar, Jadual SPM penuh dan pembaikan telefon**

Aplikasi jadual, tempahan dan kehadiran kelas tambahan untuk kelas 5 Sigma (Tingkatan 5, SPM 2026), dibina semula sepenuhnya.

**Konsep: "Langit 5Σ".** Dalam fizik, 5σ ialah tahap keyakinan yang diperlukan sebelum sesuatu penemuan diumumkan. Σ pula simbol hasil tambah: kelas ini ada 13 pelajar, iaitu 13 bintang yang membentuk huruf Σ.

- **Pautan aplikasi (claude.ai):** https://claude.ai/artifact/TEU2yAGvkPyCyoyrm3t4LE
  - Pemilik perlu kongsi pautan ini (menu *Share*) sebelum orang lain boleh membukanya.
- **Buka tanpa Internet:** klik dua kali `index.html`. Tiada pelayan atau pemasangan diperlukan.
- **Log masuk:**
  - pelajar menekan bintang sendiri pada buruj Σ
  - cikgu menekan **Saya cikgu** dan memilih nama
  - admin perlu kod admin, yang tidak ditulis dalam fail ini atau dalam kod sumber
- **Data sebenar:** aplikasi bermula dengan data dari laman asal (https://safwanaizuddin27-lgtm.github.io/Jadual-Booking-Kelas/), disalin pada 5 Okt 2026. Perubahan disimpan dalam pelayar sahaja dan tidak dihantar ke laman asal.
- **Cuba semua fungsi (admin sahaja):** buka **Tetapan → Data**, pilih **Data demo**, kemudian tekan **Lompat ke kelas seterusnya**. Jam aplikasi akan dianjak supaya ada kelas yang sedang berlangsung.

---

## Baharu dalam v4.0

| Komen | Apa yang diubah |
| --- | --- |
| Bukan lagi demo, kod admin sebenar dan dirahsiakan | Kod admin sebenar digunakan, tetapi tidak ditulis dalam kod sumber (hanya cincangan bergaram disimpan). Lima cubaan salah menyekat borang selama 30 saat. Butang "Cuba terus (demo)" dibuang. Data, jam aplikasi dan sandaran kini untuk admin sahaja. |
| Buang daftar masuk (pelajar asrama tidak boleh pegang telefon), bintang hanya untuk hadir tepat masa, dan tukar nama jadi bintang skibidi | Daftar masuk sendiri dibuang sepenuhnya: tiada kod 4 digit, tiada butang Daftar masuk, dan Paparan kelas tidak lagi menunjukkan kod. Kehadiran ditanda oleh admin. **Bintang emas** kini **bintang skibidi**, dan hanya diberi untuk **Hadir** (tepat masa). **Lewat** tidak dapat bintang. Streak mengira kelas tepat masa berturut-turut. |
| Jadual sampai hujung, 00:00 hingga 23:00 | Grid Minggu dan Hari kini meliputi 24 jam penuh (00:00 hingga 24:00). Waktu malam dilorek lebih gelap. Apabila dibuka, grid terus ke waktu sekarang, atau ke kelas pertama minggu itu. |
| Nama Nathaneil dan Hazarinna bertindih di telefon | Bintang pada buruj Σ dijarakkan lebih luas. Pada skrin yang sempit, nama di baris bawah disusun berselang-seli supaya tidak bertindih. |
| Tarikh di bar atas terputus di telefon | Jika tarikh tidak muat, ia bergerak perlahan ke kiri dan kembali, supaya dapat dibaca penuh. Jika "Kurangkan animasi" dihidupkan, tarikh dipendekkan. |
| Logo 5 Sigma dengan Sigma huruf besar | Logo, ikon aplikasi, favicon, skrin log masuk dan Paparan Kelas kini menggunakan **5Σ**. |
| Simbol untuk setiap subjek | 10 ikon subjek sendiri, dipaparkan di Jadual, Tempah, Subjek, Utama, Statistik, Edit Kelas, Jadual Tetap dan Paparan Kelas. |
| Amali Sains bukan pada hari yang sama | Fizik 16 Nov, Kimia 17 Nov dan Biologi 18 Nov, masing-masing pada hari sendiri. |
| Jadual penuh SPM | Halaman baharu **Jadual SPM**: 86 kertas mengikut hari, kertas seterusnya dengan kiraan hari, penapis subjek, **Kertas saya** atau **Semua kertas**, dan eksport ke kalendar. Kertas setiap subjek juga ada dalam halaman perincian Subjek. |
| Tambah kelas dalam Edit Kelas | Butang **Tambah kelas** untuk kelas yang terlupa dimasukkan, termasuk kelas yang sudah lepas. Ia direkod tanpa notifikasi, dan kehadiran boleh terus ditanda selepas simpan. |
| Ambil semua data dari laman asal | 24 tempahan dengan kehadiran, guru setiap subjek, rekod log masuk, 60 log aktiviti dan 39 notifikasi disalin daripada pangkalan data laman asal. |

Sumber jadual SPM: Jadual Waktu Peperiksaan SPM 2026, Lembaga Peperiksaan KPM (18 Ogos 2026).

---

## 1. Fungsi baharu

| Fungsi | Apa yang ia buat |
| --- | --- |
| **Jadual seret & lepas** | Paparan Minggu dan Hari kini berbentuk grid masa: <br>• **Seret pada ruang kosong** untuk menempah masa itu. Klik sahaja untuk slot satu jam. <br>• **Seret kelas** untuk mengalihnya ke masa lain, atau ke hari lain dalam minggu yang sama. <br>• **Tarik hujung bawah kelas** untuk mengubah masa tamat. <br>Semua seretan melekat setiap 15 minit. Kelas bertukar merah semasa diseret jika bertindih, dan aplikasi bertanya dahulu sebelum menyimpan pertindihan. Butang **Buat asal** ada pada setiap alihan. <br>Di telefon, tekan lama pada kelas untuk mengangkatnya. Sapuan biasa masih menatal halaman. |
| **Slot Pintar** | Menanda **masa terbaik** untuk sesuatu subjek terus pada grid jadual (kotak emas berjalur). Tekan satu untuk menempah. <br>Ia mengelak waktu sekolah, solat Jumaat, maghrib, kelas yang bertindih dan tamat lewat malam. Ia mengutamakan masa selepas sekolah, hari yang lapang, ruang rehat antara kelas dan subjek yang ada ujian SPM tidak lama lagi. <br>Cadangan yang sama muncul dalam borang Tempah dan dalam Tanya Sigma. |
| **Paparan Kelas** | Paparan skrin penuh untuk projektor atau TV kelas. Ia menunjukkan: <br>• kelas semasa, dengan masa berbaki <br>• kelas seterusnya hari itu <br>• buruj kelas: bintang pelajar menyala apabila admin menanda dia **Hadir** (tepat masa), bersama kiraan bintang skibidi <br>Tiada daftar masuk sendiri, kerana pelajar asrama tidak boleh memegang telefon dalam kelas. <br>Skrin kekal hidup (Screen Wake Lock) dan boleh dipaparkan skrin penuh. |
| **Tanya Sigma (pembantu AI)** | Faham Bahasa Melayu harian, termasuk singkatan dan campuran English ("esok", "ptg", "add math", "3pm"). Ia boleh: <br>• jawab "kelas apa sekarang", "jadual Rabu", "bila Fizik seterusnya" <br>• cari slot kosong <br>• **tempah kelas daripada satu ayat** ("tempah Kimia lusa 3-5 petang") <br>• **batal kelas** ("batal kelas Fizik esok") <br>• tunjuk kehadiran dan bintang skibidi <br>• kira hari ke SPM <br>Setiap tempahan dan pembatalan dipaparkan sebagai kad pengesahan dahulu. Pemahaman bahasa berjalan dalam pelayar, tanpa Internet. <br>Dalam pautan claude.ai, soalan bebas (contoh: konsep Fizik) dijawab oleh Claude bersama konteks jadual kelas. Input suara tersedia di pelayar yang menyokongnya. Buka dengan `Ctrl/⌘ + K`. |
| **Analitik baharu** | • Kad KPI dengan graf trend 14/30 hari <br>• **Radar keseimbangan subjek**: jam kelas tambahan setiap subjek, termasuk cadangan "paling kurang" berserta butang Slot Pintar <br>• **Peta haba 14 minggu** <br>• Hari dan waktu mula paling popular, serta penggunaan guru <br>• **Eksport CSV** untuk jadual penuh dan kehadiran (dibuka terus dalam Excel) |
| **Bintang skibidi & streak** | Setiap kelas yang dihadiri **tepat masa** (Hadir) ialah satu bintang skibidi. Lewat, dikecualikan dan tidak hadir tidak dapat bintang. Dashboard menunjukkan kadar kehadiran, jumlah bintang skibidi dan streak tepat masa: lewat atau tidak hadir memutuskan streak, dikecualikan tidak dikira. |
| **Kiraan SPM 2026** | Bilangan hari ke peperiksaan bertulis (23 Nov), serta garis masa Ujian Bertutur BM (26–29 Okt), BI (2–5 Nov) dan Amali Sains (Fizik 16 Nov, Kimia 17 Nov, Biologi 18 Nov). Tarikh ini juga ditanda dalam paparan Bulan. Jadual penuh ada di halaman **Jadual SPM**. Sumber: Lembaga Peperiksaan, KPM. |
| **Kongsi jadual** | Seminggu kelas boleh dihantar ke WhatsApp dalam format yang kemas. Setiap kelas boleh ditambah ke Google Calendar, atau dimuat turun sebagai fail `.ics` dengan peringatan 15 minit. |
| **Log masuk buruj** | 13 pelajar dipaparkan sebagai 13 bintang yang membentuk Σ. Tekan bintang anda untuk masuk. Bintang rakan yang sedang aktif mempunyai halo hijau. Selepas log masuk, bintang meluncur ke arah skrin (*warp*) sebelum dashboard muncul. |
| **Dashboard bento** | Jubin-jubin dashboard: <br>• kelas semasa, dengan cincin orbit yang mengira masa berbaki <br>• kiraan detik kelas seterusnya (angka bergolek) <br>• SPM, bintang skibidi dan buruj kelas <br>• garis masa hari ini dengan garis "sekarang" <br>• minggu sepintas lalu, kelas akan datang dan aktiviti terkini <br>• kotak Tanya Sigma |
| **Paparan Bulan & Senarai** | Bulan menunjukkan kepadatan kelas setiap hari serta tanda tarikh SPM. Senarai pula menunjukkan agenda 4 minggu. Kedua-duanya mempunyai carian dan penapis subjek. |
| **Aplikasi boleh dipasang (PWA)** | Apabila dihoskan di GitHub Pages, Netlify atau Vercel, laman ini boleh dipasang di telefon dan dibuka tanpa Internet. Ia mempunyai ikon sendiri dan pintasan Tempah, Jadual dan Paparan kelas. |
| **Jam aplikasi & sandaran (admin)** | Jam aplikasi boleh dilompat ke kelas seterusnya, +1 jam atau +1 hari. Data boleh dieksport, diimport (JSON) atau di-reset, dan sumbernya boleh ditukar antara Data sebenar dan Data demo. |
| **Langit hidup** | Latar belakang ialah langit berbintang (Canvas 2D) yang ditinted dengan warna subjek hari ini, dengan tahi bintang sekali-sekala. Langit bergerak sedikit mengikut kursor. |

## 2. Fungsi asal yang dinaik taraf

- **Tempah:** pratonton kelas secara langsung, garis masa hari itu, semakan pertembungan serta-merta, cip tarikh dan tempoh, serta cadangan Slot Pintar.
- **Batal ada "Buat asal".** Notifikasi kepada kelas hanya dihantar selepas tempoh buat asal tamat, jadi pembatalan tidak sengaja tidak sampai kepada sesiapa.
- **Extend pantas +15 / +30 / +45 / +60 minit**, dengan semakan pertembungan. *Extend tanpa had* kini benar-benar berterusan selepas masa tamat asal, sehingga dihentikan, dengan pembilang "lebih masa".
- **Kad kelas:** butang Extend, Kehadiran, Edit, Batal, Pulihkan dan Kongsi dalam satu tempat, serta kiraan bintang skibidi kelas itu.
- **Kehadiran (admin):** butang "Semua hadir", tanda bintang skibidi bagi setiap pelajar yang Hadir, dan butang **Tanda kehadiran** terus di Utama semasa kelas berlangsung.
- **Guru, Subjek, Rakan:**
  - Guru dan Subjek dipaparkan sebagai kad. Kad guru ada graf aktiviti 8 minggu, dan kad subjek ada cincin jam kelas.
  - Halaman perincian setiap guru dan subjek ada butang tempah dan Slot Pintar.
  - Halaman Rakan menunjukkan buruj kelas dan status aktif setiap pelajar.
- **Edit Kelas (admin):** penapis Akan datang / Selesai / Dibatalkan, butang Pulihkan, butang **Tambah kelas**, dan semua perubahan masih senyap (tiada notifikasi).
- **Jadual Tetap (admin):** papan seminggu dengan kad berwarna subjek.
- **Tetapan:**
  - semua `prompt()` asal diganti dengan dialog dalam halaman
  - jantina guru ditanda terus dengan butang L/P
  - suis **Kurangkan animasi** ditambah
- **Notifikasi:** toast tidak lagi berulang untuk tindakan anda sendiri. Toast sentiasa di atas dialog (Popover API).
- **Tema Malam & Subuh**, bertukar dengan bulatan yang berkembang dari butang (View Transitions API). Tema mengikut tetapan claude.ai pada lawatan pertama.
- **Responsif sepenuhnya:**
  - rel kaca di laptop dan tablet, bar tab dengan butang Tempah di tengah di telefon
  - dialog menjadi helaian bawah (*bottom sheet*) di telefon
  - tajuk besar bertukar ke bar atas apabila menatal

Semua fungsi asal kekal:

- log masuk pelajar, cikgu dan admin
- tempah, edit dan batal kelas
- pertembungan masa (PI/PM dikecualikan)
- extend dan kehadiran
- halaman Guru, Subjek, Pengguna, Statistik, Edit Kelas, Jadual Tetap dan Tetapan
- notifikasi dan log aktiviti
- model data Firestore yang sama

## 3. Tech stack

- **HTML, CSS dan JavaScript tulen.** Tiada *framework* dan tiada pustaka luar.
  - Kod ditulis sebagai 37 modul ES (`source/src/js`).
  - Modul digabungkan oleh `source/build.mjs`, pembina kecil tanpa pakej npm (Node 18 ke atas). Hasilnya satu skrip, jadi `index.html` juga berfungsi bila dibuka terus dari cakera.
- **API pelayar:**
  - View Transitions untuk pertukaran halaman dan tema
  - `<dialog>` untuk helaian dan dialog
  - Popover untuk toast
  - Pointer Events untuk seret & lepas, termasuk tekan lama di telefon
  - Screen Wake Lock dan Fullscreen untuk Paparan Kelas
  - Web Speech untuk input suara
  - Service Worker dan Web App Manifest untuk PWA
- **Grafik:** Canvas 2D untuk langit dan *warp*. Radar, peta haba, cincin dan graf dilukis dengan SVG dan CSS sendiri.
- **CSS:** token warna untuk dua tema, `backdrop-filter` (*glassmorphism*), `color-mix()`, `:has()`, `@property` dan susun atur grid bento.
- **Fon setempat:** TeX Gyre Adventor (GUST Font License) dan Inter (SIL OFL 1.1), dengan lesen disertakan.
- **AI:**
  - Pemahaman bahasa berasaskan peraturan berjalan dalam pelayar.
  - Dalam pautan claude.ai, Claude disambung melalui keupayaan `sample` claude.ai. Pengguna diminta kebenaran dahulu, dan kosnya dari akaun pengguna sendiri.
- **Backend sandbox** yang serasi dengan Firestore (`collection`, `doc`, `onSnapshot`, `batch`, `runTransaction`):
  - data disimpan dalam pelayar
  - penyegerakan antara tab
  - model data sama seperti Firestore asal, jadi aplikasi boleh disambung semula ke Firebase sebenar

## 4. Ujian yang dijalankan

Semua ujian dijalankan secara automatik dengan Playwright (Chromium). Keputusan: **0 ralat konsol**.

- **v4.0:** log masuk admin (kod betul, kod salah, sekatan selepas 5 cubaan, sesi admin palsu ditolak), pelajar tidak nampak alat Data, log masuk di telefon 360 dan 390 piksel (buruj Σ), tarikh bergerak di bar atas, jadual 24 jam (Hari, Minggu, Bulan), Jadual SPM (Kertas saya dan Semua kertas), Subjek dan perincian Subjek, Tambah kelas sehingga tanda kehadiran, Tetapan → Data, serta kedua-dua sumber data di telefon, tablet dan desktop.

- **Aliran penuh:**
  - log masuk pelajar, cikgu (nama ditaip) dan admin, termasuk kod salah
  - tempah, extend (termasuk ditolak kerana bertindih), batal dan buat asal
  - tanda kehadiran
  - jadual tetap
  - tetapan guru, jantina dan bengkel
  - lompat jam aplikasi
  - eksport CSV
  - tempahan melalui Tanya Sigma
  - seret, alih, ubah saiz dan carian dalam Jadual
  - tukar tema
- **Kehadiran dan bintang skibidi:** admin menanda Hadir dan Lewat, dan kiraan bintang di Utama dan Paparan Kelas dikemas kini. Lewat tidak dapat bintang, dan streak terputus apabila lewat.
- **Saiz skrin:** 390×844 (telefon), 844×390 (landskap), 820×1180 (tablet), 1366, 1440 dan 1920. Tiada tatal mendatar.
- **Mod luar talian:** service worker diuji, dan halaman dimuat semula tanpa Internet.
- **Persekitaran lain:** halaman diuji dibuka terus dari cakera (`file://`) dan dalam pembungkus claude.ai.

## 5. Struktur fail

```
index.html, app.js, app.css     laman siap guna (buka terus atau hoskan)
manifest.webmanifest, sw.js     PWA: pasang di telefon dan guna tanpa Internet
assets/fonts, assets/icons      fon (dengan lesen) dan ikon aplikasi
source/src/js/core              data, backend sandbox, store, logik domain (kehadiran, bintang skibidi)
source/src/js/ui, views, features, fx
                                antara muka, halaman, Tanya Sigma, Slot Pintar, langit
source/src/js/core/snapshot.js  data sebenar dari laman asal (salinan 5 Okt 2026)
source/src/js/core/sha256.js    semakan kod admin (cincangan sahaja, tiada kod)
source/src/css                  sistem reka bentuk (00-fonts hingga 14-spm)
source/build.mjs                pembina: node build.mjs (laman) | node build.mjs --artifact (claude.ai)
```

## 6. Hos sendiri

- **GitHub Pages:** muat naik kandungan zip ini ke satu repo. Pergi ke *Settings → Pages* dan pilih cawangan `main` / root.
- **Netlify:** seret folder ini ke https://app.netlify.com/drop.
- **Vercel:** buat projek baharu dan import folder ini (tiada langkah binaan).

Untuk membina semula daripada kod sumber, jalankan `cd source && node build.mjs`. Hasilnya ditulis ke `source/docs/`.

## 7. Nota keselamatan

- Kunci Firebase sebenar tidak disertakan.
- Kod admin tidak ditulis dalam fail ini atau dalam kod sumber. Aplikasi hanya menyimpan cincangan (hash) bergaram yang perlahan, dan menyekat borang selama 30 saat selepas 5 cubaan salah.
- Semakan kod berlaku dalam pelayar. Ia menjauhkan alat admin daripada pengguna biasa, tetapi bukan perlindungan pelayan. Untuk perlindungan penuh, perlu Firebase Authentication dan peraturan Firestore.
- Data sebenar disalin sekali sahaja (5 Okt 2026) dan tidak disegerakkan dengan laman asal. Semua perubahan disimpan dalam pelayar pengguna.
