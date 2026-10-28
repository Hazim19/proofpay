# Catatan Belajar Pemenang — untuk ProofPay (Fase A)
PayPal AI Hackathon, Devpost. Deadline 13 Nov 2026 03:00 WIB. Ditulis 28 Okt 2026.
Sumber utama: halaman resmi hackathon + halaman proyek Devpost yang dibaca penuh (daftar di bawah).

## 1. Kriteria resmi hackathon ini (patokan semua keputusan)
- 5 kriteria: Technological Implementation, Design, Potential Impact, Innovation/Idea, Presentation.
  Presentation eksplisit: video menunjukkan produk jalan ujung ke ujung + pitch menjawab masalah, untuk siapa, kenapa penting.
- Wajib: integrasi PayPal bermakna (sandbox) + AI bermakna, prototipe berfungsi (mockup statis gugur),
  repo publik berlisensi, demo hosted / instruksi jalan lengkap, video YouTube publik < 3 menit
  (juri tidak wajib menonton lewat 3 menit), tanpa musik/materi berhak cipta tanpa izin.
- Hadiah: umum $12.000/$8.000/$5.000; kategori $5.000: Most Creative, Most Impactful, Best Demo Delivery,
  Best Use of PayPal + AI, Best Use of Agentic Commerce; AG Grid $5.000/$2.000/3x $1.000.
  Juri AG Grid ikut menilai: Sylwia Vargas (AG Grid). Webinar resmi 12 Okt: "Build a payments dashboard".
  Sumber: https://paypalaihackathon.devpost.com

## 2. Contoh yang benar-benar dibaca
1. CrawlerPal — juara 1 PayPal Dev Days 2025 (agen paywall AI, PayPal APIs): https://developer.paypal.com/community/blog/winners-dev-days-hackathon/
2. Codebusters / Shopware 6 — juara 2 Dev Days 2025 (upgrade SDK v5 ke v6): https://www.shopware.com/en/news/shopware-at-paypal-dev-days-2025/
3. Anchor — juara 1 CockroachDB x AWS Agentic Memory Hackathon: https://www.cockroachlabs.com/blog/winners-cockroachdb-aws-hackathon-agentic-memory/
4. Kroxy — escrow + verifikasi agen-ke-agen (pembanding terdekat ProofPay): https://devpost.com/software/kroxy
5. ChainSettle — escrow B2B, AI verifikasi dokumen vs PO: https://devpost.com/software/chainsettle
6. VisionProof — escrow kreator, AI verifikasi konten lalu rilis bayar: https://devpost.com/software/visionproof
7. MNEE Sentinel — agen treasury, escrow terverifikasi AI + audit trail: https://devpost.com/software/mnee-sentinel
8. NexaGuard AI — QA otonom GitHub, lolos = rilis escrow, gagal = feedback: https://devpost.com/software/nexaguard-ai
9. ShipGuard — satu pertanyaan tajam sebagai judul konsep: https://devpost.com/software/shipguard
Catatan kejujuran: Kroxy/ChainSettle/VisionProof/Sentinel/NexaGuard adalah proyek unggulan sejenis di Devpost,
bukan juara terverifikasi hackathon ini; nilai mereka sebagai pembanding pola, bukan bukti trofi.

## 3a. Pola UI / presentasi produk
- Jadikan verifikasi yang tak terlihat menjadi terlihat, langkah demi langkah. ChainSettle menampilkan pipeline
  OCR -> cross-reference -> match -> trigger kontrak sebagai animasi UI; ProofPay: tampilkan cek per kriteria live.
- Ledger/audit trail sebagai layar hero, bukan halaman belakang. Kroxy memvisualkan hash-chain audit trail di
  dashboard; Sentinel menyediakan log terstruktur yang bisa diekspor CSV. ProofPay: AG Grid ledger di depan.
- Ekonomi terlihat dalam angka, bukan paragraf. ChainSettle: kalkulator diskon live yang bisa dimainkan juri
  (2% = 36% tahunan; dibayar menit, bukan 45-90 hari). ProofPay: rilis parsial dalam $ dan % di layar.
- Toggle peran dua sisi dalam satu UI. ChainSettle memakai role toggle buyer/supplier berbagi state;
  cocok untuk alur klien/freelancer ProofPay tanpa dua aplikasi.
- Galeri screenshot berurutan sesuai alur. VisionProof hanya 3 tangkapan, diberi label: homepage, Agreement,
  Verify & Release Payment — juri paham alur tanpa membaca panjang.
- Dashboard menyembunyikan kompleksitas. NexaGuard: logika blockchain dibuat tak terlihat, tampil seperti
  tool manajemen proyek biasa. ProofPay: ID transaksi PayPal tampil, jargon API tidak mendominasi.
- Bukti transaksi asli di dalam app. Sentinel menonjolkan transfer on-chain live + resi yang bisa diverifikasi;
  ProofPay: ID order/capture/payout sandbox asli terlihat di ledger, bukan angka karangan.

## 3b. Pola struktur video demo (< 3 menit)
- Hook masalah spesifik + angka di detik awal, bukan intro tim/logo. ChainSettle membuka dari fakta
  "60% UKM menunggu 45-90 hari"; pola sama dipakai naskah ProofPay (0:00-0:12) — pertahankan.
- Satu cerita utuh, satu transaksi, tanpa cabang. Kroxy: post job -> match -> kunci escrow -> verifikasi
  otonom -> settlement. ChainSettle mengaku demonya "menceritakan kisah lengkap < 3 menit, UI yang bicara".
- Sertakan momen gagal / sengketa, bukan hanya happy path. Kroxy menaikkan dispute ke arbitrase 3 juri;
  NexaGuard: gagal = komentar perbaikan spesifik, dana tetap terkunci. Ini adegan paling meyakinkan.
- Demo lightning-round menuntut kejelasan instan. Dev Days 2025 menilai finalis lewat demo cepat
  gaya "shark tank" di panggung; jadi kalimat pertama harus sudah menyebut produk + hasil.
- Tutup dengan dampak terukur + langkah berikut, bukan "terima kasih". Anchor menang dengan janji konkret:
  insiden ketiga selesai lebih cepat daripada yang pertama karena agen mengingat.
- Yang tidak bisa diverifikasi di riset ini: isi video YouTube para pemenang tidak bisa diputar/diambil
  teksnya dari alat riset ini (hanya metadata embed di Devpost). Pola video di atas disimpulkan dari
  deskripsi proyek, pengakuan pembuatnya, dan aturan resmi — bukan dari menonton videonya langsung.

## 3c. Pola struktur halaman proyek Devpost
- Urutan baku yang berulang di semua contoh: Inspiration -> What it does -> How we built it ->
  Challenges -> Accomplishments -> What we learned -> What's next. Ikuti persis; juri memindai, bukan membaca novel.
- Inspiration = ketegangan satu paragraf + satu pertanyaan. ShipGuard: "Is this repo safe enough to ship
  right now?"; NexaGuard: "What if trust wasn't a manual process, but a line of code?"
- What it does = alur bernomor pendek. VisionProof 4 langkah + satu baris penutup posisi produk;
  Kroxy 6 langkah, tiap langkah satu frasa tebal + satu kalimat.
- How we built it = per lapisan, sebut teknologi + alasan. Kroxy memisahkan kontrak, mesin verifikasi,
  pengadilan, gateway, MCP, SDK/dashboard; Sentinel memakai tabel Layer | Technology + diagram arsitektur ASCII.
- Challenges ditulis jujur dan teknis, bukan generik. Kroxy menyebut konsistensi juri LLM dan penilaian
  kualitas tanpa ground truth; NexaGuard menyebut halusinasi AI yang terlalu longgar + solusi double-check.
  Kejujuran seperti ini menaikkan skor Technological Implementation.
- Accomplishments = klaim ujung-ke-ujung yang bisa dicek ("tanpa intervensi manusia di langkah mana pun",
  "resi bisa diverifikasi"), bukan daftar fitur.
- What's next = kelanjutan produk yang masuk akal (Kroxy: streaming escrow per milestone, pasar template
  kondisi) — memberi sinyal Potential Impact tanpa mengarang yang sudah jadi.

## 4. Yang langsung kita terapkan ke ProofPay (peringkat dampak/usaha)
1. Video: pertahankan hook angka 12 detik + satu run utuh; pastikan adegan parsial/gagal tampil jelas
   (skor 85%, $212,50 cair, $37,50 refund) — itu momen pembeda dari escrow biasa. [sudah di VIDEO_SCRIPT.md, kunci]
2. Ledger AG Grid sebagai layar hero di video (close-up baris capture/refund/payout) + sebut eksplisit
   fitur grid yang dipakai (sort, filter, grouping) di Devpost, karena ada juri dan hadiah khusus AG Grid.
3. Halaman Devpost ikuti urutan baku 7 bagian; Inspiration ditutup satu pertanyaan tajam ala ShipGuard/NexaGuard.
4. Tambahkan panel "verifikasi live per kriteria" yang terlihat bergerak di UI demo (pola ChainSettle),
   bukan hanya badge hasil akhir.
5. Galeri Devpost cukup 3-4 screenshot berlabel alur: Buat Kontrak, Danai (Ditahan), Verifikasi, Rilis/Refund.
6. Bagian Challenges ditulis jujur: penegakan bukti di luar model, rilis proporsional, sinkronisasi webhook —
   plus cara mengatasinya. Jangan diisi kalimat generik.
7. Di video dan teks, tampilkan ID transaksi sandbox asli di ledger (pola Sentinel) dan satu angka dampak
   spesifik (hari menunggu -> menit) untuk kriteria Potential Impact.
8. Pastikan checklist formal tanpa celah: repo publik + lisensi terlihat, hosted demo hidup, daftar tool AI
   dinyatakan, video publik < 3:00 tanpa musik berhak cipta — kegagalan formal menggugurkan sebelum dinilai.

## 5. Keterbatasan riset
- Tidak ada akses browser live: video YouTube tidak ditonton, screenshot hanya dilihat sebagai label galeri
  Devpost, halaman rules terpisah tidak terambil utuh (isi submission diringkas dari halaman utama resmi).
- Tidak ditemukan pemenang "Best Use of AG Grid" terdahulu yang terverifikasi untuk ditiru; pola AG Grid
  di atas berasal dari kriteria, juri, dan webinar resmi hackathon ini, bukan dari proyek pemenang lama.

## 6. Referensi video pitch + catatan Remotion (ditambahkan 2026-10-28, untuk render ulang video)

### Remotion — apa itu, syarat render, lisensi
- Remotion = video dibuat sebagai komponen React: animasi digerakkan dari nomor frame
  (`useCurrentFrame`, `interpolate`, `spring`), lalu dirender dengan Chromium headless yang memotret
  tiap frame dan FFmpeg yang menjahitnya jadi MP4. Versi terpasang di proyek ini: 4.0.539.
  Sumber: https://github.com/remotion-dev/remotion dan https://www.remotion.dev/docs
- Syarat render lokal: Node.js, unduhan Chromium Headless Shell saat render pertama, FFmpeg untuk
  pengkodean akhir. Tidak ada layanan awan yang wajib dipakai untuk render lokal.
- LISENSI (terverifikasi dari berkas LICENSE.md resmi di repo, dibaca 2026-10-28): Remotion memakai
  lisensi khusus dua tingkat. **Free License** berlaku untuk (a) individu, (b) organisasi profit
  dengan ≤ 3 karyawan, (c) organisasi nirlaba, (d) yang sedang mengevaluasi. Pemegang Free License
  boleh memakai Remotion **gratis, termasuk untuk penggunaan komersial**, untuk membuat video/gambar.
  Company License ($25/seat/bulan untuk Creators, atau $0,01/render minimum $100/bulan untuk
  Automators) hanya wajib bagi organisasi profit di atas ambang itu. Peserta hackathon ini adalah
  **individu perorangan**, jadi pemakaian Remotion untuk video ProofPay **gratis dan sah** di bawah
  Free License. Sumber: https://raw.githubusercontent.com/remotion-dev/remotion/main/LICENSE.md dan
  https://www.remotion.dev/docs/license

### Pola video pitch/demo yang dipakai (dari contoh kuat + panduan juri)
- **Keputusan juri dibuat di ±20 detik pertama**: satu kalimat penawaran + masalah yang terasa,
  sebelum fitur apa pun. Struktur 3 menit yang terbukti: hook (0:00-0:15) → masalah (0:15-0:45) →
  demo satu alur utuh sebagai cerita pengguna (0:45-2:00) → cara kerja + teknologi sponsor
  (2:00-2:30) → dampak & penutup yang mengulang kalimat pertama (2:30-3:00).
  Sumber: https://deonmenezes.com/resources/how-to-win-hackathons
- **Satu "magic moment" yang diingat**, bukan sepuluh momen kecil: demo dibangun sebagai setup →
  turn → payoff di sekitar satu momen itu. Untuk ProofPay momennya adalah vonis parsial 85%:
  pekerjaan tidak sempurna, uang tetap bergerak adil. Sumber:
  https://angelhack.com/blog/10-tips-to-help-you-rock-your-next-hackathon-demo/ dan
  https://blog.paulserban.eu/post/the-hackathon-survival-guide-from-zero-to-demo-in-48-hours
- **Narasi tidak mendeskripsikan yang sudah terlihat di layar**; detik narasi dipakai untuk yang
  tidak terlihat (aturan bukti ditegakkan di kode di luar model, rel PayPal di balik layar).
  Sumber: AngelHack (tautan di atas).
- **Sebut nama model AI + cara mutu diperiksa** — juri kini menganggap "memakai LLM" sebagai
  baseline; yang dinilai adalah penamaan model (Gemini) dan mekanisme verifikasinya (bukti wajib
  dikutip per kriteria). Sumber: AngelHack (tautan di atas).
- Pola gerak dari showcase Remotion (https://www.remotion.dev/showcase — GitHub Unwrapped,
  SuperMotion, Mux/AnimStats): (1) tipografi kinetik — kata/frasa kunci muncul per ketukan mengikuti
  narasi, bukan paragraf statis; (2) tangkapan produk diberi koreografi zoom/pan lambat terarah ke
  elemen yang sedang dibicarakan, bukan slideshow diam; (3) angka dampak diungkap sebagai "data
  reveal" — nilai menghitung naik atau tersusun baris demi baris tepat saat narasi menyebutnya;
  (4) momen cap/stempel: elemen vonis menekan masuk dengan spring pendek (skala+rotasi) sebagai
  tanda baca visual di klimaks; (5) kartu judul dan penutup memakai sistem desain produknya
  sendiri, bukan templat generik — di ProofPay: register kertas Direction A + cap verifikasi.

### Uji kelayakan render di VM ini
- Uji 2026-10-28: komposisi uji 5 detik (150 frame, 1920×1080, gambar layar penuh + push-in +
  tipografi animasi + cap spring) dirender dengan Remotion 4.0.539 di VM 2-core ini.
  Total dinding 133 detik **termasuk** unduhan Chromium Headless Shell pertama + bundling;
  laju tunak terukur dari log progres ≈ 0,26 detik/frame. Proyeksi video penuh 4.008 frame
  ≈ 18–25 menit — di bawah ambang ~45 menit, jadi render Remotion **layak** dan dipakai.
  Frame uji diperiksa visual: push-in, judul animasi, dan cap "RELEASE 85%" tampil benar.

