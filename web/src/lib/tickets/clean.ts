// What may leave our server for the AI extraction of a ticket (docs/09 §5.1): the text of its ticket
// pages, with everything that names or reaches a person taken out first. The model only needs the
// show: its title, date, venue, category, seat and printed price. Fail closed: when anything that
// still looks like an ID number, an email or a phone number survives the cleaning, nothing is sent
// and the seller fills the form in by hand. Pure text in, text out: no file, no network, no storage.

export type CleanInput = {
  /** Text of each page, in order (pdf.js text layer). */
  pages: string[];
  /** Barcode payloads the decoder read off the file. Held in memory only, never stored. */
  payloads: string[];
  /** The seller's account name, and the ticket holder's name the seller typed. */
  names: string[];
};

export type Removal = "payload" | "labelled" | "nik" | "email" | "phone" | "code" | "name";

export type CleanResult =
  | { ok: true; text: string; pages: number[]; removed: Record<Removal, number> }
  | { ok: false; reason: "no_text" | "no_ticket_page" | "personal_data_left"; left?: Removal[] };

/** Bounds what one ticket can cost in tokens; a ticket's own facts fit well inside it. */
export const MAX_CLEAN_CHARS = 6000;
const MARK = "[x]";

// Words a ticket page carries, and words a page of terms carries.
const TICKET_WORDS =
  /\b(e-?ticket|e-?tiket|tiket|ticket|tanggal|date|venue|lokasi|location|gate|pintu|seat|kursi|row|baris|section|tribun|kategori|category|class|kelas|festival|harga|price|admission|entry|masuk|open gate|show|konser|concert)\b/gi;
const TERMS_WORDS =
  /\b(syarat|ketentuan|terms|conditions|kebijakan|policy|dilarang|prohibited|liability|tanggung jawab|refund policy|privacy|pasal|ayat)\b/gi;

// Labels whose value names or reaches the buyer, or identifies their order. EN and ID.
const LABELS = [
  "nama(?: lengkap| pemesan| pembeli| pemilik| pengunjung| penonton)?", "name", "full name", "holder", "ticket holder", "pemesan", "pembeli",
  "atas nama", "customer", "visitor", "attendee", "guest",
  "e-?mail", "surel", "phone", "telp\\.?", "telepon", "no\\.? ?(?:hp|handphone|telp|telepon|wa)", "hp", "mobile", "whats ?app", "wa",
  "nik", "ktp", "no\\.? ?ktp", "identitas", "id number", "identity(?: number)?", "passport", "paspor", "nomor identitas",
  "order(?: id| no\\.?| number| code)?", "no\\.? ?order", "pesanan", "no\\.? ?pesanan", "nomor pesanan", "kode(?: pesanan| booking| tiket| transaksi)?",
  "booking(?: code| id| no\\.?)?", "invoice(?: no\\.?| number)?", "transaction(?: id)?", "transaksi", "id transaksi", "ref(?:erence)?(?: no\\.?| number)?",
  "ticket(?: id| no\\.?| number| code)", "tiket(?: id| no\\.?)", "no\\.? ?tiket", "nomor tiket", "barcode", "qr(?: code)?", "voucher(?: code)?",
];
const LABELLED = new RegExp(`\\b(${LABELS.join("|")})\\s*[:：=]\\s*([^\\n|;]{1,120})`, "gi");

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
// Indonesian NIK: 16 digits, sometimes grouped with spaces, dots or dashes.
const NIK = /\b\d{4}[ .-]?\d{4}[ .-]?\d{4}[ .-]?\d{4}\b/g;
// Indonesian mobile numbers: +62 / 62 / 0, then 8, then 7 to 11 more digits, with optional separators.
const PHONE = /(?:\+62|\b62|\b0)[ .-]?8(?:[ .-]?\d){7,11}\b/g;
// Order and booking codes: long digit runs, and long tokens mixing letters with at least three
// digits ("ORD-2025-AB12CD34"), which leaves seat labels like "Section-B12" alone.
const DIGIT_RUN = /\b\d{10,}\b/g;
const MIXED_CODE = /\b(?=(?:[A-Za-z/_-]*\d){3})(?=(?:[\d/_-]*[A-Za-z]){2})[A-Za-z0-9][A-Za-z0-9/_-]{7,}\b/g;

// The last look before anything leaves, wider than the patterns above on purpose: an email with
// spaces around its @, a number with brackets or slashes. Anything here stops the text.
const LOOSE = {
  email: /[\p{L}\p{N}._%+-]+\s*(?:@|\(at\)|\[at\])\s*[\p{L}\p{N}-]+\s*(?:\.|\(dot\)|\[dot\])\s*[\p{L}]{2,}/gu,
  nik: /\b(?:\d[ .\-/]?){15}\d\b/g,
  phone: /(?:\+\s?62|\b62|\(?\b0)\s?\(?\s?8\)?(?:[\s.\-()/]{0,2}\d){7,11}/g,
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A name as it may be printed: any case, any spacing between its words. */
const nameRegex = (name: string) => new RegExp(name.trim().split(/\s+/).map(escape).join("\\s+"), "gi");

function count(text: string, re: RegExp) {
  return [...text.matchAll(re)].length;
}

/** Whether a page reads as a ticket rather than terms and conditions. */
export function isTicketPage(text: string) {
  const ticket = count(text, TICKET_WORDS);
  const terms = count(text, TERMS_WORDS);
  if (ticket === 0) return false;
  // Pages of terms are long and say "ticket" in passing; a ticket page is short and says it often.
  return terms === 0 || ticket >= 2 * terms || (text.length < 1500 && ticket >= terms);
}

export function cleanTicketText(input: CleanInput): CleanResult {
  const pages = input.pages.map((p) => p.replace(/[ \t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim());
  if (!pages.some((p) => p.length > 0)) return { ok: false, reason: "no_text" };
  const keep = pages.map((p, i) => (p && isTicketPage(p) ? i : -1)).filter((i) => i >= 0);
  if (!keep.length) return { ok: false, reason: "no_ticket_page" };

  const removed: Record<Removal, number> = { payload: 0, labelled: 0, nik: 0, email: 0, phone: 0, code: 0, name: 0 };
  const strip = (text: string, re: RegExp, kind: Removal) =>
    text.replace(re, () => {
      removed[kind]++;
      return MARK;
    });

  const payloads = [...new Set(input.payloads.map((p) => p.trim()).filter((p) => p.length >= 4))].sort((a, b) => b.length - a.length);
  const names = [...new Set(input.names.map((n) => n.trim()).filter((n) => n.length >= 3))];
  // Each word of a name on its own as well ("LUTHFI" printed without "HADI"), if it is a real word.
  const nameWords = [...new Set(names.flatMap((n) => n.split(/\s+/)).filter((w) => w.length >= 3))];

  let text = keep.map((i) => pages[i]).join("\n---\n");
  for (const p of payloads) text = strip(text, new RegExp(escape(p), "g"), "payload");
  // Labelled values first, while the label still says what the value is.
  text = text.replace(LABELLED, (_m, label: string) => {
    removed.labelled++;
    return `${label}: ${MARK}`;
  });
  text = strip(text, EMAIL, "email");
  text = strip(text, NIK, "nik");
  text = strip(text, PHONE, "phone");
  text = strip(text, DIGIT_RUN, "code");
  text = strip(text, MIXED_CODE, "code");
  for (const n of names) text = strip(text, nameRegex(n), "name");
  for (const w of nameWords) text = strip(text, new RegExp(`\\b${escape(w)}\\b`, "gi"), "name");
  text = text.replace(/(?:\[x\][ \t]*){2,}/g, `${MARK} `).trim();

  // Fail closed: look again, wider, and for anything we were told to remove.
  const left: Removal[] = [];
  if (count(text, LOOSE.email)) left.push("email");
  if (count(text, LOOSE.nik)) left.push("nik");
  if (count(text, LOOSE.phone)) left.push("phone");
  if (payloads.some((p) => text.includes(p))) left.push("payload");
  if (names.some((n) => nameRegex(n).test(text))) left.push("name");
  if (left.length) return { ok: false, reason: "personal_data_left", left };

  return { ok: true, text: text.slice(0, MAX_CLEAN_CHARS), pages: keep.map((i) => i + 1), removed };
}
