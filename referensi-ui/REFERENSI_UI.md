# Referensi UI — ProofPay Redesign Babak 2

Dokumen ini adalah hasil riset visual SEBELUM pembangunan ulang UI babak 2.
Semua perangkat visual di bawah berasal dari sumber nyata yang dibuka/diunduh
pada 2026-10-28 (pencarian web, pencarian gambar, fetch halaman publik).
Nilai hex dari pihak ketiga (Refero, Design Extractor, design-md) ditandai
sebagai *terukur dari situs publik*, bukan pedoman merek resmi. Screenshot
dashboard yang login-gated tidak bisa diakses; perangkat untuk layar tersebut
diambil dari dokumentasi resmi + ekstraksi terukur, dan ditandai apa adanya.

---

## 1. Stripe Dashboard / stripe.com

Sumber:
- https://stripe.com
- https://docs.stripe.com/dashboard/basics
- https://styles.refero.design/style/48e5de76-05d5-4c4e-a269-c7c245b291ec
- https://www.shadcn.io/design/stripe ; https://mobbin.com/colors/brand/stripe
- Gambar UI produk: https://images.stripeassets.com/fzn2n1nzq965/63zO5Z4CABvFl3pLLhnu3l/a9c12c883f820dc29d29fa0b9dcb0814/DatavizStatic3x.png?w=768&q=90
- Tangkapan situs (Refero): https://images.refero.design/styles/refero.design/image/2d6df304-37d6-483f-9f0a-02c7ee1e06ef.jpg

Perangkat yang dipinjam:
- Shell produk: sidebar kiri sebagai navigasi utama; konten = strip KPI di atas
  + grid di bawahnya. Sidebar ramping, item terakhir/terbaru naik ke atas.
- Warna (terdokumentasi luas): blurple primer `#635BFF`, ink/navy `#0A2540`,
  teks sekunder `#425466`, teks muted `#697386` / `#8898AA`, permukaan halus
  `#F6F9FC`, garis `#E6EBF1`, sukses `#09825D`. Ekstraksi situs pemasaran
  terkini (Refero): indigo `#533AFD`, hover `#7389FF`.
- Tipografi: satu keluarga (Söhne); bobot display justru RINGAN (300) dan 400
  untuk nav/tombol; tracking makin ketat seiring ukuran (−0,01 s.d. −0,025em).
- **Angka uang memakai `tnum` (tabular numerals)** — detail fintech paling
  mudah dipinjam dan paling terasa premium.
- Blok KPI = tipografi, bukan kotak: angka besar ringan + caption kecil di
  bawahnya, dipisah aturan garis/ruang, tanpa chrome kartu.
- Kedalaman tanpa bayangan: tangga tint latar; aksen hanya muncul pada
  aksi/tautan/ikon, tidak pernah sebagai isian besar atau teks tubuh.
- Radius kecil (4px pada tombol/input/kartu menurut Refero untuk situs
  pemasaran; ekstraksi lain memberi skala 4/8/12/9999px — ada konflik, jadi
  kami memilih kosakata radius sendiri yang konsisten, lihat arah akhir).

## 2. Mercury — mercury.com

Sumber:
- https://mercury.com
- http://styles.refero.design/style/3172cd4d-118a-4a16-a259-6b634d32322e
- Gambar dashboard: https://cdn.prod.website-files.com/601cf8dbc2fe9753267693a7/6198c8115d988d7cbc516365_mercury%20dashboard%20image.jpeg

Perangkat yang dipinjam:
- Kartu: radius 12px, padding lega 32px, tanpa border, tanpa bayangan —
  pemisahan antarpermukaan cukup dari satu langkah nilai warna.
- Semua kontrol berbentuk **pill** (tombol/input radius besar); satu aksen
  cobalt `#5266EB` dicadangkan hanya untuk aksi primer.
- Bobot huruf menengah yang tidak standar (360–480, display maksimal 480) —
  tidak pernah 600/700; kesan tenang dan mahal.
- Dashboard berwatak editorial seperti laporan keuangan: setiap layar menjawab
  "ini apa, dan apa yang bisa saya lakukan padanya"; status transaksi real-time
  ditampilkan sebagai urutan progres (pending → processing → completed).

## 3. Ramp — ramp.com

Sumber:
- https://ramp.com ; https://ramp.com/product-releases
- https://bakkenbaeck.com/case/ramp

Perangkat yang dipinjam:
- Prinsip warna: SATU aksen keras (kuning-lime `#E4F222` pada palet terkini)
  dijinakkan oleh tata letak konservatif netral hangat (`#F4F2F0`, tinta
  `#242422`) — "satu boleh keras, bukan dua-duanya".
- Sistem grafis produk "bento box": grid ubin fleksibel dari renggang ke padat
  untuk menampilkan transaksi multi-mata-uang di dekat UI asli.
- Halaman product-releases: daftar rilis yang rapat, polos, mudah dipindai
  (tag area + judul + satu baris deskripsi + tanggal) — model untuk ledger
  yang informatif tanpa dekorasi.

## 4. Linear — linear.app (tolok ukur kepadatan & shell)

Sumber:
- https://linear.app
- http://styles.refero.design/style/90ce5883-bb24-4466-93f7-801cd617b0d1
- https://stash.style/item/shot/linear-app-desktop ; https://freedesign.md/examples/linear.app
- Gambar UI produk resmi: https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/6600ca96-e49b-4fd9-c03a-7979faddad00/f=auto,fit=scale-down,metadata=none,width=2560

Perangkat yang dipinjam:
- Shell aplikasi: sidebar ±240px (`#161618` pada tema app) + toolbar 48px;
  baris daftar rapat 32–36px; lebar baca detail ±720px di tengah.
- Inter Variable sebagai satu-satunya huruf; bobot khas 510 (display) dan 590
  (penekanan), batas 590 — tidak ada 700+. Tracking −0,022em pada display.
- Kosakata radius hanya tiga: tombol 6px, kartu 12px, pill 9999px.
- Pemisahan dengan garis rambut 0,5–1px dan ring inset, bukan bayangan jatuh.
- ID/metadata dalam huruf mono (Berkeley Mono di Linear) — kami pakai
  ui-monospace untuk ID PayPal.
- Chip `kbd` mono kecil untuk petunjuk pintasan (tidak kami pakai, dicatat).

## 5. PayPal — paypal.com (bahasa status & bentuk)

Sumber:
- https://www.paypal.com/us/home
- https://www.pentagram.com/work/paypal (kasus rebrand 2024 oleh Pentagram)
- Panduan merek resmi 2022 (Newsroom Quick Guide, PDF dari hasil pencarian)
- https://www.design-extractor.com/gallery/paypal (terukur pihak ketiga)
- Gambar tombol checkout resmi: https://www.paypalobjects.com/ppdevdocs/v1/img/docs/checkout/vertical_web.png

Perangkat yang dipinjam:
- Kosakata status transaksi Activity: `Completed, Pending, Held, Refunded,
  Denied, Reversed` — status sebagai kolom yang bisa dipindai dalam tabel
  rapat, bukan kartu berwarna.
- Resolution Center: daftar kasus → panel detail berisi blok literal
  **"What happens next"** + tanggal estimasi — pola untuk panel vonis:
  keadaan + langkah berikutnya + konteks, dalam satu panel.
- Warna resmi 2022: Left Blue `#003087`, Middle Blue `#001C64`, Right Blue
  `#0070E0`, Slate `#001435`, Off-White `#FAF8F5`, Serenity `#E5F0FA`
  (Gold `#FFD140` sudah dibuang pada refresh 2024 — tombol bayar kini hitam).
- Bentuk: pill untuk semua CTA (±48px), kartu radius 24px, pemisahan lewat
  pergantian warna permukaan + udara vertikal; bayangan hanya pada lapisan
  melayang dan sangat difus.
- Mikrocopy kepercayaan menempel pada aksi ("payments are encrypted…"), bukan
  halaman terpisah.

## 6. Upwork — upwork.com (model siklus milestone)

Sumber:
- https://www.upwork.com/resources/securely-safely-pay-freelancers
- https://support.upwork.com/hc/en-us/articles/211063748-How-Fixed-Price-Payment-Protection-works-for-freelancers-on-Upwork
- https://www.portorocha.com/upwork/ (agensi rebrand 2021)

Perangkat yang dipinjam:
- Kontrak = tumpukan baris milestone; tiap baris: judul + deskripsi + tenggat
  + jumlahnya sendiri. Hanya milestone berikutnya yang perlu didanai.
- Label **`Funded` di samping milestone sebagai gerbang kerja** — status pill
  adalah sinyal keselamatan, bukan dekorasi.
- Rantai keadaan uang yang eksplisit: `In Escrow → Pending (tahan 5 hari) →
  Available`; pengajuan memulai hitung mundur review 14 hari yang terlihat.
- Satu aksi pengguna meledak menjadi beberapa baris ledger yang eksplisit
  (pendanaan 1 milestone = 3 entri di Transaction History).
- Hijau khas `#14A800` (terkorroborasi sekunder; bukan guideline resmi).
- Dashboard klien disusun sebagai antrean aksi ("Milestones to review"
  pertama), bukan analitik dulu.

## 7. Deel — deel.com (penyajian jumlah dua sisi)

Sumber:
- https://deel.com ; https://www.deel.com/solutions/payroll/
- https://www.deel.com/blog/weve-got-a-new-look/ (huruf resmi baru: Bagoss)
- http://styles.refero.design/style/5ec4eb4f-a37c-4787-b4c1-de49e01770e7 (terukur)
- Gambar UI resmi: https://www.deel.com/_next/image/?url=https%3A%2F%2Fwebsite-media.deel.com%2Fpayroll_1_6efe44c74e.webp&w=3840&q=75

Perangkat yang dipinjam:
- **Jumlah payer vs payee berdampingan di layar yang sama**: Total cost (sisi
  pembayar) / Net payout (sisi penerima) / Payment timing — perangkat Deel
  terkuat untuk panel rilis escrow (dibayar ke freelancer vs dikembalikan ke
  klien).
- Rincian biaya/FX ditampilkan SEBELUM bayar; status invoice terpantau ujung
  ke ujung: `Processing, Awaiting, Paid, Off Cycle`.
- Strip kepercayaan tepat di bawah hero: rating + jumlah review + deret logo
  + pita statistik volume.
- Bentuk terukur: tombol pill radius sangat besar, kartu radius 24px; aksen
  ungu dipakai hemat (satu kata pada headline / CTA).

## 8. Escrow.com — escrow.com (stepper kanonis)

Sumber:
- https://www.escrow.com/ ; https://www.escrow.com/learn-more/how-escrow-works/how-escrow-works
- https://domainsherpa.com/escrowcom-escrow/ (walkthrough UI login, sekunder)
- Gambar produk resmi: https://www.escrow.com/build/images/escrow-pay/home-escrow-pay.png

Perangkat yang dipinjam:
- **Stepper 5 simpul yang tetap**, kata kerja tengah berganti per kategori.
  Untuk milestone/jasa: *Agree on schedule → Buyer pays → Seller provides the
  service → Buyer approves the milestone → Escrow.com pays the seller*.
  Rilis selalu simpul ke-5.
- Banner di paling atas halaman transaksi yang menyatakan persis tindakan
  berikutnya yang dibutuhkan ("it's time to transfer…"), satu tombol Continue.
- Kolom kanan berisi linimasa riwayat transaksi kronologis — leluhur langsung
  panel ledger/audit kami.
- Panel kepercayaan institusional: lisensi + audit + statistik volume
  ($8,3 miliar+ diproses, 3,9 juta+ pelanggan) sebagai pita kredibilitas.
- (Warna Escrow.com tidak terverifikasi dari sumber mana pun pada riset ini —
  tidak ada hex yang dipinjam darinya.)

## 9. Konsep galeri desain (Dribbble/Contra/Behance)

Sumber yang benar-benar dilihat gambarnya:
- **Scrow — Dashboard Escrow (Dribbble)**: diunduh ke
  `referensi-ui/ref-dribbble-deal-dashboard.webp`. Sidebar nyaris hitam dengan
  logo + nav bergrup + kartu pengguna di dasar; konten abu terang; kartu
  "Your Active Contracts" dengan lingkaran avatar perusahaan, jumlah biru
  besar rata kanan, meta periode/klien dua kolom; daftar Transaction History
  dengan jumlah +/− hijau/merah.
  Gambar: https://cdn.dribbble.com/userupload/32949368/file/original-7e74b6f45ffb339a9368dbed3de592f4.png
- **FNSZ — Financial Dashboard (Dribbble)**: diunduh ke
  `referensi-ui/ref-dribbble-financial-dashboard.webp`. Sidebar biru-navy,
  kolom angka statistik (24.9k / 108) dengan delta %, satu kartu pahlawan
  **"Escrow Balance $3,823.90"** sebagai angka besar, bar mini per kanal
  (Paypal/Zipmark/Bank/Other).
  Gambar: https://cdn.dribbble.com/users/24825/screenshots/2616224/shot-financial_dashboard.png
- **Trove — Trustless escrow for freelancers (Contra, Théo Toussaint)**:
  https://contra.com/p/g27EN7l2-trove-trustless-escrow-for-freelancers —
  gambar: https://media.contra.com/image/upload/fl_progressive/q_auto:best/gwa6755ip0j5uyexs1qp.webp
  Kartu uang bertumpuk (Contract Amount + Bond → Total Vault) disambung ikon
  gembok lingkaran di jahitannya; chip status pill `Awaiting Bond`; rel kanan
  1/3 berisi kartu status + CTA pill putih penuh + daftar definisi Contract
  Details; strip tanggal tenggat; bagian Timeline di bawahnya. Palet gelap
  arang "premium tanpa agresif".
- **Holdyn — Escrow Alternative for Milestone Payments (produk nyata)**:
  https://holdyn.io/ — kartu "Protected transaction": chip ID + status
  `Active`, header dua pihak (Sender vs Beneficiary), trio uang
  `Transaction value / Held now / released` + pernyataan progres
  **"70% secured"**, jadwal milestone "Payment schedule — 2 of 4 released"
  (tiap baris: nama, tanggal, jumlah, label status), mikrocopy kepercayaan di
  bawah kartu ("Funds held by Stripe / Both sides confirm / Disputes freeze
  movement").
- **Gapsy — Marketplace Design Guide**: https://gapsystudio.com/blog/marketplace-ui-ux-design/
  — pola "escrow status bar": `Buyer Pays → Funds Held by Platform → Item
  Delivered → Seller Paid` sebagai bukti visual peran penengah.
- Konsep lain yang terverifikasi keberadaannya (judul/pembuat saja, tanpa
  klaim visual): PAYSEQURE — Escrow Dashboard (ProductChief, Dribbble),
  Escrow Web App (Asif Majeed, Dribbble), ShieldPay Case Study (Behance).

---

## ARAH VISUAL FINAL (satu arah, keputusan terukur)

**Shell:** Aplikasi dua kolom — sidebar gelap tetap 248px di kiri + area
konten terang. Sidebar berisi logo, navigasi jangkar (Overview, New contract,
Contracts, Ledger, How it works), dan di dasarnya pill status live PayPal/AI
+ catatan sandbox. Konten maksimal 1180px, padding 32–40px. Di layar sempit
sidebar berubah menjadi blok atas.

**Palet (hex):**
- Sidebar/ink: `#0B1220`; hover sidebar `#182238`; teks sidebar `#8B98B4`,
  item aktif putih di atas aksen.
- Aksen tunggal (aksi primer, langkah aktif, tautan): blurple Stripe
  `#635BFF`, hover `#5147E5`.
- Kanvas konten: `#F6F7F9`; kartu `#FFFFFF`; garis rambut `#E4E7EC` /
  `#EAECF0`.
- Teks: judul `#101828`, tubuh `#344054`, sekunder `#667085`, muted `#98A2B3`.
- Semantik: sukses/rilis `#067647` (latar `#ECFDF3`), parsial `#B54708`
  (latar `#FFFAEB`), gagal `#B42318` (latar `#FEF3F2`), AI `#6941C6`
  (latar `#F4F3FF`), info dana `#175CD3` (latar `#EFF8FF`).

**Tipografi:** Inter (Google Fonts, bobot 400/500/600/800) dengan fallback
system-ui; judul halaman 24px/600 tracking −0,02em; judul kartu 15–16px/600;
angka statistik 28px/600 dengan `tnum`; semua jumlah uang `tnum`; ID dan
metadata teknis dalam ui-monospace 12px.

**Kosakata bentuk:** radius kartu 16px, panel vonis 16px, tombol 10px, chip
999px — hanya itu. Bayangan tunggal lembut pada kartu
(`0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.08)`), selain itu
pemisahan dengan garis rambut. Padding kartu 20–24px.

**Lima elemen tanda tangan (wajib terlihat di screenshot):**
1. **Sidebar gelap** dengan pill status live di dasarnya (shell aplikasi,
   bukan halaman formulir).
2. **Baris statistik KPI** dari data API asli: jumlah kontrak, dana escrow
   yang sudah diautorisasi PayPal, total dibayar ke freelancer, total
   dikembalikan ke klien — angka `tnum` besar + caption muted (pola Stripe/
   Mercury: angka sebagai tipografi).
3. **Stepper siklus milestone 5 simpul** — Draft → Funded → Submitted →
   Verified → Released — keadaan selesai/aktif/gagal dirender dari status
   API sebenarnya (pola Escrow.com + Gapsy).
4. **Panel vonis AI gelap**: persen rilis raksasa (40px) + pemisahan uang
   dua sisi ala Deel ("to freelancer" vs "refunded to client") + bar
   proporsi; chip vonis per kriteria (bobot % + PASS/PARTIAL/FAIL + bukti
   teks) menyertainya.
5. **Ledger AG Grid bertema**: huruf Inter, garis rambut antarbaris, badge
   peristiwa berkode warna (uang hijau, AI ungu, pendanaan biru), di dalam
   kartu radius 16px.

## 10. BestWebsiteTemplate — galeri template terkurasi (sumber tambahan dari pengguna, 2026-10-28)

Sumber: https://bestwebsitetemplate.com/templates — 1.005 template dinilai
panel independen (6 desainer untuk Design, 5 developer untuk Dev; ambang
publikasi 7,0). Galeri ini mayoritas template LANDING/portfolio (Webflow/
Framer), bukan dashboard aplikasi — jadi yang dipinjam adalah bahasa
presentasi hero-nya, bukan shell-nya. Shell dashboard kami tetap dari
bagian 1–9. Gambar pratinjau yang diunduh untuk catatan internal (bukan
untuk dipakai di produk): `ref-bwt-cash-hero.webp`, `ref-bwt-moss-hero.webp`.

- **Cash — oleh JP (Webflow), Design 9,6 / Dev 9,7, $129.**
  https://bestwebsitetemplate.com/templates/webflow/cash
  Satu-satunya entri fintech murni di jajaran atas: untuk startup fintech/
  platform pembayaran. Terlihat langsung dari pratinjaunya: latar nyaris
  hitam, tipografi lavender RAKSASA sebagai seluruh hero (nama produk
  memenuhi layar), subline redup dengan satu frasa ditegaskan putih, kartu
  foto bertinta pastel masuk miring (transformasi 3D) dari tepi bawah,
  satu CTA pill berisi aksen lavender. Ulasan situs menambahkan: palet
  hitam/putih/pastel (lavender, pink lembut, koral, biru muda), satu huruf
  (Pretendard) diset besar dan bersih, dan satu varian landing dengan
  "metrics overlaid on a dark grid" — angka di atas permukaan gelap.
  DIPINJAM: (1) disiplin aksen lavender-di-atas-gelap untuk hero — hero
  kami memang gelap; eyebrow lavender ber-tracking lebar ditambahkan di
  atas headline dan skala headline dinaikkan (27px → 33px) agar pernyataan
  tipografinya terasa, mengikuti skala Cash/MOSS tanpa menjadi halaman
  pemasaran; (2) "metrik di atas gelap" sudah terwujud sebagai panel vonis
  gelap berpersen raksasa — dikonfirmasi sebagai momen yang tepat, bukan
  ditambah lagi. DILEWATI: kartu foto miring/3D dan wordmark memenuhi
  layar — perangkat pemasaran; di dashboard kepercayaan, momen 3D kami
  cukup satu (vault Three.js) dan angka harus tetap terbaca rapat.
- **MOSS — oleh Fouroom (Webflow), Design 9,8 / Dev 9,7, $49.** Skor
  Design tertinggi di galeri.
  https://bestwebsitetemplate.com/templates/webflow/moss
  Portfolio type-led: hero tipografi putih oversized di atas abu lembut,
  foto produk kecil melayang di tepi, SATU huruf (Inter Variable) untuk
  semua hal dari logo sampai headline raksasa, grid kerja bergaya bento,
  transformasi 3D halus pada reveal. DIPINJAM (konfirmasi arah yang sudah
  diambil): satu keluarga huruf untuk seluruh produk (Inter — sudah),
  angka KPI sebagai tipografi (sudah), dan ketenangan "type anchors every
  screen without shouting" sebagai uji rasa screenshot akhir.
- **Zeentra — oleh Framerbite (Framer), Design 9,7 / Dev 9,7, $79.**
  https://bestwebsitetemplate.com/templates/framer/zeentra
  Agensi pemasaran: hero blok warna bold, kartu rounded dengan latar
  bergantian (pink/biru/krem), spacing vertikal lega. DILEWATI hampir
  seluruhnya: terlalu playful untuk produk escrow yang menjual kepercayaan;
  satu-satunya gema yang sudah ada pada kami adalah pewarnaan tint semantik
  per panel (deliverable amber, vonis violet gelap).
- **Olyver — oleh FTC Studio (Framer), Design 9,6 / Dev 9,7, gratis.**
  https://bestwebsitetemplate.com/templates/framer/olyver
  Portfolio editorial: halaman dibaca sebagai spread majalah, bukan grid
  kartu; navigasi kecil uppercase; label kategori kecil pada entri.
  DILEWATI untuk shell (kami aplikasi, bukan editorial); dicatat karena
  membuktikan skor 9,6+ bisa dicapai dengan restraint, bukan dekorasi.
- **OneDollar — Framer, Design 8,3 / Dev 8,4, $79.** Entri bernama
  keuangan lain di situs ini ternyata template BLOG keuangan pribadi
  (dari rangkuman Best Framer Blog Templates 2026 di situs yang sama):
  estetika terang profesional, keterbacaan dan rasa percaya diutamakan.
  Di bawah ambang jajaran atas; dicatat agar tidak salah dikutip sebagai
  referensi dashboard.

Kesimpulan babak tambahan: tidak ada arah yang dibatalkan. Dua penyesuaian
kecil diterapkan ke build Svelte (eyebrow lavender + headline hero lebih
besar); sisanya dilewati dengan alasan di atas. Tidak ada kode/aset
template yang dibeli, diunduh, atau disalin — inspirasi visual saja,
diimplementasikan dengan kode sendiri.
