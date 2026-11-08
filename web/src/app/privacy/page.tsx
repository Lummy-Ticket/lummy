"use client";

// What Lummy keeps about people, why, who sees it, and for how long. Every line here describes what
// the code does today (retention: lib/retention.ts; barcodes: lib/tickets; photos: lib/evidence;
// USDC: lib/payments/usdc; emails: lib/email). Change the code and this page together. A draft until
// counsel has reviewed it.
import { CONTACT_EMAIL, CONTROLLER, LegalPage, type Bi, type LegalSection } from "@/components/legal/LegalPage";
import { FEATURES } from "@/lib/features";

// Email beyond the sign-in link is behind a flag (lib/features.ts, `emails`), so the lines about it
// follow the flag, the way the terms follow `eStamp`: while it is off the page says nothing is sent
// and alerts stay in the browser; turned on, it describes what is sent and that alerts sit on the
// account. Turning it on changes this page, so move `effective` below to that day as well.
const emailLines: { list: Bi[]; mailspace: Bi } = FEATURES.emails
  ? {
      list: [
        { en: "The sign-in link, when you ask for one.", id: "Link untuk masuk, saat kamu memintanya." },
        {
          en: "About your orders and listings: to the buyer when an order is paid, to the seller when their ticket sells and when a claim is filed (with a receipt to the buyer), to both when the claim is decided, to the buyer when a show is cancelled and the order refunded, and to the seller when staff decide a listing held for review or a show they requested. These are part of the sale you asked for, so they cannot be turned off.",
          id: "Soal pesanan dan listing-mu: ke pembeli saat pesanan dibayar, ke penjual saat tiketnya terjual dan saat klaim diajukan (dengan tanda terima ke pembeli), ke kedua pihak saat klaim diputus, ke pembeli saat acara batal dan pesanannya direfund, dan ke penjual saat staf memutus listing yang ditahan atau acara yang diajukannya. Email ini bagian dari transaksi yang kamu minta, jadi tidak bisa dimatikan.",
        },
        {
          en: "New tickets, only if you ask: when you follow a show or join a tier's waitlist, your account keeps which show or tier and when, and we email you when new tickets appear there, at most once every few hours for each show, and never about your own listing. Stop any time on the show's page or in your profile; every alert email says where.",
          id: "Tiket baru, hanya kalau kamu minta: saat kamu mengikuti acara atau masuk waitlist sebuah tier, akunmu menyimpan acara atau tier mana dan kapan, lalu kami mengirim email saat ada tiket baru di sana, paling banyak sekali dalam beberapa jam untuk tiap acara, dan tidak pernah untuk listing-mu sendiri. Berhenti kapan saja di halaman acara atau di profilmu; setiap email notifikasi menyebut caranya.",
        },
        {
          en: "When the payout account on your profile changes: the bank and the last 4 digits of the new account, so a change you did not make is noticed in time. This one cannot be turned off either.",
          id: "Saat rekening pencairan di profilmu diganti: nama bank dan 4 digit terakhir rekening barunya, supaya penggantian yang bukan olehmu cepat ketahuan. Email ini juga tidak bisa dimatikan.",
        },
        {
          en: "Every email goes to the address you sign in with and carries only your own order's details or the new listing, never the other side's name or email. A reply reaches our team inbox.",
          id: "Setiap email dikirim ke alamat yang kamu pakai untuk masuk dan hanya memuat data pesananmu sendiri atau listing barunya, tidak pernah nama atau email pihak lain. Balasanmu masuk ke kotak masuk tim kami.",
        },
      ],
      mailspace: {
        en: `Mailspace (DomaiNesia), the mail service of lummy.id, as our data processor: it delivers the sign-in email that Supabase writes for us, from no-reply@lummy.id, and the emails our server sends (see "Email we send"), from the same address, and holds our team inbox (${CONTACT_EMAIL}), where your messages and replies to us arrive.`,
        id: `Mailspace (DomaiNesia), layanan email lummy.id, sebagai prosesor data kami: mengantar email untuk masuk yang dibuat Supabase untuk kami, dari no-reply@lummy.id, dan email yang dikirim server kami (lihat "Email yang kami kirim"), dari alamat yang sama, serta menyimpan kotak masuk tim (${CONTACT_EMAIL}), tempat pesan dan balasanmu ke kami masuk.`,
      },
    }
  : {
      list: [
        { en: "Only the sign-in link, when you ask for one.", id: "Hanya link untuk masuk, saat kamu memintanya." },
        {
          en: "We send no email about orders, claims, cancelled shows or new tickets yet. This page will say when we start.",
          id: "Kami belum mengirim email soal pesanan, klaim, acara batal, atau tiket baru. Halaman ini akan menyebutnya saat kami mulai.",
        },
        {
          en: "Following a show or joining a tier's waitlist is kept only in your browser for now, and nothing is sent.",
          id: "Mengikuti acara atau masuk waitlist sebuah tier untuk sekarang hanya tersimpan di browser-mu, dan tidak ada yang dikirim.",
        },
      ],
      mailspace: {
        en: `Mailspace (DomaiNesia), the mail service of lummy.id, as our data processor: it delivers from no-reply@lummy.id the sign-in email that Supabase writes for us, and holds our team inbox (${CONTACT_EMAIL}), where your messages to us arrive.`,
        id: `Mailspace (DomaiNesia), layanan email lummy.id, sebagai prosesor data kami: mengantar dari no-reply@lummy.id email untuk masuk yang dibuat Supabase untuk kami, serta menyimpan kotak masuk tim (${CONTACT_EMAIL}), tempat pesanmu ke kami masuk.`,
      },
    };

// Error tracking runs only in a build that has Sentry's DSN (next.config.ts, lib/sentry), so its line
// follows the DSN the way the email lines follow their flag: what Sentry receives is what
// lib/sentry/scrub.ts lets through. Setting the DSN changes this page, so move `effective` below to
// that day as well.
const sentryLine: Bi[] = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? [
      {
        en: "Sentry, our error tracker, in the EU (Frankfurt): when a page or our server fails, it receives a report with the page address without its query, the browser and type of device, the error and where in our code it happened. No names, emails or ticket files are in it, and reports from your browser pass through our server first, so Sentry does not get your IP address. It keeps them for 30 days.",
        id: "Sentry, layanan pelacak error kami, di Uni Eropa (Frankfurt): saat sebuah halaman atau server kami gagal, Sentry menerima laporan berisi alamat halaman tanpa query-nya, jenis browser dan perangkat, error-nya, dan di bagian kode kami mana terjadinya. Nama, email, dan file tiket tidak ada di dalamnya, dan laporan dari browser-mu lewat server kami dulu, jadi Sentry tidak mendapat alamat IP-mu. Sentry menyimpannya 30 hari.",
      },
    ]
  : [];

const sections: LegalSection[] = [
  {
    title: { en: "Who is responsible", id: "Siapa yang bertanggung jawab" },
    body: [
      CONTROLLER,
      { en: `Write to ${CONTACT_EMAIL} for anything on this page.`, id: `Hubungi ${CONTACT_EMAIL} untuk apa pun di halaman ini.` },
    ],
  },
  {
    title: { en: "What we collect", id: "Data yang kami kumpulkan" },
    list: [
      {
        en: "Your account: your email address, and the name, WhatsApp number and payout account if you fill them in on your profile. Sign-in is by an email link, so we never hold a password.",
        id: "Akunmu: alamat email, serta nama, nomor WhatsApp, dan rekening pencairan kalau kamu mengisinya di profil. Masuk lewat link di email, jadi kami tidak pernah menyimpan password.",
      },
      // auth.sessions (Supabase Auth) keeps ip and user_agent per session; nothing here purges it.
      {
        en: "Each time you sign in: the IP address and the browser of that session, kept by our database's sign-in service while the session lasts (signing out ends it). Our hosting and database also log the IP address of each request for a short time.",
        id: "Setiap kali kamu masuk: alamat IP dan browser sesi itu, disimpan layanan login database kami selama sesinya berjalan (keluar akan mengakhirinya). Hosting dan database kami juga mencatat alamat IP tiap permintaan untuk waktu singkat.",
      },
      {
        en: "A ticket PDF you upload to sell. It usually carries the orderer's name and may carry an ID number, email or phone. We keep the file and its fingerprint (sha256). Barcodes read from it are kept only as a keyed hash: the code itself is never stored, and you see its last four characters. When you publish it, we also keep what the AI read from it (see below): the show, date, venue, category, seat, printed price and how many people it admits.",
        id: "PDF tiket yang kamu upload untuk dijual. Biasanya memuat nama pemesan, dan bisa memuat NIK, email, atau nomor HP. Kami menyimpan file dan sidik jarinya (sha256). Barcode yang terbaca hanya disimpan sebagai hash berkunci: kodenya sendiri tidak pernah disimpan, dan kamu cuma melihat empat karakter terakhirnya. Saat kamu mem-publish-nya, kami juga menyimpan yang dibaca AI darinya (lihat di bawah): acara, tanggal, venue, kategori, kursi, harga tercetak, dan untuk berapa orang.",
      },
      {
        en: "A photo you attach to a claim or an answer, and what is written in the file: when it was taken, where (GPS, when the phone kept it), the camera model, any editing app, and the barcodes in it (as a keyed hash).",
        id: "Foto yang kamu lampirkan ke klaim atau jawaban, dan yang tercatat di file-nya: kapan diambil, di mana (GPS, kalau HP menyimpannya), model kamera, aplikasi edit, dan barcode di dalamnya (sebagai hash berkunci).",
      },
      {
        en: "Orders, payments and claims: what was bought, the amounts, the QRIS payment's status and Xendit's payment number, when the handover documents were opened, what each side wrote, and the decision. At a show's door: when, and at which gate, your entry pass was scanned.",
        id: "Pesanan, pembayaran, dan klaim: apa yang dibeli, nominalnya, status pembayaran QRIS dan nomor pembayaran dari Xendit, kapan dokumen serah terima dibuka, apa yang ditulis tiap pihak, dan putusannya. Di pintu masuk acara: kapan, dan di gate mana, pass masukmu dipindai.",
      },
      {
        en: "If you pay for a show abroad in USDC: the address of the wallet you pay from. We keep it with the payment and the order to check that the payment was signed by that wallet, to send any refund back to it, and to limit how many open orders one wallet can have. It is test USDC on the Arbitrum Sepolia test network, which has no money value. You sign the payment in your own wallet app, which is not a service of ours; Lummy sends the transactions and pays their network fee.",
        id: "Kalau kamu membayar acara luar negeri dengan USDC: alamat wallet yang kamu pakai untuk membayar. Kami menyimpannya bersama pembayaran dan pesanannya untuk mengecek bahwa pembayaran ditandatangani wallet itu, mengembalikan refund ke wallet itu, dan membatasi jumlah pesanan terbuka per wallet. Yang dipakai adalah USDC uji di jaringan uji Arbitrum Sepolia, yang tidak bernilai uang. Kamu menandatangani pembayarannya di aplikasi wallet-mu sendiri, yang bukan layanan kami; Lummy yang mengirim transaksinya dan membayar biaya jaringannya.",
      },
      {
        // lib/rate.ts and the rate_attempts table: kind and time only. The daily cron deletes rows
        // older than a day, so one can last until the run after next: about two days at most.
        en: "When you check a ticket, list one, have the form filled in from it, or ask to upload a claim photo: the time, counted against your account, so that one account cannot repeat these without end. Nothing else about the attempt is kept.",
        id: "Saat kamu mengecek tiket, memasang listing, mengisi form dari tiket, atau meminta upload foto klaim: waktunya, dihitung untuk akunmu, supaya satu akun tidak bisa mengulangnya tanpa batas. Tidak ada hal lain soal percobaan itu yang disimpan.",
      },
      {
        // lib/files/access-log.ts and the file_access table (production audit 2 Nov 2026, M8).
        en: "When a member of our staff opens your ticket PDF or your claim photo (to review a listing or decide a claim): which staff account opened which file, and when, so it can always be said who saw it. You opening your own files is not recorded.",
        id: "Saat staf kami membuka PDF tiketmu atau foto klaimmu (untuk meninjau listing atau memutus klaim): akun staf mana yang membuka file mana, dan kapan, supaya selalu bisa dijawab siapa yang melihatnya. Kamu membuka file milikmu sendiri tidak dicatat.",
      },
      {
        en: "We do not accept photos of ID cards yet, and we run no analytics or advertising trackers. The site keeps a sign-in cookie, a language cookie (\"en\" or \"id\", so pages open in your language), and sample data in your browser.",
        id: "Kami belum menerima foto KTP, dan tidak memakai analytics atau pelacak iklan. Situs menyimpan cookie masuk, cookie bahasa (\"en\" atau \"id\", supaya halaman langsung terbuka dalam bahasamu), dan data contoh di browsermu.",
      },
    ],
  },
  {
    title: { en: "Why", id: "Untuk apa" },
    list: [
      { en: "To run the sale you asked for: list, hold the money, hand the ticket over, pay out or refund.", id: "Menjalankan transaksi yang kamu minta: memasang listing, menahan dana, menyerahkan tiket, mencairkan atau mengembalikan dana." },
      { en: "To stop the same ticket being sold twice and to catch edited files before they go live.", id: "Mencegah tiket yang sama dijual dua kali dan menangkap file editan sebelum tayang." },
      { en: "To fill in the sell form from your ticket, and to check that the category and date you picked are the ones printed on it.", id: "Mengisi form jual dari tiketmu, dan mengecek bahwa kategori dan tanggal yang kamu pilih memang yang tercetak di tiket." },
      { en: "To let each ticket through the door once, and to refund you on the spot when someone used it before you.", id: "Membiarkan tiap tiket masuk sekali saja, dan mengembalikan uangmu saat itu juga kalau ada yang memakainya lebih dulu." },
      { en: "To decide claims on evidence from both sides.", id: "Memutus klaim berdasarkan bukti dari kedua pihak." },
      { en: "To stop one account from tying up the ticket checks, the AI or our storage by repeating them.", id: "Mencegah satu akun membebani pengecekan tiket, AI, atau penyimpanan kami dengan mengulangnya terus." },
    ],
  },
  {
    title: { en: "Email we send", id: "Email yang kami kirim" },
    list: emailLines.list,
  },
  {
    title: { en: "Who sees it", id: "Siapa yang bisa melihat" },
    list: [
      { en: "Everyone: your listing and your public seller name, a first name and an initial (or \"Lummy seller\" if your profile has no name). Never your email.", id: "Semua orang: listing-mu dan nama publik penjual, nama depan dan inisial (atau \"Lummy seller\" kalau profilmu tanpa nama). Email tidak pernah." },
      // api/orders/[id]/ticket: the stand-in while payments are simulated.
      FEATURES.payouts
        ? { en: "The buyer of your ticket: the whole PDF you uploaded, since that is the ticket.", id: "Pembeli tiketmu: seluruh PDF yang kamu upload, karena itulah tiketnya." }
        : { en: "The buyer of your ticket: during the beta, only a stand-in with the order's details (show, category, number of tickets), never your PDF, since payments are simulated. Lummy staff open your PDF to review a listing the checks held back, and to rule on a claim.", id: "Pembeli tiketmu: selama beta, hanya file pengganti berisi data pesanan (acara, kategori, jumlah tiket), tidak pernah PDF-mu, karena pembayarannya masih simulasi. Staf Lummy membuka PDF-mu untuk meninjau listing yang ditahan pemeriksaan, dan untuk memutus klaim." },
      { en: "The other side of a claim, and Lummy staff: the photos and notes in that claim.", id: "Pihak lawan dalam klaim, dan staf Lummy: foto dan catatan di klaim itu." },
      // components/common/EvidencePhoto: shown on the order page, the seller's dashboard and the admin queue.
      {
        en: "Both sides of the order, and Lummy staff: where a claim photo was taken, if your camera saved its GPS position, with a link to it on Google Maps. A position at the venue helps a claim from the gate; when you do not need it, turn location off in your camera's settings.",
        id: "Kedua pihak di pesanan, dan staf Lummy: lokasi pengambilan foto klaim, kalau kameramu menyimpan posisi GPS-nya, lengkap dengan link ke Google Maps. Lokasi di venue membantu klaim dari gate; kalau tidak perlu, matikan lokasi di pengaturan kameramu.",
      },
      { en: "Anyone, on the public Arbitrum ledger: the state of an escrow or of a QRIS order's record, the amounts, and fingerprints of the payment, the ticket and the handover. No names, emails or files go on chain.", id: "Siapa pun, di buku besar publik Arbitrum: status escrow atau catatan pesanan QRIS, nominalnya, dan sidik jari pembayaran, tiket, serta serah terimanya. Nama, email, dan file tidak pernah masuk chain." },
      { en: "Anyone, for a show paid in USDC: the wallet you paid from, its payment into the escrow and any refund back to it. Whoever knows that wallet can see that it paid into Lummy's escrow, how much and when.", id: "Siapa pun, untuk acara yang dibayar dengan USDC: wallet yang kamu pakai untuk membayar, pembayarannya ke escrow, dan refund yang kembali ke wallet itu. Siapa pun yang tahu wallet itu bisa melihat bahwa wallet itu membayar ke escrow Lummy, berapa, dan kapan." },
    ],
  },
  {
    title: { en: "Services that hold it for us", id: "Layanan yang menyimpannya untuk kami" },
    list: [
      { en: "Supabase: the database and private file storage, in Singapore.", id: "Supabase: database dan penyimpanan file privat, di Singapura." },
      { en: "Vercel: the servers that run the site, in Singapore.", id: "Vercel: server yang menjalankan situs, di Singapura." },
      ...sentryLine,
      // .github/workflows/backup.yml: the nightly copy described under "How long we keep it", once
      // it runs (FEATURES.backups).
      ...(FEATURES.backups
        ? [{ en: "GitHub: holds the nightly encrypted copies of the database, which it cannot read (see \"How long we keep it\").", id: "GitHub: menyimpan salinan database terenkripsi setiap malam, yang tidak bisa dibacanya (lihat \"Berapa lama kami menyimpannya\")." }]
        : []),
      emailLines.mailspace,
      { en: "Arbitrum (a public blockchain): the escrow ledger described above.", id: "Arbitrum (blockchain publik): buku besar escrow seperti di atas." },
      { en: "Xendit: takes QRIS payments. For now it runs in test mode, so no real money moves, and it receives only the amount and a payment number, never your name or email.", id: "Xendit: menerima pembayaran QRIS. Untuk sekarang berjalan di mode uji, jadi tidak ada uang sungguhan yang berpindah, dan Xendit hanya menerima nominal dan nomor pembayaran, tidak pernah nama atau emailmu." },
      {
        en: "Anthropic (Claude, an AI service): when you fill the sell form in from your ticket, and when you publish it, our server sends Anthropic the ticket's text with the buyer's name, ID and phone numbers, email and order codes taken out. The PDF itself is never sent, and if an ID number, email or phone number is still found after that, nothing is sent. Anthropic does not use it to train its models, and deletes it within 30 days, or keeps it for up to 2 years only if it is flagged for breaking Anthropic's usage policy.",
        id: "Anthropic (Claude, layanan AI): saat kamu mengisi form jual dari tiketmu dan saat kamu mem-publish-nya, server kami mengirim ke Anthropic teks tiketnya setelah nama pemesan, nomor KTP dan HP, email, dan kode pesanan dibuang. File PDF-nya tidak pernah dikirim, dan kalau setelah itu masih ada NIK, email, atau nomor HP, tidak ada yang dikirim. Anthropic tidak memakainya untuk melatih model, dan menghapusnya dalam 30 hari, atau menyimpannya sampai 2 tahun hanya kalau ditandai melanggar kebijakan pemakaian Anthropic.",
      },
      { en: "Before we take real payments, this page will say so first.", id: "Sebelum kami menerima pembayaran sungguhan, halaman ini akan menyebutnya lebih dulu." },
    ],
    after: [{ en: "This means your data is stored outside Indonesia.", id: "Artinya datamu disimpan di luar Indonesia." }],
  },
  {
    title: { en: "How long we keep it", id: "Berapa lama kami menyimpannya" },
    list: [
      { en: "Ticket PDFs: deleted 30 days after the show, but never while an order on them still holds money or a claim is open.", id: "PDF tiket: dihapus 30 hari setelah acara, tapi tidak selama pesanan di atasnya masih menahan dana atau klaimnya masih terbuka." },
      { en: "Claim photos: deleted 30 days after the claim is decided, and where they were taken is removed from the claim record with them. What the checks concluded and the decision stay.", id: "Foto klaim: dihapus 30 hari setelah klaim diputus, dan lokasi pengambilannya ikut dihapus dari catatan klaim. Hasil cek dan putusannya tetap tersimpan." },
      {
        en: "Photos uploaded but never attached to a claim: deleted after 7 days, and sooner once you have three such photos on one order, when a new upload replaces the oldest.",
        id: "Foto yang di-upload tapi tidak pernah dilampirkan: dihapus setelah 7 hari, dan lebih cepat kalau sudah ada tiga foto seperti itu di satu pesanan, saat upload baru menggantikan yang paling lama.",
      },
      { en: "The count of your attempts above: deleted within two days.", id: "Hitungan percobaanmu di atas: dihapus paling lambat dua hari kemudian." },
      { en: "The record of staff opening your files: deleted after a year.", id: "Catatan staf membuka file-mu: dihapus setelah setahun." },
      { en: "Your account, orders, payments and claims: while your account exists, then as long as needed to settle anything still open. Records on the public ledger cannot be deleted by anyone.", id: "Akun, pesanan, pembayaran, dan klaim: selama akunmu ada, lalu selama dibutuhkan untuk menyelesaikan yang masih berjalan. Catatan di buku besar publik tidak bisa dihapus siapa pun." },
      // .github/workflows/backup.yml, once it runs (FEATURES.backups). Until then there are none.
      ...(FEATURES.backups
        ? [
          {
            en: "Backups: every night an encrypted copy of the database (accounts, orders, payments and claims, but not ticket PDFs or photos) is stored with GitHub, which cannot read it, and each copy is deleted after 14 days, so anything deleted from the database is gone from the copies within 14 days.",
            id: "Cadangan: setiap malam salinan database yang terenkripsi (akun, pesanan, pembayaran, dan klaim, tapi bukan PDF tiket atau foto) disimpan di GitHub, yang tidak bisa membacanya, dan tiap salinan dihapus setelah 14 hari, jadi data yang dihapus dari database ikut hilang dari salinannya paling lambat 14 hari kemudian.",
          },
          ]
        : [
            {
              en: "Backups: none yet. Nightly encrypted copies are built but not switched on; this page will say when they are, and how long each is kept.",
              id: "Cadangan: belum ada. Salinan terenkripsi setiap malam sudah dibuat tapi belum dinyalakan; halaman ini akan menyebutnya saat sudah, beserta berapa lama tiap salinan disimpan.",
            },
          ]),
      { en: "The wallet address you paid from: kept with its payment and order, for as long as they are. The payment itself stays on the public chain for good, and nobody, Lummy included, can delete it.", id: "Alamat wallet yang kamu pakai untuk membayar: disimpan bersama pembayaran dan pesanannya, selama keduanya disimpan. Pembayarannya sendiri tetap di chain publik selamanya, dan tidak ada yang bisa menghapusnya, termasuk Lummy." },
    ],
  },
  {
    title: { en: "Your rights", id: "Hakmu" },
    body: [
      {
        en: `Under Indonesia's Personal Data Protection Law (UU 27/2022) you may ask to see, correct or delete your data, or withdraw your consent. Write to ${CONTACT_EMAIL} from the email on your account. We answer as soon as we can and tell you if something cannot be deleted yet, for example while a sale is still in escrow.`,
        id: `Menurut UU Pelindungan Data Pribadi (UU 27/2022), kamu boleh meminta melihat, memperbaiki, atau menghapus datamu, atau menarik persetujuanmu. Kirim email ke ${CONTACT_EMAIL} dari alamat email akunmu. Kami menjawab secepatnya dan memberi tahu kalau ada yang belum bisa dihapus, misalnya selama transaksi masih di escrow.`,
      },
    ],
  },
  {
    title: { en: "Under 18", id: "Di bawah 18 tahun" },
    body: [
      {
        en: "Lummy is only for people 18 and older. If we learn an account belongs to someone under 18, we close it and delete its data, except what an open order or the law still needs.",
        id: "Lummy hanya untuk yang berusia 18 tahun ke atas. Kalau kami tahu sebuah akun milik orang di bawah 18 tahun, akun itu kami tutup dan datanya kami hapus, kecuali yang masih dibutuhkan pesanan yang berjalan atau diwajibkan hukum.",
      },
    ],
  },
  {
    title: { en: "How it is protected", id: "Cara kami melindunginya" },
    body: [
      {
        en: "Files sit in private storage that no browser can list or open. Each opening goes through our server, which checks who you are, then hands out a link that works for one minute. Database rows are readable only by the people on that order and by staff.",
        id: "File disimpan di penyimpanan privat yang tidak bisa didaftar atau dibuka browser mana pun. Tiap pembukaan lewat server kami, yang mengecek siapa kamu, lalu memberi link yang berlaku satu menit. Baris database hanya bisa dibaca pihak di pesanan itu dan staf.",
      },
    ],
  },
  {
    title: { en: "This is a beta", id: "Ini masih beta" },
    body: [
      {
        en: "Payments are simulated or run on a test network, so no real money moves. This policy has not yet been reviewed by a lawyer and will be before Lummy takes real payments. When it changes, the date at the top changes.",
        id: "Pembayaran masih simulasi atau berjalan di jaringan uji, jadi tidak ada uang sungguhan yang berpindah. Kebijakan ini belum ditinjau penasihat hukum, dan akan ditinjau sebelum Lummy menerima pembayaran sungguhan. Kalau berubah, tanggal di atas ikut berubah.",
      },
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title={{ en: "Privacy policy", id: "Kebijakan privasi" }}
      effective={{ en: "8 Nov 2026", id: "8 Nov 2026" }}
      intro={{
        en: "What Lummy Ticket keeps about you, why, who can see it, and when it is deleted. Written to match what the app actually does.",
        id: "Apa yang disimpan Lummy Ticket tentang kamu, untuk apa, siapa yang bisa melihatnya, dan kapan dihapus. Ditulis sesuai yang benar-benar dilakukan aplikasinya.",
      }}
      sections={sections}
    />
  );
}
