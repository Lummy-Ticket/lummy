"use client";

// The rules of the marketplace, in the words of the policy the app already enforces (docs/01,
// "Kebijakan sengketa & refund"; lib/mock/escrow.ts). Change the rules and this page together.
// A draft until counsel has reviewed it.
import { CONTACT_EMAIL, CONTROLLER, LegalPage, type LegalSection } from "@/components/legal/LegalPage";

const sections: LegalSection[] = [
  {
    title: { en: "Who you are dealing with", id: "Dengan siapa kamu bertransaksi" },
    body: [
      CONTROLLER,
      {
        en: "Lummy stands between buyer and seller and holds the money until the show is over. The ticket is sold by the seller, not by Lummy, and Lummy is not the organiser.",
        id: "Lummy berdiri di antara pembeli dan penjual dan menahan uangnya sampai acara selesai. Tiketnya dijual penjual, bukan Lummy, dan Lummy bukan penyelenggara acara.",
      },
    ],
  },
  {
    title: { en: "This is a prototype", id: "Ini prototipe" },
    body: [
      {
        en: "Payments are simulated, or run with test USDC on the Arbitrum Sepolia test network, which has no money value. Nothing you do here moves real money, and penalties below are shown as they would apply, not charged.",
        id: "Pembayaran masih simulasi, atau memakai USDC uji di jaringan uji Arbitrum Sepolia yang tidak bernilai uang. Tidak ada yang kamu lakukan di sini yang memindahkan uang sungguhan, dan penalti di bawah ditampilkan sebagaimana nanti berlaku, tidak ditagihkan.",
      },
    ],
  },
  {
    title: { en: "Selling", id: "Menjual" },
    list: [
      { en: "Only sell a ticket that is yours to sell. Each show page says what its organiser allows; shows that forbid resale cannot be listed.", id: "Jual hanya tiket yang memang berhak kamu jual. Halaman tiap acara menyebut aturan penyelenggaranya; acara yang melarang dijual ulang tidak bisa dipasang." },
      { en: "The price must be between 50% and 150% of face value.", id: "Harga harus 50% sampai 150% dari harga asli." },
      { en: "We read every barcode in the PDF. A barcode already held by another listing is refused, and an edited-looking file or a listing close to the show waits for a person to look at it.", id: "Kami membaca setiap barcode di PDF. Barcode yang sudah dipegang listing lain ditolak, dan file yang tampak diedit atau listing yang dekat dengan acara menunggu dicek manusia." },
      { en: "The buyer receives the whole file you upload. Selling the same ticket elsewhere as well is fraud.", id: "Pembeli menerima seluruh file yang kamu upload. Menjual tiket yang sama di tempat lain juga adalah penipuan." },
      { en: "You are paid after the show, once the claim window has passed without a claim, or as a decision says.", id: "Kamu dibayar setelah acara, begitu masa klaim lewat tanpa klaim, atau sesuai putusan." },
    ],
  },
  {
    title: { en: "Buying", id: "Membeli" },
    list: [
      { en: "You pay the ticket price plus a service fee (5%, at least Rp25.000) and the e-stamp duty, all shown before you pay. The ticket price is held in escrow; the fee is not.", id: "Kamu membayar harga tiket ditambah biaya layanan (5%, minimal Rp25.000) dan bea e-materai, semuanya terlihat sebelum bayar. Harga tiket ditahan di escrow; biaya layanan tidak." },
      { en: "The ticket file and the handover documents are yours as soon as you pay. When you first open the ticket file is recorded, since it answers a \"never handed over\" claim.", id: "File tiket dan dokumen serah terima jadi milikmu begitu kamu bayar. Kapan kamu pertama membuka file tiket dicatat, karena itu yang menjawab klaim \"tidak diserahkan\"." },
      { en: "Without the organiser on board we cannot promise you get in. What we promise is the money back when you are turned away and can show it.", id: "Tanpa kerja sama penyelenggara, kami tidak bisa menjamin kamu masuk. Yang kami janjikan: uang kembali kalau kamu ditolak dan bisa membuktikannya." },
    ],
  },
  {
    title: { en: "When something goes wrong", id: "Kalau ada masalah" },
    list: [
      { en: "Silence settles it: 48 hours after the show with no claim, the seller is paid automatically.", id: "Diam berarti beres: 48 jam setelah acara tanpa klaim, penjual dibayar otomatis." },
      { en: "A claim needs evidence recorded at the time, such as a photo of the gate scanner, filed within the window. The seller may answer before staff decide.", id: "Klaim butuh bukti yang direkam saat kejadian, misalnya foto layar scanner gate, diajukan dalam masa klaim. Penjual boleh menjawab sebelum staf memutus." },
      { en: "Not going is not a refund case: resell the ticket before the show instead.", id: "Tidak jadi datang bukan alasan refund: jual lagi tiketnya sebelum acara." },
      { en: "A cancelled show is refunded in full, fee included, without anyone filing. A postponed show: keep the ticket for the new date, or take the money back, fee included, until the new show starts.", id: "Acara batal direfund penuh, termasuk biaya layanan, tanpa perlu mengajukan apa pun. Acara diundur: pakai tiketnya di tanggal baru, atau ambil uangmu kembali, termasuk biaya layanan, selama acara barunya belum mulai." },
      { en: "A seller whose ticket fails loses the sale and is charged a 40% penalty, except when the gate refused a genuine ticket over the name.", id: "Penjual yang tiketnya gagal kehilangan penjualan dan dikenai penalti 40%, kecuali kalau gate menolak tiket asli karena nama." },
    ],
  },
  {
    title: { en: "Not allowed", id: "Yang dilarang" },
    list: [
      { en: "Edited or fake tickets, false claims, or evidence that is not what it says.", id: "Tiket editan atau palsu, klaim palsu, atau bukti yang tidak sesuai kenyataan." },
      { en: "Someone else's account or someone else's personal data.", id: "Memakai akun orang lain atau data pribadi orang lain." },
    ],
    body: [{ en: "We may hold listings, refuse claims, or close accounts that do these.", id: "Kami boleh menahan listing, menolak klaim, atau menutup akun yang melakukannya." }],
  },
  {
    title: { en: "Your data", id: "Datamu" },
    body: [{ en: "How we handle personal data is on the privacy policy page, which is part of these terms.", id: "Cara kami menangani data pribadi ada di halaman kebijakan privasi, yang menjadi bagian dari ketentuan ini." }],
  },
  {
    title: { en: "The rest", id: "Lain-lain" },
    body: [
      {
        en: `These terms follow Indonesian law. They have not yet been reviewed by a lawyer and will be before Lummy takes real payments; when they change, the date at the top changes. Questions: ${CONTACT_EMAIL}.`,
        id: `Ketentuan ini mengikuti hukum Indonesia. Ketentuan ini belum ditinjau penasihat hukum, dan akan ditinjau sebelum Lummy menerima pembayaran sungguhan; kalau berubah, tanggal di atas ikut berubah. Pertanyaan: ${CONTACT_EMAIL}.`,
      },
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title={{ en: "Terms of use", id: "Syarat dan ketentuan" }}
      effective={{ en: "2 Oct 2026", id: "2 Okt 2026" }}
      intro={{
        en: "The rules of buying and selling on Lummy Ticket. They are the same rules the app enforces.",
        id: "Aturan jual beli di Lummy Ticket. Isinya sama dengan aturan yang dijalankan aplikasinya.",
      }}
      sections={sections}
    />
  );
}
