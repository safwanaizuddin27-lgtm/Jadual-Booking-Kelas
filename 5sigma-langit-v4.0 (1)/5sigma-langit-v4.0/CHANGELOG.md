# Changelog

## v4.0 · 5 Okt 2026 · Versi sebenar

Aplikasi ini bukan lagi demo. Ia bermula dengan data sebenar dari laman asal, dan semua jalan pintas demo dibuang.

### Bukan lagi demo

- **Kod admin sebenar.** Kod itu tidak ditulis dalam kod sumber: aplikasi hanya menyimpan cincangan (hash) bergaram yang perlahan. Lima cubaan salah berturut-turut menyekat borang selama 30 saat.
- **Butang "Cuba terus (demo)" dibuang** dari skrin log masuk:
  - pelajar masuk dengan menekan bintang sendiri
  - cikgu masuk melalui **Saya cikgu**
  - admin perlu kod admin
- **Data, jam aplikasi dan sandaran untuk admin sahaja.** Pelajar dan cikgu tidak lagi nampak pilihan Data demo.
- **Sesi admin lama perlu log masuk semula.** Sesi yang disimpan tanpa kunci yang sah ditolak.

### Kehadiran dan bintang skibidi

- **Daftar masuk dibuang** kerana pelajar asrama tidak boleh memegang telefon dalam kelas:
  - tiada lagi kod 4 digit atau butang Daftar masuk
  - Paparan kelas tidak lagi menunjukkan kod
  - kehadiran ditanda oleh admin, termasuk melalui butang **Tanda kehadiran** di Utama semasa kelas berlangsung
- **Bintang emas kini bintang skibidi**, dengan syarat baharu:
  - satu bintang hanya untuk **Hadir** (tepat masa)
  - **Lewat** tidak lagi dapat bintang
  - streak mengira kelas tepat masa berturut-turut: lewat atau tidak hadir memutuskannya, dikecualikan tidak dikira
- **Paparan kelas:** bintang pelajar menyala apabila admin menanda Hadir, bersama kiraan bintang skibidi dan kelas seterusnya hari itu.
- **Kadar kehadiran tidak berubah:** Lewat masih dikira hadir.

### Ditambah

- **Data sebenar dari laman asal** (salinan pangkalan data Firestore pada 5 Okt 2026):
  - 24 tempahan, termasuk yang dibatalkan, berserta rekod kehadiran
  - guru setiap subjek
  - rekod log masuk 8 pengguna
  - 60 log aktiviti dan 39 notifikasi
  - Data sebenar dipilih secara lalai. Data demo masih ada di **Tetapan → Data** (admin sahaja).
- **Halaman Jadual SPM** (menu SPM):
  - 86 kertas SPM 2026 disusun mengikut hari: ujian bertutur, amali, ujian mendengar dan kertas bertulis
  - kertas seterusnya dengan kiraan hari, dan jalur fasa Okt hingga Dis
  - penapis subjek
  - **Kertas saya** (pelajar PI hanya nampak kertas PI, pelajar PM hanya nampak kertas PM) atau **Semua kertas**
  - eksport ke kalendar (`.ics`)
- **Simbol untuk setiap subjek**: 10 ikon sendiri (BM, BI, Sejarah, Matematik, PI, PM, Add Math, Biologi, Kimia, Fizik). Ia dipaparkan di Jadual, Tempah, Subjek, Utama, Statistik, Edit Kelas, Jadual Tetap dan Paparan Kelas.
- **Tambah kelas dalam Edit Kelas (admin)** untuk kelas yang terlupa dimasukkan:
  - boleh pilih tarikh lepas (cip Kelmarin, Semalam, Hari ini)
  - kelas lepas direkod sebagai selesai, tanpa notifikasi kepada kelas
  - pilihan untuk terus tanda kehadiran selepas simpan
- **Kertas SPM dalam halaman perincian Subjek**, dan Tanya Sigma boleh menjawab "Bila SPM Fizik?".

### Diubah

- **Jadual sehari penuh**: grid Minggu dan Hari kini dari 00:00 hingga 24:00 (sebelum ini 07:00 hingga 22:30). Waktu malam dilorek lebih gelap.
- **Logo 5Σ**: Sigma huruf besar pada logo, ikon aplikasi, favicon, skrin log masuk dan Paparan Kelas.
- **Amali Sains mengikut hari masing-masing**: Fizik 16 Nov, Kimia 17 Nov, Biologi 18 Nov. Sebelum ini ketiga-tiganya ditunjukkan sebagai satu julat.
- **Guru Fizik** ialah Cikgu Norhani, mengikut tetapan laman asal.
- **Nama guru yang sama** dengan huruf besar/kecil berbeza (contoh: CIKGU AZURAH dan Cikgu Azurah) kini dikira sebagai seorang guru.
- **Tetapan → Data demo** dinamakan semula **Data**, dengan pilihan Data sebenar atau Data demo.

### Dibetulkan (telefon)

- **Nama Nathaneil dan Hazarinna** tidak lagi bertindih pada buruj Σ.
- **Tarikh di bar atas** yang terpotong kini bergerak perlahan supaya dapat dibaca sepenuhnya.
- **Medan borang Tempah** kini memenuhi lebar skrin.
- **Tarikh di bawah ucapan** di halaman Utama kini sebaris sendiri, rata ke kiri.
- **Pilihan Data sebenar / Data demo** disusun satu lajur supaya tidak sesak.

## v4.0 demo · 4 Okt 2026 · Pusingan 2, versi penuh

Ditulis semula dari awal sebagai 35 modul ES. Logik perniagaan dan model data Firestore asal dikekalkan.

### Ditambah

- **Jadual seret & lepas** (Minggu/Hari):
  - seret ruang kosong untuk menempah
  - seret kelas untuk mengalih (termasuk ke hari lain)
  - tarik hujung bawah untuk ubah masa tamat
  - tetapan 15 minit, cahaya merah apabila bertindih, pengesahan sebelum simpan, dan "Buat asal"
  - tekan lama untuk seret di telefon
- **Slot Pintar** pada grid jadual, dalam borang Tempah dan dalam Tanya Sigma.
- **Daftar masuk berkod + Paparan Kelas:**
  - kod 4 digit bertukar setiap 30 saat, dan kod lama ditolak kira-kira seminit selepas bertukar
  - buruj kelas yang menyala
  - Screen Wake Lock dan skrin penuh
- **Tanya Sigma v2:**
  - batal kelas dengan ayat
  - buka daftar masuk
  - kad pengesahan tempahan
  - jawapan Claude secara *streaming* dengan butang Henti (live demo)
  - input suara
- **Analitik:** KPI dengan graf trend, radar keseimbangan subjek berserta cadangan, peta haba 14 minggu, waktu popular dan eksport CSV (jadual serta kehadiran).
- **Bintang emas & streak kehadiran** di dashboard, profil dan Analitik.
- **Garis masa SPM 2026** di dashboard dan tanda tarikh dalam paparan Bulan.
- **Paparan Bulan dan Senarai** (agenda 4 minggu), carian dan penapis subjek.
- **Kongsi** ke WhatsApp, Google Calendar dan `.ics`.
- **Log masuk buruj Σ** dengan halo "sedang aktif" dan kesan *warp*.
- **Dashboard bento:**
  - cincin orbit kelas semasa
  - kiraan detik dengan angka bergolek
  - garis masa hari ini
  - minggu sepintas lalu
  - buruj kelas
- **PWA:** manifest, ikon, service worker, dan boleh digunakan tanpa Internet.
- **Jam demo** (lompat ke kelas seterusnya, +1 jam, +1 hari), serta eksport dan import sandaran JSON.
- **Suis "Kurangkan animasi"** dan tahi bintang sekali-sekala di langit.

### Diubah

- **Extend tanpa had** kini berterusan selepas masa tamat asal sehingga dihentikan, dengan pembilang lebih masa. Extend pantas +15 hingga +60 minit menyemak pertembungan dahulu.
- **Notifikasi pembatalan dan alihan** hanya dihantar selepas tempoh "Buat asal" tamat.
- **Guru, Subjek dan Rakan** dipaparkan sebagai kad dengan halaman perincian. Edit Kelas ada penapis status dan butang Pulihkan. Jadual Tetap dipaparkan sebagai papan seminggu.
- **Toast** tidak lagi berulang untuk tindakan sendiri, dan sentiasa kelihatan di atas dialog.
- **Susun atur responsif** untuk telefon, landskap, tablet dan skrin besar.

### Dibetulkan

- **Tempahan yang sedang ditaip** tidak lagi hilang apabila data dikemas kini setiap 30 saat.
- **Tarikh dalam ayat** kekal huruf besar ("Rabu, 7 Okt"), kecuali "hari ini" dan "esok".
- **Cadangan slot** tidak lagi mengutamakan kelas yang tamat lewat malam berbanding petang.

## v3.0 · Pusingan 2, versi pantas

Lapisan visual Langit 5σ dan Tanya Sigma, ditambah di atas aplikasi asal.

## v2.0 · Pusingan 1

Reka bentuk semula dengan semua fungsi asal dikekalkan.
