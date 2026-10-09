"use client";

// What Lummy keeps about people, why, who sees it, and for how long. Every line here describes what
// the code does today (retention: lib/retention.ts; barcodes: lib/tickets; photos: lib/evidence).
// Change the code and this page together. A draft until counsel has reviewed it.
import { CONTACT_EMAIL, CONTROLLER, LegalPage, type LegalSection } from "@/components/legal/LegalPage";

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
      {
        en: "A ticket PDF you upload to sell. It usually carries the orderer's name and may carry an ID number, email or phone. We keep the file and its fingerprint (sha256). Barcodes read from it are kept only as a keyed hash: the code itself is never stored, and you see its last four characters.",
        id: "PDF tiket yang kamu upload untuk dijual. Biasanya memuat nama pemesan, dan bisa memuat NIK, email, atau nomor HP. Kami menyimpan file dan sidik jarinya (sha256). Barcode yang terbaca hanya disimpan sebagai hash berkunci: kodenya sendiri tidak pernah disimpan, dan kamu cuma melihat empat karakter terakhirnya.",
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
        en: "We do not accept photos of ID cards yet, and we run no analytics or advertising trackers. The site keeps a sign-in cookie, and your language and sample data in your browser.",
        id: "Kami belum menerima foto KTP, dan tidak memakai analytics atau pelacak iklan. Situs menyimpan cookie masuk, serta pilihan bahasa dan data contoh di browsermu.",
      },
    ],
  },
  {
    title: { en: "Why", id: "Untuk apa" },
    list: [
      { en: "To run the sale you asked for: list, hold the money, hand the ticket over, pay out or refund.", id: "Menjalankan transaksi yang kamu minta: memasang listing, menahan dana, menyerahkan tiket, mencairkan atau mengembalikan dana." },
      { en: "To stop the same ticket being sold twice and to catch edited files before they go live.", id: "Mencegah tiket yang sama dijual dua kali dan menangkap file editan sebelum tayang." },
      { en: "To let each ticket through the door once, and to refund you on the spot when someone used it before you.", id: "Membiarkan tiap tiket masuk sekali saja, dan mengembalikan uangmu saat itu juga kalau ada yang memakainya lebih dulu." },
      { en: "To decide claims on evidence from both sides.", id: "Memutus klaim berdasarkan bukti dari kedua pihak." },
    ],
  },
  {
    title: { en: "Who sees it", id: "Siapa yang bisa melihat" },
    list: [
      { en: "Everyone: your listing and your public seller name, a first name and an initial (or \"Lummy seller\" if your profile has no name). Never your email.", id: "Semua orang: listing-mu dan nama publik penjual, nama depan dan inisial (atau \"Lummy seller\" kalau profilmu tanpa nama). Email tidak pernah." },
      { en: "The buyer of your ticket: the whole PDF you uploaded, since that is the ticket.", id: "Pembeli tiketmu: seluruh PDF yang kamu upload, karena itulah tiketnya." },
      { en: "The other side of a claim, and Lummy staff: the photos and notes in that claim.", id: "Pihak lawan dalam klaim, dan staf Lummy: foto dan catatan di klaim itu." },
      { en: "Anyone, on the public Arbitrum ledger: the state of an escrow or of a QRIS order's record, the amounts, and fingerprints of the payment, the ticket and the handover. No names, emails or files go on chain.", id: "Siapa pun, di buku besar publik Arbitrum: status escrow atau catatan pesanan QRIS, nominalnya, dan sidik jari pembayaran, tiket, serta serah terimanya. Nama, email, dan file tidak pernah masuk chain." },
    ],
  },
  {
    title: { en: "Services that hold it for us", id: "Layanan yang menyimpannya untuk kami" },
    list: [
      { en: "Supabase: the database and private file storage, in Singapore.", id: "Supabase: database dan penyimpanan file privat, di Singapura." },
      { en: "Vercel: the servers that run the site, in Singapore.", id: "Vercel: server yang menjalankan situs, di Singapura." },
      { en: `Mailspace: sends the sign-in email and holds our team inbox (${CONTACT_EMAIL}), where your messages to us arrive.`, id: `Mailspace: mengirim email untuk masuk dan menyimpan kotak masuk tim (${CONTACT_EMAIL}), tempat pesanmu ke kami masuk.` },
      { en: "Arbitrum (a public blockchain): the escrow ledger described above.", id: "Arbitrum (blockchain publik): buku besar escrow seperti di atas." },
      { en: "Xendit: takes QRIS payments. For now it runs in test mode, so no real money moves, and it receives only the amount and a payment number, never your name or email.", id: "Xendit: menerima pembayaran QRIS. Untuk sekarang berjalan di mode test, jadi tidak ada uang sungguhan yang berpindah, dan Xendit hanya menerima nominal dan nomor pembayaran, tidak pernah nama atau emailmu." },
      { en: "Before we turn on reading ticket details automatically with an AI service, or take real payments, this page will say so first.", id: "Sebelum kami menyalakan pembacaan data tiket otomatis dengan layanan AI, atau menerima pembayaran sungguhan, halaman ini akan menyebutnya lebih dulu." },
    ],
    body: [{ en: "This means your data is stored outside Indonesia.", id: "Artinya datamu disimpan di luar Indonesia." }],
  },
  {
    title: { en: "How long we keep it", id: "Berapa lama kami menyimpannya" },
    list: [
      { en: "Ticket PDFs: deleted 30 days after the show, but never while an order on them still holds money or a claim is open.", id: "PDF tiket: dihapus 30 hari setelah acara, tapi tidak selama pesanan di atasnya masih menahan dana atau klaimnya masih terbuka." },
      { en: "Claim photos: deleted 30 days after the claim is decided, and where they were taken is removed from the claim record with them. What the checks concluded and the decision stay.", id: "Foto klaim: dihapus 30 hari setelah klaim diputus, dan lokasi pengambilannya ikut dihapus dari catatan klaim. Hasil cek dan putusannya tetap tersimpan." },
      { en: "Photos uploaded but never attached to a claim: deleted after 7 days.", id: "Foto yang di-upload tapi tidak pernah dilampirkan: dihapus setelah 7 hari." },
      { en: "Your account, orders, payments and claims: while your account exists, then as long as needed to settle anything still open. Records on the public ledger cannot be deleted by anyone.", id: "Akun, pesanan, pembayaran, dan klaim: selama akunmu ada, lalu selama dibutuhkan untuk menyelesaikan yang masih berjalan. Catatan di buku besar publik tidak bisa dihapus siapa pun." },
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
    title: { en: "This is a prototype", id: "Ini prototipe" },
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
      effective={{ en: "9 Oct 2026", id: "9 Okt 2026" }}
      intro={{
        en: "What Lummy Ticket keeps about you, why, who can see it, and when it is deleted. Written to match what the app actually does.",
        id: "Apa yang disimpan Lummy Ticket tentang kamu, untuk apa, siapa yang bisa melihatnya, dan kapan dihapus. Ditulis sesuai yang benar-benar dilakukan aplikasinya.",
      }}
      sections={sections}
    />
  );
}
