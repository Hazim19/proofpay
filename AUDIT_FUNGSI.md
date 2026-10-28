# Audit Fungsi ProofPay — Fase B (API, Integritas Live, dan UI Svelte)

Tanggal audit: Rabu, 28 Oktober 2026 (sore, WIB)
Ruang lingkup: audit fungsional backend lewat API pada instance mock terpisah, pemeriksaan integritas read-only pada instance live, dan latihan UI Svelte baru pada instance mock.
Hasil ringkas: **semua uji lulus — 51 cek API/live dan 16 cek UI, 0 gagal. Tidak ditemukan bug backend.**

## 1. Metode dan isolasi data

| Aspek | Keterangan |
|---|---|
| Instance mock (semua mutasi) | Port 3103, `DATA_FILE=/tmp/proofpay-audit/db.json`, `PROOFPAY_SECRETS_FILE=/tmp/proofpay-audit/secrets.json` (file secrets sengaja tidak ada) |
| Instance live (read-only) | Port 3102. Hanya `GET /health`, `GET /api/contracts`, dan `GET /api/events`. Tidak ada satu pun POST ke port 3102 selama audit. |
| Health mock | `paypalMode: "mock"`, `paypalEnv: "sandbox"`, `aiMode: "stub"`, `aiModel: null` |
| Health live | `paypalMode: "live"`, `paypalEnv: "sandbox"`, `aiMode: "live"`, `aiModel: "gemini-3.8-flash"` |
| Syarat berhenti | Terpenuhi aman: aiMode mock adalah stub, bukan live, jadi seluruh alur dijalankan tanpa memanggil AI sungguhan dan tanpa menyentuh data live. |
| Brief uji API | `alpha bravo charlie delta echo foxtrot`, total USD 400. Stub membagi rata menjadi 2 milestone x USD 200, masing-masing 3 kriteria berbobot 0,5 / 0,3 / 0,2. |
| Kontrak API utama | `ct_5303ed25` (milestone `ct_5303ed25-m1` dan `ct_5303ed25-m2`) |
| Kontrak kasus gagal | `ct_c70ec33c` |
| Kontrak latihan UI | `ct_a8f799a4` (dibuat lewat formulir UI, bukan API) |

Cara skor stub (dari `src/ai/stubs.ts`): sebuah kriteria berstatus pass bila semua kata kuncinya ditemukan sebagai substring di teks deliverable, partial bila sebagian ditemukan, fail bila tidak ada yang ditemukan. Fraksi rilis adalah jumlah berbobot dengan partial dihitung 0,5.

Kata kunci yang dipakai:

| Milestone | Kriteria 1 (0,5) | Kriteria 2 (0,3) | Kriteria 3 (0,2) |
|---|---|---|---|
| m1 | alpha, bravo, charlie | format, complete, final | summary, how to, usage, notes |
| m2 | delta, echo, foxtrot | format, complete, final | summary, how to, usage, notes |

## 2. Hasil alur utama lewat API (mock, port 3103)

| # | Alur | Diharapkan | Aktual | Status |
|---|---|---|---|---|
| 1 | Buat kontrak `POST /api/contracts` (total 400) | 200, 2 milestone x 200, bobot 0,5/0,3/0,2 | 200, milestone 200 + 200, bobot sesuai | Lulus |
| 2 | Fund m1 `POST .../m1/fund` (mock = instan) | Status funded, order ID dan authorization ID terisi, ledger `milestone_funded` | Status funded, `paypalOrderId` dan `paypalAuthorizationId` terisi (awalan MOCKORDER-/MOCKAUTH-), ledger `milestone_funded` ada | Lulus |
| 3 | Submit deliverable lulus semua kriteria di m1 | Status submitted | Status submitted | Lulus |
| 4 | Verify m1 | overall pass, releaseFraction 1 | overall pass, releaseFraction 1, verifier `stub-v1`, ketiga kriteria pass | Lulus |
| 5 | Release m1 | released=true, payout 200, remainder 0, tanpa event refund | released=true, releaseAmount 200, remainder 0, tidak ada event `refunded` untuk m1 | Lulus |
| 6 | Urutan ledger m1 | milestone_funded, deliverable_submitted, verified, captured, payout_sent | Persis urutan itu | Lulus |
| 7 | Release m1 kedua kali | 409 | 409 `{"error":"milestone already released"}` | Lulus |
| 8 | Fund m2 | Status funded | Status funded | Lulus |
| 9 | Submit + verify m2 (parsial) | overall partial, releaseFraction 0,35 | overall partial, releaseFraction 0,35 (rincian di Bagian 3) | Lulus |
| 10 | Release m2 | released=true, payout 70, refund 130, ledger captured + refunded + payout_sent | released=true, releaseAmount 70, remainder 130, ketiga event ada dengan nominal cocok | Lulus |
| 11 | Kasus gagal: fund + submit tanpa kata kunci + verify (kontrak kedua) | overall fail, releaseFraction 0 | overall fail, releaseFraction 0, ketiga kriteria fail, status milestone menjadi failed | Lulus |
| 12 | Release pada kasus gagal | released=false, dana tetap tertahan, ledger `release_blocked` | HTTP 200 dengan released=false, status tetap failed (bukan released), ledger `release_blocked` ada | Lulus |
| 13 | Submit ulang setelah gagal | Diizinkan dari status failed, status kembali submitted | 200, status submitted, verifikasi lama dibersihkan | Lulus |

Catatan untuk baris 12: release yang terblokir karena verifikasi gagal memang dirancang mengembalikan HTTP 200 dengan `released: false`, bukan kode error. Perilaku ini konsisten dengan kode di `src/services/escrow.ts` dan diperlakukan sebagai lulus.

## 3. Verifikasi matematika pembagian dana (split)

### Milestone 1 — lulus penuh (fraksi 1,0)

| Komponen | Perhitungan | Hasil aktual |
|---|---|---|
| Payout ke freelancer | round2(200 x 1,0) | USD 200 |
| Refund ke klien | round2(200 − 200) | USD 0 (tidak ada event refund) |
| Event `captured` | Capture penuh atas otorisasi | USD 200 |
| Event `payout_sent` | — | USD 200 |

### Milestone 2 — parsial tepat 0,35

Deliverable yang dipakai: `delta summary`

| Kriteria | Kata kunci ditemukan | Status | Kontribusi |
|---|---|---|---|
| c1 (bobot 0,5): delta, echo, foxtrot | hanya delta | partial | 0,5 x 0,5 = 0,25 |
| c2 (bobot 0,3): format, complete, final | tidak ada (teks sengaja menghindari jebakan substring, misalnya kata "information" yang mengandung "format") | fail | 0,3 x 0 = 0 |
| c3 (bobot 0,2): summary, how to, usage, notes | hanya summary | partial | 0,2 x 0,5 = 0,10 |
| **Total releaseFraction** | | | **0,35** |

| Komponen | Perhitungan | Hasil aktual di API dan ledger |
|---|---|---|
| Payout ke freelancer | round2(200 x 0,35) | USD 70 (`payout_sent` amount 70) |
| Refund ke klien | round2(200 − 70) | USD 130 (`refunded` amount 130) |
| Event `captured` | Capture penuh dulu, lalu selisih direfund | USD 200 |
| Urutan ledger m2 | | milestone_funded, deliverable_submitted, verified, captured, refunded, payout_sent |

Angka 0,35 tercapai persis seperti direncanakan, dan payout + refund = 70 + 130 = 200, sama dengan nilai milestone. Tidak ada selisih pembulatan.

## 4. Hasil jalur error (semua di mock, saat m1 masih draft kecuali dinyatakan lain)

| # | Kasus | Diharapkan | Aktual | Status |
|---|---|---|---|---|
| 1 | Verify sebelum fund | 409 JSON `{error}` | 409 `milestone is draft, expected submitted` | Lulus |
| 2 | Release sebelum verify | 409 JSON `{error}` | 409 `milestone has not been verified yet` | Lulus |
| 3 | Submit sebelum fund | 409 JSON `{error}` | 409 `milestone is draft, expected funded (or failed, for revision)` | Lulus |
| 4 | ID kontrak tidak dikenal (GET dan POST fund) | 404 JSON `{error}` | 404 `contract ct_unknown123 not found` pada kedua cara | Lulus |
| 5 | ID milestone tidak dikenal | 404 JSON `{error}` | 404 `milestone m_unknown not found` | Lulus |
| 6 | Buat kontrak dengan brief kosong | 400 JSON `{error}` | 400 `brief is required` | Lulus |
| 7 | Buat kontrak dengan totalAmount 0 | 400 JSON `{error}` | 400 `totalAmount must be > 0` | Lulus |
| 8 | Release ganda setelah released | 409 JSON `{error}` | 409 `milestone already released` | Lulus |

Tidak ada jalur error yang menghasilkan HTTP 500 atau respons non-JSON.

## 5. Integritas instance live (port 3102, read-only)

Pemeriksaan pada kontrak `ct_3e86782b`, milestone 1 (nilai milestone USD 250):

| Field / cek | Diharapkan | Aktual | Status |
|---|---|---|---|
| GET /health | paypalMode live, aiMode live, model gemini-3.8-flash | live, live, `aiModel: "gemini-3.8-flash"` | Cocok |
| status milestone 1 | released | released | Cocok |
| paypalOrderId | 64S61796JT481531E | 64S61796JT481531E | Cocok |
| paypalAuthorizationId | 08413488AT325521Y | 08413488AT325521Y | Cocok |
| paypalCaptureId | 9YW53158V3301540E | 9YW53158V3301540E | Cocok |
| paypalRefundId | 9CW71170H4739574J | 9CW71170H4739574J | Cocok |
| paypalPayoutBatchId | FTT44H8732SPJ | FTT44H8732SPJ | Cocok |
| verification.releaseFraction | 0,85 | 0,85 | Cocok |
| verification.verifier | ai:gemini-3.8-flash | ai:gemini-3.8-flash | Cocok |
| Ledger `payout_sent` | USD 212,50 | USD 212,5 ada | Cocok |
| Ledger `refunded` | USD 37,50 | USD 37,5 ada | Cocok |

Konsistensi angka live juga terverifikasi: 250 x 0,85 = 212,50 dan 250 − 212,50 = 37,50. Data live tidak diubah oleh audit ini; hanya GET yang dikirim ke port 3102.

## 6. Latihan UI Svelte (mock, port 3103)

Marker `frontend/BUILD_DONE` muncul setelah polling berkala sekitar 10 menit sejak audit dimulai (jauh di dalam batas tunggu 60 menit). Instance mock di-restart dengan env yang sama agar server menyajikan `public/index.html` baru hasil build Svelte (server membaca file itu sekali saat startup), lalu health diperiksa ulang: tetap mock/stub.

Alat: Playwright dari venv `video/work/venv`, Chromium headless dengan proxy relay `127.0.0.1:18080` (bypass untuk 127.0.0.1/localhost). File JS AG Grid dari CDN disajikan dari salinan lokal byte-for-byte di `video/work/cdn/` dengan pola yang sama seperti skrip `capture*.py` lama, karena relay egress tidak selalu stabil untuk jsDelivr; aplikasi, API, dan datanya tetap dari instance mock sungguhan. Kontrak baru dibuat lewat formulir UI: `ct_a8f799a4`, milestone `ct_a8f799a4-m1`.

| # | Langkah UI | Bukti status di UI | Cross-check API (3103) | Status |
|---|---|---|---|---|
| 1 | Halaman dimuat | Judul ProofPay tampil, pill sidebar "PayPal: mock (sandbox)" dan "AI: stub" | health mock/stub | Lulus |
| 2 | Isi formulir (brief, email klien, email freelancer, total 400) lalu klik "Create contract from brief" | Kartu kontrak baru tampil, badge m1 = draft, stepper di langkah Draft, kriteria 50%/30%/20% tampil | Kontrak baru ada, m1 status draft, amount 200 | Lulus |
| 3 | Klik "Fund (authorize via PayPal)" (peran klien) | Badge berubah menjadi funded | Status funded, order ID dan authorization ID mock terisi | Lulus |
| 4 | Ganti peran ke "I am the Freelancer", isi deliverable, klik "Submit deliverable" di baris milestone | Panel freelancer tampil, badge berubah menjadi submitted | Status submitted | Lulus |
| 5 | Klik "Verify with AI" | Panel verdict tampil: "AI verification · pass", 100%, ketiga kriteria berlabel PASS, stepper Verified tercentang | verification overall pass, releaseFraction 1, verifier stub-v1 | Lulus |
| 6 | Ganti peran kembali ke "I am the Client", klik "Release per verification" | Badge berubah menjadi released, stepper kelima langkah tercentang, panel verdict tetap tampil 100% dengan "To freelancer USD 200.00" dan "Refunded to client USD 0.00" | Status released, capture ID dan payout batch ID terisi, tanpa refund ID, urutan ledger funded → submitted → verified → captured → payout_sent | Lulus |

Screenshot keadaan final (verdict + released) disimpan di `referensi-ui/screenshot-audit-svelte-verdict.png` (1920x1080, 211.517 byte) dan sudah dibuka serta diperiksa sendiri oleh auditor: panel verdict 100% PASS terbaca jelas, badge released dan kelima langkah stepper tercentang, ID order/authorisation/capture/payout batch tampil, dan milestone 2 di bawahnya masih draft sebagaimana mestinya. Di tepi atas frame terlihat sebagian kartu kontrak sebelumnya dari data uji API; itu kontrak lain pada daftar yang sama, bukan cacat tampilan.

## 7. Yang tidak bisa diuji di mock

Bagian ini memang di luar jangkauan instance mock/stub dan tidak diklaim teruji oleh audit ini:

| Hal | Alasan |
|---|---|
| Redirect persetujuan PayPal Checkout sungguhan | Mode mock mendanai seketika. Jalur live berhenti di status awaiting_approval dengan approvalUrl, lalu klien menyetujui di halaman PayPal dan kembali lewat `/fund/return`; rantai browser + PayPal itu hanya bisa diuji pada instance live/sandbox dengan akun PayPal sungguhan. |
| Confirm funding setelah approval (`confirm-fund`) | Hanya bermakna pada jalur live di atas; di mock fungsi ini bersifat jalan pintas idempoten. |
| Capture, refund, dan payout PayPal sungguhan | Di mock semua ID bertanda MOCK dan tidak ada uang bergerak. Integritas live di Bagian 5 membuktikan satu run live masa lalu tercatat konsisten, tetapi audit ini tidak menjalankan transaksi live baru (sesuai aturan read-only). |
| Verifikasi tanda tangan webhook PayPal | Tidak ada webhook PayPal asli yang masuk selama audit; di mock tidak ada kredensial untuk memverifikasi tanda tangan sungguhan. |
| Mutu drafting dan verifikasi AI live | Stub bersifat deterministik berbasis kata kunci. Penilaian model `gemini-3.8-flash` atas brief dan deliverable nyata, termasuk perilaku output model yang tidak valid (502), tidak diuji di sini. |
| Halaman `/connect` dan penulisan secrets | Tidak disentuh: mengganti secrets pada instance mana pun di luar cakupan audit, dan pada mock file secrets memang sengaja tidak ada. |
| CDN pihak ketiga secara langsung | AG Grid dan fon dimuat dari CDN; dalam latihan UI, JS AG Grid disajikan dari salinan lokal persis-sama demi stabilitas relay, jadi ketersediaan CDN publik saat itu juga tidak menjadi bukti audit ini. |

## 8. Bug dan observasi

**Bug backend: tidak ditemukan.** Seluruh alur, jalur error, matematika split, urutan ledger, dan penjaga release ganda berperilaku sesuai harapan.

Observasi minor (bukan bug fungsional, tidak memengaruhi skor atau uang):

- Pada stub, label kriteria 1 milestone 2 tetap menuliskan topik dari tiga kata pertama brief ("alpha bravo charlie"), padahal kata kunci kriteria itu adalah kata ke-4 sampai ke-6 brief (delta, echo, foxtrot). Skor dihitung dari kata kunci, yang benar, jadi ini murni ketidakcocokan teks label di mode stub. Mode live memakai drafter AI dan tidak memakai label templat ini.
- Event ledger `captured` selalu mencatat nominal penuh milestone (USD 200 pada kedua milestone uji), sedangkan pembagian payout/refund terjadi pada event berikutnya. Ini sesuai desain di kode (capture penuh, lalu refund selisihnya) dan konsisten dengan data live, jadi dicatat sebagai penjelasan, bukan temuan.

## 9. Penutup

Instance mock port 3103 dimatikan setelah laporan ini ditulis. Instance live port 3102 tidak diubah sama sekali. Artefak pendukung audit (skrip dan log) berada di `/tmp/proofpay-audit/` selama sesi ini: `audit.py`/`audit.log` (API), `ui_audit.py`/`ui.log` (UI), dan `results.json`/`ui-results.json`.
