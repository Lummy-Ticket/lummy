// Route errors are written in Indonesian, the language most visitors read, and every page is in both
// languages, so a route sends its error twice: `error` in Indonesian and, where this table has it,
// `error_en` in English, and the page shows the visitor's language (UX review 5 Nov 2026, decision 6:
// checkout, payments and orders first, then listings and the ticket reader). One table rather than a
// second argument at every call: a message the table lacks still reaches the visitor, in Indonesian,
// and live:check fails on any literal message in those routes that has no English here. Messages
// from the database are English already and pass through as they are. No server code here, so the
// browser imports it too.

const EXACT: Record<string, string> = {
  "uangmu untuk pembayaran sebelumnya sudah dalam perjalanan; buka lagi pembayaran itu dan jangan kirim dua kali": "the money for your earlier payment is already on its way; open that payment again and do not send it twice",
  "jumlah tidak valid": "the amount is not valid",
  "aset ini tidak ditawarkan": "this asset is not offered",
  "quote gagal dibaca": "the quote could not be read",
  "contoh tiket tidak dikenal": "unknown sample ticket",
  "NEAR AI belum aktif di server ini": "NEAR AI is not set up on this server",
  "terlalu banyak permintaan; coba lagi sebentar lagi": "too many requests; try again in a moment",
  "bukti tidak lengkap": "the receipt is incomplete",
  "kontrak di NEAR belum bisa dibaca": "the contract on NEAR could not be read just now",
  "terlalu banyak percobaan; coba lagi beberapa menit lagi": "too many tries; try again in a few minutes",
  "saldo wallet gagal dibaca": "the wallet's balances could not be read",
  "permintaan ini harus dari halaman Lummy": "this request must come from a Lummy page",
  "pembayaran lewat NEAR Intents belum aktif di server ini": "payments through NEAR Intents are not set up on this server",
  "pembayaran mainnet lewat NEAR Intents khusus akun tim selama hackathon": "mainnet payments through NEAR Intents are for the team's accounts during the hackathon",
  "aset tidak dikenal": "unknown asset",
  "alamat refund harus alamat EVM": "the refund address must be an EVM address",
  "alamat wallet di chain asal tidak valid": "the wallet address on the chain you pay from is not valid",
  // Every route
  "database belum tersambung di server ini": "the database is not connected on this server",
  "masuk dulu": "sign in first",
  "masuk dulu untuk membeli": "sign in to buy",
  "masuk dulu untuk menjual": "sign in to sell",
  "masuk dulu untuk memeriksa tiket": "sign in to check a ticket",
  "masuk dulu untuk mengisi dari tiket": "sign in to fill the form from a ticket",
  "aksi tidak dikenal": "unknown action",
  "mode chain mati: kunci operator belum diset": "chain mode is off: the operator key is not set",
  "demo key salah atau belum diisi": "the demo key is wrong or missing",
  // Buying (api/orders, lib/orders/create)
  "listing tidak dikenal": "unknown listing",
  "pembayaran sekarang lewat QRIS: muat ulang halaman checkout": "payment is by QRIS now: reload the checkout page",
  "beli tanpa bayar sudah ditutup karena pembayaran sungguhan: bayar lewat QRIS": "buying without paying is closed now that payments are real: pay by QRIS",
  "acara ini dibayar dengan USDC dari wallet: muat ulang halaman checkout": "this show is paid in USDC from a wallet: reload the checkout page",
  "tiketnya baru saja dibeli orang lain, atau jumlahnya tidak tersedia": "someone else just bought these tickets, or that many are not available",
  "listing ini sudah tidak dijual": "this listing is no longer for sale",
  "tidak bisa membeli listing sendiri": "you cannot buy your own listing",
  "acara untuk listing ini tidak ditemukan": "the show for this listing was not found",
  "acara ini dibatalkan": "this show was cancelled",
  "penjualan ditutup karena acaranya sudah dimulai": "sales closed because the show has started",
  "penyelenggara acara ini melarang tiketnya dijual ulang": "this show's organiser does not allow its tickets to be resold",
  // An order (api/orders/[id] and its files)
  "pesanan tidak ditemukan": "order not found",
  "cuma pembeli dan penjual yang bisa melampirkan bukti": "only the buyer and the seller can attach proof",
  "bukti tidak bisa dilampirkan ke pesanan ini sekarang": "proof cannot be attached to this order now",
  "kirim foto JPEG, PNG, atau WebP": "send a JPEG, PNG or WebP photo",
  "foto lebih dari 10 MB": "the photo is over 10 MB",
  "cuma pembeli yang membuka dokumen serah-terima": "only the buyer opens the handover documents",
  "dokumen tidak dikenal": "unknown document",
  "cuma pembeli yang bisa mengajukan klaim": "only the buyer can file a claim",
  "klaim sudah tidak bisa diajukan untuk pesanan ini": "a claim can no longer be filed for this order",
  "alasan ini tidak bisa dipakai sekarang": "this reason cannot be used now",
  "cuma pembeli dan penjual yang bisa menjawab klaim": "only the buyer and the seller can answer a claim",
  "klaim ini sudah tidak terbuka": "this claim is no longer open",
  "jawabanmu sudah masuk": "your answer is already in",
  "tulis jawabannya dulu": "write your answer first",
  "lampiran tidak dikenal": "unknown attachment",
  "cuma staf yang bisa memutus": "only staff can decide",
  "staf tidak bisa memutus klaim di pesanannya sendiri": "staff cannot decide a claim on their own order",
  "tidak ada klaim terbuka di pesanan ini": "there is no open claim on this order",
  "putusan ini tidak tersedia untuk klaim ini": "this decision is not available for this claim",
  "klaim ini baru saja diputus": "this claim was just decided",
  "cuma pembeli yang bisa memilih refund": "only the buyer can choose a refund",
  "refund karena acara diundur tidak tersedia untuk pesanan ini": "a refund for a postponed show is not available for this order",
  "pesanan ini baru saja berubah": "this order just changed",
  "pesanan ini tidak punya file tiket": "this order has no ticket file",
  "pesanan ini sudah direfund, jadi file tiketnya ditutup": "this order was refunded, so its ticket file is closed",
  "file tiketnya tidak ditemukan": "the ticket file was not found",
  "tidak ada foto bukti dari pihak ini": "there is no claim photo from this side",
  // Payments (api/payments, lib/payments/checkout)
  "alamat wallet tidak valid": "the wallet address is not valid",
  "pembayaran USDC belum aktif di server ini": "USDC payment is not on yet on this server",
  "pembayaran QRIS belum aktif di server ini": "QRIS payment is not on yet on this server",
  "pembayaran tidak ditemukan": "payment not found",
  "status pembayaran gagal dibaca": "the payment status could not be read",
  "hanya pembeli yang bisa mengubah pembayaran ini": "only the buyer can change this payment",
  "simulasi cuma ada di mode test": "simulating a payment only works in test mode",
  "tanda tangan tidak lengkap": "the signature is incomplete",
  "acara ini dibayar dengan USDC dari wallet, bukan QRIS": "this show is paid in USDC from a wallet, not by QRIS",
  "listing contoh tidak dijual dengan uang sungguhan": "sample listings are not sold for real money",
  "masih ada pembayaran lain yang berjalan; selesaikan atau batalkan dulu": "another payment is still open; finish or cancel it first",
  // Selling (api/listings) and the ticket reader (api/tickets)
  "form tidak terbaca": "the form could not be read",
  "kirim file PDF tiketnya": "send the ticket's PDF file",
  "acara atau kategori tidak dikenal": "unknown show or category",
  "harga harus rupiah utuh": "the price must be in whole rupiah",
  "isi nama pemesan asli seperti tercetak di tiket": "type the original buyer's name as printed on the ticket",
  "pemeriksaan tiket belum aktif di server ini": "ticket checking is not on yet on this server",
  "pemeriksaan tiket gagal, coba lagi": "the ticket check failed, try again",
  "upload PDF tiketnya; tiket contoh tidak dipakai lagi": "upload the ticket's PDF; sample tickets are not used any more",
  "pilih salah satu tiket contoh": "pick one of the sample tickets",
  "acara tidak ditemukan": "show not found",
  "kategori ini bukan milik acara itu": "this category is not one of that show's",
  "jual tiket untuk acara di luar negeri belum dibuka": "selling tickets for shows abroad is not open yet",
  "acara ini sudah dimulai atau dibatalkan": "this show has started or was cancelled",
  "listing tidak ditemukan": "listing not found",
  "cuma staf yang bisa meninjau listing": "only staff can review listings",
  "staf tidak bisa meninjau listingnya sendiri": "staff cannot review their own listing",
  "cuma penjualnya yang bisa menarik listing ini": "only its seller can withdraw this listing",
  "ada pembeli yang sedang membayar listing ini; coba lagi setelah 20 menit": "a buyer is paying for this listing right now; try again after 20 minutes",
  "status listing ini sudah berubah": "this listing's status already changed",
  "cuma staf yang boleh membuka file tiket": "only staff may open ticket files",
  "listing ini tidak punya file tiket": "this listing has no ticket file",
  "link file gagal dibuat": "the file link could not be made",
  "link foto gagal dibuat": "the photo link could not be made",
  "akses file gagal dicatat, coba lagi": "opening the file could not be recorded; try again",
  "isi otomatis belum aktif di server ini": "filling from the ticket is not on yet on this server",
  "ketik dulu nama pemesan asli, supaya ikut dibuang sebelum tiketnya dibaca": "type the original buyer's name first, so it is taken out before the ticket is read",
  "isi otomatis gagal, isi sendiri ya": "filling from the ticket failed; please fill it in yourself",
  "barcode ini sudah pernah dijual di Lummy, jadi listing diblokir": "this barcode was already sold on Lummy, so the listing is blocked",
  "file ini bukan PDF": "this file is not a PDF",
  "PDF ini dikunci kata sandi, upload versi tanpa kata sandi dari penyelenggara": "this PDF is locked with a password; upload the organiser's copy without one",
  "PDF ini tidak bisa dibaca": "this PDF cannot be read",
  // The payout account (api/profile/payout)
  "permintaan ini bukan dari halaman Lummy": "this request did not come from a Lummy page",
  "bank tidak dikenal": "unknown bank",
  "nomor rekening 6 sampai 20 angka": "the account number is 6 to 20 digits",
  "akun tidak ditemukan": "account not found",
  // Attempt limits (lib/rate.ts)
  "terlalu banyak pemeriksaan tiket dalam 10 menit terakhir, coba lagi sebentar lagi": "too many ticket checks in the last 10 minutes; try again in a moment",
  "terlalu sering, coba lagi beberapa menit lagi": "too often; try again in a few minutes",
  "sudah terlalu banyak upload foto hari ini, coba lagi besok": "too many photo uploads today; try again tomorrow",
  "riset AI hari ini sudah mencapai batas, coba lagi besok": "today's AI research allowance is used up; try again tomorrow",
};

// Messages that carry a number or a reason in them.
const PATTERNS: [RegExp, string][] = [
  [/^1Click: ([\s\S]*)$/, "1Click: $1"],
  [/^jumlah tiket 1 sampai (\d+)$/, "1 to $1 tickets"],
  [/^selama pembayaran masih simulasi, satu akun paling banyak punya (\d+) pesanan berjalan$/, "while payments are simulated, one account can have at most $1 orders in progress"],
  [/^selama pembayaran masih mode test, satu akun paling banyak punya (\d+) pesanan berjalan$/, "while payments are in test mode, one account can have at most $1 orders in progress"],
  [/^foto bukti gagal dibaca: ([\s\S]*)$/, "the claim photo could not be read: $1"],
  [/^QRIS paling banyak (\S+) per pembayaran, sedangkan totalnya (\S+)\. Kurangi jumlah tiketnya\.$/, "QRIS takes at most $1 per payment, and the total is $2. Buy fewer tickets."],
  [/^terlalu banyak percobaan bayar dalam (\d+) menit terakhir; coba lagi sebentar lagi$/, "too many payment attempts in the last $1 minutes; try again in a moment"],
  [/^QRIS gagal dibuat: ([\s\S]*)$/, "the QRIS could not be created: $1"],
  [/^satu akun paling banyak punya (\d+) listing yang tayang atau direview$/, "one account can have at most $1 listings live or in review"],
  [/^satu listing paling banyak (\d+) tiket, pisahkan PDF-nya$/, "one listing holds at most $1 tickets; split the PDF"],
  [/^harga harus di antara 50% dan (\d+)% harga asli$/, "the price must be between 50% and $1% of face value"],
  [/^file tiket gagal disimpan: ([\s\S]*)$/, "the ticket file could not be stored: $1"],
  [/^file tiket dihapus (\d+) hari setelah acara, karena memuat data pribadi$/, "ticket files are deleted $1 days after the show, as they hold personal data"],
  [/^foto bukti dihapus (\d+) hari setelah klaim diputus, karena memuat data pribadi$/, "claim photos are deleted $1 days after the claim is decided, as they hold personal data"],
  [/^file lebih dari (\d+) MB$/, "the file is over $1 MB"],
  [/^NEAR AI tidak menjawab \(([^)]*)\)$/, "NEAR AI did not answer ($1)"],
  [/^demi keamanan, masuk ulang dulu: rekening hanya bisa diganti dalam (\d+) menit setelah masuk$/, "for your safety, sign in again first: the payout account can only be changed within $1 minutes of signing in"],
];

/** The English of a route's Indonesian error, or undefined when this table does not have it. */
export function englishFor(error: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(EXACT, error)) return EXACT[error];
  for (const [re, en] of PATTERNS) if (re.test(error)) return error.replace(re, en);
  return undefined;
}

/** The body a route sends for an error: the Indonesian, and the English where there is one. */
export const errorBody = (error: string) => ({ error, error_en: englishFor(error) });

/**
 * In the browser: an error body in the page's language. The page keeps <html lang> in step with the
 * language switch (lib/i18n.ts), so an English page shows the English where the route sent it.
 */
export function routeErrorText(json: { error?: unknown; error_en?: unknown }, status: number): string {
  const english = typeof document !== "undefined" && document.documentElement.lang === "en";
  if (english && typeof json.error_en === "string" && json.error_en) return json.error_en;
  return typeof json.error === "string" && json.error ? json.error : `HTTP ${status}`;
}
