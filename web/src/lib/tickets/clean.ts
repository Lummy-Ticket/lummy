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
// A ticket page is a few thousand characters; a file with far more text gets no more work for it.
const MAX_PAGE_CHARS = 20_000;
const MARK = "[x]";

// Words a ticket page carries, and words a page of terms carries.
const TICKET_WORDS =
  /\b(e-?ticket|e-?tiket|tiket|ticket|tanggal|date|venue|lokasi|location|gate|pintu|seat|kursi|row|baris|section|tribun|kategori|category|class|kelas|festival|harga|price|admission|entry|masuk|open gate|show|konser|concert)\b/gi;
const TERMS_WORDS =
  /\b(syarat|ketentuan|terms|conditions|kebijakan|policy|dilarang|prohibited|liability|tanggung jawab|refund policy|privacy|pasal|ayat)\b/gi;

// The show's own fields. A value taken out after a personal label stops before one of these, so
// "Nama: Budi Santoso Kategori: VIP" keeps its category.
const FIELDS =
  "kategori|category|kelas|class|grade|tipe|type|jenis|seat|kursi|baris|row|section|seksi|blok|block|tribun|zona|zone|sektor|sector|area|gate|pintu|tanggal|date|jam|time|waktu|venue|lokasi|location|harga|price|jumlah|qty|quantity|acara|event|show";

// Labels whose value is a person's name, EN and ID. These also count without a colon at the start
// of a line, the way a two-column table prints "Nama Pemesan   Budi Santoso", and a line of nothing
// but labels, one of them these, heads a row of values printed under it.
const NAME_LABELS = [
  "nama(?! (?:acara|event|konser|show|venue|tempat|lokasi|kategori|tiket|paket|promotor|penyelenggara|artis)\\b)(?: (?:lengkap|pemesan|pembeli|pemilik(?: tiket)?|pemegang(?: tiket)?|pengunjung|penonton|peserta|penerima|tamu|pelanggan|pengguna|akun))?",
  "(?<!(?:event|show|venue|ticket|tier|category|package|artist|promoter|organi[sz]er|concert|stage|seat|section|zone|file) )(?:full |first |last |given |family |holder |customer |guest |attendee |visitor |buyer |purchaser |member |account |user ?)?name(?! of\\b)",
  "(?:ticket ?)?holder", "pemesan", "pembeli", "pemilik(?: tiket)?", "pemegang(?: tiket)?", "atas nama",
  "(?:purchased|bought|booked|ordered|reserved|registered|paid) by", "(?:issued|sold|billed|bill|assigned) to", "(?:dipesan|dibeli|dibayar|didaftarkan) oleh",
];

// Labels whose value names, reaches or identifies a person or their order, followed by a colon.
const LABELS = [
  ...NAME_LABELS,
  "peserta", "penerima", "pengunjung", "penonton", "tamu", "pelanggan", "pengguna", "akun", "untuk",
  "customer", "visitor", "attendee", "guest", "participant", "buyer", "purchaser", "recipient", "member", "user", "account",
  "e-?mail", "surel", "phone(?: no\\.?| number)?", "tel(?:p|epon|ephone)?\\.?", "(?:no\\.?|nomor) ?(?:hp|handphone|ponsel|telp|telepon|wa|whatsapp)",
  "hp", "handphone", "ponsel", "mobile(?: no\\.?| number)?", "whats ?app", "wa", "contact", "kontak", "alamat", "address",
  "nik", "ktp", "(?:no\\.?|nomor) ?(?:ktp|identitas|paspor|passport|kartu)", "identitas", "id number", "identity(?: no\\.?| number)?", "passport(?: no\\.?| number)?", "paspor",
  "tanggal lahir", "tgl\\.? lahir", "tempat(?:,|/| dan)? ?tanggal lahir", "ttl", "date of birth", "birth ?date", "dob", "jenis kelamin", "gender", "usia", "umur", "age",
  "order(?: id| no\\.?| number| code| ref(?:erence)?)?", "(?:no\\.?|nomor|id) ?(?:order|pesanan|invoice|transaksi|tiket|reservasi|referensi|ref|booking|member|pelanggan)", "pesanan",
  "kode(?: (?:pesanan|pemesanan|booking|tiket|transaksi|reservasi|konfirmasi|unik|referensi|akses|voucher|bayar|pembayaran|tukar))?",
  "booking(?: code| id| no\\.?| number| ref(?:erence)?)?", "invoice(?: no\\.?| number| id)?", "receipt(?: no\\.?| number)?", "kwitansi",
  "transaction(?: id| no\\.?| number)?", "transaksi", "ref(?:erence)?(?: no\\.?| number| code)?", "referensi",
  "reservation(?: id| no\\.?| number| code)?", "reservasi", "confirmation(?: id| no\\.?| number| code)?", "konfirmasi",
  "ticket(?: id| no\\.?| number| code)", "tiket(?: id| no\\.?)", "barcode", "qr(?: code)?", "voucher(?: code| no\\.?)?", "serial(?: no\\.?| number)?",
  "access code", "pin", "(?:member|user|customer|account) id",
];
const VALUE = `((?:(?!\\s(?:${FIELDS})\\s*[:：=])[^\\n|;·•]){1,120})`;
const LABELLED = new RegExp(`\\b(${LABELS.join("|")})\\s*(?:#|no\\.?)?\\s*[:：=]\\s*${VALUE}`, "gi");
const NAME_ROW = new RegExp(`^([ \\t]*(?:${NAME_LABELS.join("|")}))[ \\t]+(?![:：=#]|\\[x\\])((?:(?![ \\t](?:${FIELDS})\\b)[^\\n|;·•])+)`, "gim");
const HEADER_ROW = new RegExp(`^[ \\t]*(?:${NAME_LABELS.join("|")})(?:[ \\t/|·•]+(?:${LABELS.join("|")}|${FIELDS})\\.?)*[ \\t]*[:：]?[ \\t]*$`, "i");

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
// Indonesian NIK: 16 digits, sometimes grouped with spaces, dots or dashes.
const NIK = /\b\d{4}[ .-]?\d{4}[ .-]?\d{4}[ .-]?\d{4}\b/g;
// Indonesian mobile numbers: +62 / 62 / 0, then 8 and the next digit together (so the date
// "08.11.2026 19.00" is not one), then 6 to 10 more digits, with spaces, dots, dashes or brackets.
const PHONE = /(?:\+62|\b62|\(\s*0|\b0)[ .-]?\(?8\d\)?(?:[ .\-)]{0,2}\d){6,10}\b/g;
// Landlines: an area code that does not start with 8, in brackets or not, then the number.
const LANDLINE = /(?:\+62[ .-]?\(?|\(0|\b0)[2-79]\d{1,2}\)?[ .-]?\d{3,4}[ .-]?\d{3,4}\b/g;
// Order and booking codes: long digit runs; long tokens mixing letters with at least three digits
// ("ORD-2025-AB12CD34"), which leaves seat labels like "Section-B12" alone; and a few letters ahead
// of a long number ("T2093847561"), unless they are a currency.
const DIGIT_RUN = /\b\d{10,}\b/g;
const MIXED_CODE = /\b(?=(?:[A-Za-z/_-]*\d){3})(?=(?:[\d/_-]*[A-Za-z]){2})[A-Za-z0-9][A-Za-z0-9/_-]{7,}\b/g;
const PREFIXED_NUMBER = /\b(?!(?:rp|idr|usd|sgd)\d)[A-Za-z]{1,4}[/_-]?\d{6,}\b/gi;
// Not codes: a date with its month as a word ("14-Nov-2026"), a name with a year ("WeTheFest2026"),
// a price run together ("IDR1500000").
const MONTH = "(?:jan|feb|mar|apr|mei|may|jun|jul|agu|aug|agt|ags|sep|okt|oct|nov|des|dec)[a-z]*";
const WORD_DATE = new RegExp(`^(?:\\d{1,2}[-/_]?${MONTH}[-/_]?\\d{2,4}|\\d{4}[-/_]?${MONTH}[-/_]?\\d{1,2}|${MONTH}[-/_]?\\d{1,2}[-/_]?\\d{2,4})$`, "i");
const notACode = (m: string) => WORD_DATE.test(m) || /^[A-Za-z/_-]*(?:19|20)\d\d[A-Za-z/_-]*$/.test(m) || /^(?:rp|idr|usd|sgd)\d+$/i.test(m);

// The last look before anything leaves, wider than the patterns above on purpose: an email with
// spaces around its @, a number with brackets or slashes. Anything here stops the text.
const LOOSE = {
  email: /[\p{L}\p{N}._%+-]+\s*(?:@|\(at\)|\[at\])\s*[\p{L}\p{N}-]+\s*(?:\.|\(dot\)|\[dot\])\s*[\p{L}]{2,}/gu,
  nik: /\b(?:\d[ .\-/]?){15}\d\b/g,
  phone: /(?:\+\s?62|\b62|\(?\b0)\s?\(?\s?8\d(?:[\s.\-()/]{0,2}\d){6,10}/g,
};
// Prices or dates side by side ("1.250.000 75.000 1.325.000", "14.11.2026 15.11.2026") run to
// sixteen digits without being an ID number.
const AMOUNT_OR_DATE = /^(?:\d{1,3}(?:[.,]\d{3})+(?:,\d{2})?|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}[.:]\d{2})$/;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A name as it may be printed: any case, any spacing between its words. */
const nameRegex = (name: string) => new RegExp(name.trim().split(/\s+/).map(escape).join("\\s+"), "gi");

function count(text: string, re: RegExp) {
  return [...text.matchAll(re)].length;
}

/** The whole words around a match, so a number is judged with the tokens it sits in. */
function around(text: string, from: number, to: number) {
  while (from > 0 && !/\s/.test(text[from - 1])) from--;
  while (to < text.length && !/\s/.test(text[to])) to++;
  return text.slice(from, to);
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
  const pages = input.pages.map((p) => p.replace(/[ \t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim());
  if (!pages.some((p) => p.length > 0)) return { ok: false, reason: "no_text" };
  const keep = pages.map((p, i) => (p && isTicketPage(p) ? i : -1)).filter((i) => i >= 0);
  if (!keep.length) return { ok: false, reason: "no_ticket_page" };

  const removed: Record<Removal, number> = { payload: 0, labelled: 0, nik: 0, email: 0, phone: 0, code: 0, name: 0 };
  const strip = (text: string, re: RegExp, kind: Removal, spare?: (m: string) => boolean) =>
    text.replace(re, (m) => {
      if (spare?.(m)) return m;
      removed[kind]++;
      return MARK;
    });

  const payloads = [...new Set(input.payloads.map((p) => p.trim()).filter((p) => p.length >= 4))].sort((a, b) => b.length - a.length);
  // A ticket often prints its code under the barcode: in parts, or with other separators.
  const segments = payloads.flatMap((p) => [p, ...p.split(/[|;,]/).map((s) => s.trim())]);
  const payloadParts = [...new Set(segments.filter((s) => s.length >= 6 && /\d{4}/.test(s)))].sort((a, b) => b.length - a.length);
  const payloadDigits = [...new Set(segments.map((s) => s.replace(/\D/g, "")).filter((d) => d.length >= 8))].map((d) => new RegExp(d.split("").join("[ .-]?"), "g"));
  const names = [...new Set(input.names.map((n) => n.trim()).filter((n) => n.length >= 3))];
  // Each word of a name on its own as well ("LUTHFI" printed without "HADI"), if it is a real word.
  const nameWords = [...new Set(names.flatMap((n) => n.split(/\s+/)).filter((w) => w.length >= 3))];

  let text = keep.map((i) => pages[i].slice(0, MAX_PAGE_CHARS)).join("\n---\n");
  for (const p of [...payloads, ...payloadParts]) text = strip(text, new RegExp(escape(p), "g"), "payload");
  for (const re of payloadDigits) text = strip(text, re, "payload");

  // A line of labels alone ("Nama Pengunjung  No. Identitas") heads the values printed under it.
  const lines = text.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    if (!HEADER_ROW.test(lines[i])) continue;
    const next = lines.findIndex((l, j) => j > i && l.trim() !== "");
    if (next < 0 || lines[next].trim() === "---" || HEADER_ROW.test(lines[next])) continue;
    lines[next] = MARK;
    removed.labelled++;
  }
  text = lines.join("\n");

  // Labelled values next, while the label still says what the value is.
  text = text.replace(LABELLED, (_m, label: string) => {
    removed.labelled++;
    return `${label}: ${MARK}`;
  });
  text = text.replace(NAME_ROW, (_m, label: string) => {
    removed.labelled++;
    return `${label} ${MARK}`;
  });
  text = strip(text, EMAIL, "email");
  text = strip(text, NIK, "nik");
  text = strip(text, PHONE, "phone");
  text = strip(text, LANDLINE, "phone");
  text = strip(text, DIGIT_RUN, "code");
  text = strip(text, MIXED_CODE, "code", notACode);
  text = strip(text, PREFIXED_NUMBER, "code");
  for (const n of names) text = strip(text, nameRegex(n), "name");
  for (const w of nameWords) text = strip(text, new RegExp(`\\b${escape(w)}\\b`, "gi"), "name");
  text = text.replace(/(?:\[x\][ \t]*){2,}/g, `${MARK} `).trim();

  // Fail closed: look again, wider, and for anything we were told to remove.
  const left: Removal[] = [];
  if (count(text, LOOSE.email)) left.push("email");
  const looseNik = [...text.matchAll(LOOSE.nik)].some((m) => !around(text, m.index, m.index + m[0].length).split(/\s+/).every((t) => AMOUNT_OR_DATE.test(t)));
  if (looseNik) left.push("nik");
  if (count(text, LOOSE.phone)) left.push("phone");
  if (payloads.some((p) => text.includes(p)) || payloadDigits.some((re) => count(text, re))) left.push("payload");
  if (names.some((n) => nameRegex(n).test(text))) left.push("name");
  if (left.length) return { ok: false, reason: "personal_data_left", left };

  return { ok: true, text: text.slice(0, MAX_CLEAN_CHARS), pages: keep.map((i) => i + 1), removed };
}
