/**
 * The cleaner that stands between a ticket PDF and any AI model (docs/09 §5.1), on tickets written
 * the way Indonesian e-tickets are. What must survive: the show's title, date, time, venue,
 * category, seat and printed price. What must not: the holder's name (any case, whole or in part),
 * email, phone, NIK, order and booking codes, and the barcode payloads. Terms pages are left out, a
 * file without text sends nothing, and anything that still looks personal stops the text entirely.
 * Then the same on a real PDF made here, with its QR code also printed as text, through pdf.js and
 * the barcode reader. Offline: no network.
 *
 *   npm run clean:check
 */
import { PDFDocument } from "pdf-lib";
import { cleanTicketText, isTicketPage, MAX_CLEAN_CHARS, type CleanResult } from "../src/lib/tickets/clean";
import { prepareForExtraction } from "../src/lib/tickets/extract";
import { GENUINE, initWriter, ticketPdf } from "./ticket-fixtures";

const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note: ok ? undefined : note });

const PAYLOAD = "8992736451029384756";
const TICKET = `E-TICKET
Coldplay: Music of the Spheres World Tour
Sabtu, 15 November 2025 · Open Gate 16:00 · Show 19:00 WIB
Venue: Gelora Bung Karno, Jakarta
Kategori: CAT 1 · Section-B12 · Row 12 · Seat 34
Harga: Rp 3.500.000
Nama Pemesan: Luthfi Hadi
Email: luthfi.hadi@example.com
No. HP: 0812-3456-7890
NIK: 3171 2345 6789 0001
Order ID: ORD-2025-AB12CD34
Kode Booking: TIX8F3K2L9Q
Pemilik tiket: LUTHFI HADI
Selamat menonton, Luthfi!
${PAYLOAD}
Customer care +62 811-2233-4455 · cs@promotor.co.id
Ref INV/2025/10/000123 transaksi 20251015123456`;

const TERMS = `Syarat dan Ketentuan
1. Tiket yang sudah dibeli tidak dapat dikembalikan (refund policy berlaku sesuai kebijakan promotor).
2. Pemegang tiket dilarang membawa senjata, makanan dan minuman dari luar.
3. Promotor tidak bertanggung jawab atas kehilangan barang. Pasal ini berlaku untuk semua pengunjung.
4. Dengan membeli tiket, pemesan menyetujui ketentuan privacy dan terms and conditions yang berlaku.
`.repeat(6);

const clean = (pages: string[], names = ["Luthfi Hadi"], payloads = [PAYLOAD]) => cleanTicketText({ pages, payloads, names });
const text = (r: CleanResult) => (r.ok ? r.text : "");

// --- A ticket page and a terms page: the ticket is kept and cleaned, the terms left out.
const r = clean([TICKET, TERMS]);
const t = text(r);
check("a ticket with terms: cleaned and kept", r.ok, JSON.stringify(r).slice(0, 300));
check("only the ticket page goes", r.ok && r.pages.join() === "1", JSON.stringify(r.ok && r.pages));
for (const keep of ["Coldplay: Music of the Spheres World Tour", "15 November 2025", "16:00", "19:00", "Gelora Bung Karno", "CAT 1", "Section-B12", "Row 12", "Seat 34", "Rp 3.500.000"]) {
  check(`keeps the show's facts: ${keep}`, t.includes(keep), t);
}
for (const gone of ["Luthfi", "LUTHFI", "Hadi", "luthfi.hadi@example.com", "0812", "3456-7890", "3171", "0001", "ORD-2025", "AB12CD34", "TIX8F3K2L9Q", PAYLOAD, "811-2233", "cs@promotor", "000123", "20251015123456"]) {
  check(`removes personal data: ${gone}`, !t.toLowerCase().includes(gone.toLowerCase()), t);
}
check("says what kind of thing it removed", r.ok && r.removed.payload >= 1 && r.removed.labelled >= 5 && r.removed.name >= 1, JSON.stringify(r.ok && r.removed));
check("the labels stay, so the model knows a value was there", t.includes("Email: [x]") && t.includes("NIK: [x]"), t);

// --- Nothing to send.
check("a file without text sends nothing", clean(["", "  "]).ok === false && (clean(["", ""]) as { reason: string }).reason === "no_text");
check("only terms pages: nothing to send", (clean([TERMS]) as { reason?: string }).reason === "no_ticket_page", JSON.stringify(clean([TERMS])));
check("a ticket page is recognised, a terms page is not", isTicketPage(TICKET) && !isTicketPage(TERMS));

// --- Fail closed: what the strict patterns miss, the last look still catches.
const odd = (line: string) => clean([`E-TICKET Coldplay\nTanggal: 15 November 2025\nVenue: GBK\n${line}`], [], []);
const slashPhone = odd("Hubungi 0812/3456/7890 untuk info");
check("a phone written with slashes stops the text", !slashPhone.ok && slashPhone.reason === "personal_data_left" && !!slashPhone.left?.includes("phone"), JSON.stringify(slashPhone));
const bracketPhone = odd("Hubungi (0812) 3456-7890 untuk info");
check("a phone written with brackets is removed", bracketPhone.ok && !text(bracketPhone).includes("3456"), JSON.stringify(bracketPhone));
const spacedEmail = odd("Kirim ke luthfi @ example . com");
check("an email with spaces around the @ stops the text", !spacedEmail.ok && !!spacedEmail.left?.includes("email"), JSON.stringify(spacedEmail));
const slashNik = odd("3171/2345/6789/0001");
check("an ID number split by slashes stops the text", !slashNik.ok && !!slashNik.left?.includes("nik"), JSON.stringify(slashNik));

// --- The same data in other shapes is removed outright.
const shapes = clean([`E-TICKET Coldplay\nTanggal: 15 November 2025\n+62 812 3456 7890 / 6281234567890 / 3171234567890001 / luthfi+tix@mail.example.id`], [], []);
const st = text(shapes);
check("international and run-together phone numbers, a bare NIK, a plus-address: all removed", shapes.ok && !/\d{8}/.test(st.replace(/2025/g, "")) && !st.includes("@"), JSON.stringify(shapes));
const inline = clean(["E-TICKET Coldplay · Tanggal: 15 November 2025 · Nama: Siti Rahma | Kategori: CAT 2 | Kursi: A-15"], ["Siti Rahma"], []);
check("a name inside a line goes, the rest of the line stays", inline.ok && !text(inline).includes("Siti") && text(inline).includes("Kategori: CAT 2") && text(inline).includes("Kursi: A-15"), JSON.stringify(inline));
const partial = clean(["E-TICKET Coldplay\nTanggal: 15 November 2025\nWelcome SITI!"], ["Siti Rahma"], []);
check("part of a name on its own goes too", partial.ok && !/siti/i.test(text(partial)), JSON.stringify(partial));

// --- Dates, prices and names of shows are not personal data: none of them is taken or stops the text.
const page = (body: string, names: string[] = []) => clean([`E-TICKET Tulus: Manusia Tour\nKategori: VIP\n${body}`], names, []);
for (const date of ["08.11.2026 19.00", "08-11-2026 19:00", "08/11/2026 19:00 WIB", "08/14/2026 7:00 PM", "14-Nov-2026 19:00", "2026-Nov-14", "Sat 08 Nov 2026 19:00"]) {
  const d = page(`Tanggal: ${date}`);
  check(`a show date stays: ${date}`, d.ok && text(d).includes(date), JSON.stringify(d));
}
for (const keep of ["1.250.000 75.000 1.325.000", "14.11.2026 15.11.2026", "IDR1500000", "WeTheFest2026", "Java-Jazz-2026", "Section-B12"]) {
  const d = page(`Info: ${keep}`);
  check(`not an ID number or a code: ${keep}`, d.ok && text(d).includes(keep), JSON.stringify(d));
}
const named = page("Event Name: Coldplay Jakarta\nNama Acara: Tulus Manusia Tour");
check("the show's own name stays", named.ok && text(named).includes("Coldplay Jakarta") && text(named).includes("Tulus Manusia Tour"), JSON.stringify(named));

// --- Labels as tickets print them, with or without a colon: the value goes, the show's fields stay.
const labelled = page(
  [
    "Purchased by: James Wilson",
    "Issued to: Rina Wijaya",
    "Booked by: rizky.r",
    "Nama Peserta: Maya Sari",
    "Penerima: Fajar Nugroho",
    "Reservation No.: T2093847561",
    "Order #: 4-82731/JKT",
    "Tanggal Lahir: 12/03/1995",
    "Alamat: Jl. Melati Raya No. 5, Depok",
    "Jenis Kelamin: Perempuan",
    "Nama: Dewi Lestari Kategori: VIP",
  ].join("\n")
);
const lt = text(labelled);
check("labelled values are taken out", labelled.ok, JSON.stringify(labelled));
for (const gone of ["James", "Rina", "rizky.r", "Maya", "Fajar", "T2093847561", "82731", "1995", "Melati", "Perempuan", "Dewi"]) {
  check(`a labelled value goes: ${gone}`, labelled.ok && !lt.includes(gone), lt);
}
check("a value stops before the next field of the show", labelled.ok && lt.includes("Kategori: VIP"), lt);
const table = page("Nama Pemesan Budi Santoso\nHolder Siti Rahma Kategori VIP\nNama Pengunjung No. Identitas\nRizky Ramadhan 3174 0123 4567 8901\nHarga Rp 1.200.000");
const tt = text(table);
check(
  "a table without colons: the name after its label, and the row under a header of labels, go",
  table.ok && !/budi|siti|rizky|ramadhan/i.test(tt) && tt.includes("Kategori VIP") && tt.includes("Harga Rp 1.200.000"),
  tt
);
const codes = page("Reservasi RSV20261119001\nCustomer care (021) 5555 1234 · 021-2938-8888\nInfo +62 21 5555 1234");
check("codes after a few letters, and landlines, go", codes.ok && !/RSV2026|5555|2938/.test(text(codes)), text(codes));
const printedCode = clean(["E-TICKET Tulus\nKategori: VIP\nTanggal: 7 November 2026\n8842 7731 2290\nC-12 8842-7731-2290"], [], [GENUINE]);
check("the barcode's number printed in parts or with spaces goes", printedCode.ok && !text(printedCode).includes("7731"), JSON.stringify(printedCode));

// --- Bounded.
const long = clean([`E-TICKET Coldplay Tanggal Venue Kategori\n${"Kategori CAT 1 Seat ".repeat(1500)}`], [], []);
check(`never more than ${MAX_CLEAN_CHARS} characters`, long.ok && long.text.length <= MAX_CLEAN_CHARS, String(long.ok && long.text.length));

// --- A real PDF: text layer through pdf.js, the QR read by the decoder, then cleaned.
async function pdfChecks() {
  await initWriter();
  const pdf = await ticketPdf({
    codes: [{ text: GENUINE, format: "QRCode" }],
    producer: "Lummy test issuer PDF engine",
    extra: ["Tanggal: 14 November 2026 19:00 WIB", "Harga: Rp 1.250.000", "Email: zahra@example.com", "No. HP: 0813 2222 3333", "Order ID: ORD-2026-TL77QX19", GENUINE],
  });
  const r = await prepareForExtraction(pdf, ["Zahra Amelia"]);
  const out = r.ok ? r.text : "";
  check("a real PDF: its ticket text goes, cleaned", r.ok && out.includes("TULUS - Tur Manusia 2026") && out.includes("Istora Senayan") && out.includes("Rp 1.250.000"), JSON.stringify(r).slice(0, 300));
  check(
    "the code the decoder read is gone from the text, with the name, email, phone and order code",
    r.ok && r.removed.payload >= 1 && !out.includes("8842-7731-2290") && !/zahra/i.test(out) && !out.includes("0813") && !out.includes("TL77QX19"),
    out
  );
  const blank = await PDFDocument.create();
  blank.addPage([420, 595]);
  const scanned = await prepareForExtraction(await blank.save(), []);
  check("a PDF with no text layer (a scan, a screenshot) sends nothing", !scanned.ok && scanned.reason === "no_text", JSON.stringify(scanned));
}

async function main() {
  await pdfChecks();
  for (const x of results) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.name}${x.note ? `  (${x.note.slice(0, 240)})` : ""}`);
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks pass`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
