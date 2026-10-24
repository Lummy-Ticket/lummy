// What may leave our server for the AI extraction of a ticket (docs/09 §5.1): the text of its ticket
// pages, with everything that names or reaches a person taken out first. The model only needs the
// show: its title, date, venue, category, seat and printed price. Fail closed: when anything that
// still looks like an ID number, an email or a phone number survives the cleaning, nothing is sent
// and the seller fills the form in by hand. Pure text in, text out: no file, no network, no storage.
//
// A name is often printed without a label (Loket prints the holder's on a line of its own), so the
// name the seller types is what finds it, and a name typed wrong or in part left the printed one
// behind (found 24 Oct 2026 on a real Loket ticket). So every word of the typed name must be printed
// on the ticket, or nothing is sent; a line with any word of a name goes whole, and so does every
// word printed next to it, wherever else it is printed; and of what is left, only lines that read as
// facts of the show go.

export type CleanInput = {
  /** Text of each page, in order (pdf.js text layer). */
  pages: string[];
  /** Barcode payloads the decoder read off the file. Held in memory only, never stored. */
  payloads: string[];
  /** Other names to take out wherever they appear: the seller's account name, the email before its @. */
  names: string[];
  /**
   * The ticket holder's name as the seller typed it. Every word of it must be printed on the pages
   * that go, or nothing goes: a name typed wrong or in part would leave the printed one behind.
   */
  holder?: string;
  /** Words of the shows on sale (titles, venues, cities, categories): a line with one is a show fact. */
  known?: string[];
  /**
   * The pages (from 1) a barcode was read on. Each holds a ticket, so they go first, each with its
   * share of the text: a file of four tickets, each followed by pages of terms, had only the first
   * ticket reach the model before (24 Oct 2026).
   */
  barcodePages?: number[];
};

export type Removal = "payload" | "labelled" | "nik" | "email" | "phone" | "code" | "name" | "other";

export type CleanResult =
  | { ok: true; text: string; pages: number[]; removed: Record<Removal, number> }
  | { ok: false; reason: "no_text" | "no_ticket_page" | "holder_not_found" | "personal_data_left"; left?: Removal[] };

/** Bounds what one ticket can cost in tokens; a ticket's own facts fit well inside it. */
export const MAX_CLEAN_CHARS = 6000;
// A ticket page is a few thousand characters; a file with far more text gets no more work for it.
const MAX_PAGE_CHARS = 20_000;
// What each ticket's page may send at least, however many tickets share the text; a cleaned ticket
// page is well under it.
const MIN_PAGE_SHARE = 600;
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
// Loket prints the second ticket of an order as "Guest_2 of" and the buyer's name, with no colon.
const GUEST_OF = /\b((?:guest|tamu|attendee|visitor|pengunjung|peserta)[ _#-]?\d+ (?:of|dari))[ \t]+[^\n|;·•]+/gi;

// U+FFFD in these is a glyph the PDF's font left without a character, most often a ligature such as
// "fi" (lib/tickets/extract.ts): it may sit in an email or a name in place of two or three letters.
const EMAIL = /[\p{L}\p{N}._%+\-�]+@[\p{L}\p{N}\-�]+(?:\.[\p{L}\p{N}\-�]+)+/gu;
// The same with a space on either side of the @, as some tickets print a promoter's address or
// handle ("Instagram @promotor.id"). It must end in letters, so "30 Jul 2023 @ 09.00" stays.
const SPACED_EMAIL = /[\p{L}\p{N}._%+\-�]+ ?@ ?[\p{L}\p{N}\-�]+(?:\.[\p{L}\p{N}\-�]+)*\.\p{L}{2,}(?![\p{L}\p{N}])/gu;
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

// What a line of show facts carries: a field of the show, a category, a seat, a word of a show, a
// venue, a city or a day; or a date, a time or a price. A line with none of them (a name printed on
// its own, a greeting, a label whose value was taken out) is not sent, so a name nobody typed,
// printed without a label, stays here too. Words of the shows on sale count as well (`known`).
const FACT_WORDS = [
  FIELDS,
  "e-?ticket|e-?tiket|tiket|ticket|tickets|e-?voucher|admission|entry|masuk|open|doors?|kick ?off|pukul|wib|wita|wit",
  "cat|vvip|vip|reguler|regular|festival|fest|tribune?|standing|seating|seated|presale|pre-sale|early bird|general|ga|platinum|gold|silver|bronze|diamond|premium|floor|lantai|pit|balcony|balkon|upper|lower|soundcheck|pass|day|wristband|gelang|ringside|lounge|box",
  "tour|concert|konser|live|music|musik|fan ?meeting|fanmeet(?:ing)?|fancon|showcase|edition|presents|world|pertandingan|match|vs|pertunjukan",
  "arena|stadium|stadion|hall|expo|jiexpo|convention|center|centre|theat(?:er|re)|teater|gedung|istora|senayan|su?gbk|ice|bsd|sicc|auditorium|ballroom|amphitheat(?:er|re)|lapangan|dome|studio|club",
  "jakarta|bandung|surabaya|yogyakarta|jogja(?:karta)?|semarang|medan|makassar|bali|denpasar|tangerang|bekasi|bogor|depok|malang|solo|surakarta|palembang|balikpapan|batam|pekanbaru|manado|lombok|singapore|singapura|kuala lumpur|bangkok|manila|indonesia",
  "senin|selasa|rabu|kamis|jum'?at|sabtu|minggu|monday|tuesday|wednesday|thursday|friday|saturday|sunday",
].join("|");
const FACT_WORD = new RegExp(`(?<![\\p{L}\\p{N}])(?:${FACT_WORDS})(?!\\p{L})`, "iu");
const FACT_SHAPE = new RegExp(
  [
    `\\d{1,2}(?:st|nd|rd|th)?[\\s.,/-]*${MONTH}\\b`, // 14 Nov, 14th Nov, 14-Nov
    `\\b${MONTH}[\\s.,/-]*\\d{1,4}\\b`, // November 14, Nov 2026
    "\\b\\d{1,4}[./-]\\d{1,2}[./-]\\d{1,4}\\b", // 07/11/2026, 2026.10.31
    "\\b\\d{1,2}[.:]\\d{2}\\b", // 19:00, 19.00
    "\\b\\d{1,2} ?(?:am|pm)\\b",
    "\\b(?:rp|idr|usd|sgd)\\.? ?\\d", // a price
    "\\b\\d{1,3}(?:[.,]\\d{3})+\\b", // an amount
  ].join("|"),
  "i"
);
// A street address is no fact of the show, city or not.
const ADDRESS = /(?<!\p{L})(?:jl|jln|jalan|gg|komplek|perum(?:ahan)?)\.? +\p{L}|\brt\.? ?\d{1,3} ?\/ ?rw\b|\bkode ?pos\b/iu;

// Words a ticket prints around a name without being part of it.
const NOT_A_NAME = new Set(
  (
    "nama name names pemesan pembeli pemilik pemegang holder guest tamu peserta penerima pengunjung penonton pelanggan pengguna akun " +
    "customer visitor attendee participant buyer purchaser recipient member user account full first last given family lengkap " +
    "dear halo hai hi hello selamat datang welcome terima kasih thank thanks you yth bapak ibu mr mrs ms miss sdr sdri kak tuan nyonya " +
    "by oleh atas untuk for to of and dan the dari di ke issued purchased booked ordered sold billed assigned dipesan dibeli"
  ).split(" ")
);

// The last look before anything leaves, wider than the patterns above on purpose: an email with
// spaces around its @, a number with brackets or slashes. Anything here stops the text.
const LOOSE = {
  email: /[\p{L}\p{N}._%+\-�]+\s*(?:@|\(at\)|\[at\])\s*[\p{L}\p{N}\-�]+\s*(?:\.|\(dot\)|\[dot\])\s*[\p{L}]{2,}/gu,
  nik: /\b(?:\d[ .\-/]?){15}\d\b/g,
  phone: /(?:\+\s?62|\b62|\(?\b0)\s?\(?\s?8\d(?:[\s.\-()/]{0,2}\d){6,10}/g,
};
// Prices or dates side by side ("1.250.000 75.000 1.325.000", "14.11.2026 15.11.2026") run to
// sixteen digits without being an ID number.
const AMOUNT_OR_DATE = /^(?:\d{1,3}(?:[.,]\d{3})+(?:,\d{2})?|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}[.:]\d{2})$/;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The letters a ligature glyph left without a character can stand for, as it may sit in a word:
// "ffi" as one glyph, or "ff" then "i", or "f" then "fi".
const LIGATURES: Record<string, string> = {
  ffi: "ffi|�|�i|f�",
  ffl: "ffl|�|�l|f�",
  ff: "ff|�",
  fi: "fi|�",
  fl: "fl|�",
};
/** One word of a name, matching it also as printed with a ligature: "Luthfi" as "Luth�". */
const nameWord = (w: string) =>
  w
    .split(/(ffi|ffl|ff|fi|fl)/i)
    .map((part, i) => (i % 2 ? `(?:${LIGATURES[part.toLowerCase()]})` : escape(part)))
    .join("");
// After a ligature the glyph may have taken the space with it ("Luth�Hadi").
const WORD_GAP = "(?:\\s+|(?<=\\uFFFD))";
const WORD_END = "(?:(?![\\p{L}\\p{N}])|(?<=\\uFFFD))";
/** A name as it may be printed: any case, any spacing between its words, ligatures or not. */
const nameRegex = (name: string) => new RegExp(name.trim().split(/\s+/).map(nameWord).join(WORD_GAP), "giu");
/** One word of a name on its own, as a whole word. */
const wordRegex = (word: string, flags = "giu") => new RegExp(`(?<![\\p{L}\\p{N}])${nameWord(word)}${WORD_END}`, flags);
/** The words of a name worth looking for: "M. Rizky" is "Rizky"; "luthfi.hadi" is "luthfi" and "hadi". */
const wordsOf = (name: string) => name.split(/[^\p{L}\p{N}�]+/u).filter((w) => (w.match(/\p{L}/gu)?.length ?? 0) >= 3);

/** Whether two words are the same but for one letter added, dropped or changed: "Amelia", "Amalia". */
export function nearlySame(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
// Shorter words match exactly only: one letter off "Hadi" is "Hari", and "Hari: Sabtu" would go.
const FUZZY_FROM = 5;

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

const tokens = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** Whether a line reads as a fact of the show (FACT_WORDS above), or carries a word of one in `known`. */
export function isFactLine(line: string, known: Set<string> = new Set()) {
  if (ADDRESS.test(line)) return false;
  return FACT_WORD.test(line) || FACT_SHAPE.test(line) || tokens(line).some((w) => known.has(w));
}

/**
 * The words printed next to a name, as more of the same name: "Zahra" typed and "Guest_2 of Zahra
 * Amelia" printed make "Amelia" a word to take out wherever else it is printed. A run stops at
 * punctuation, at a word that is a show fact, and four words out either side.
 */
function besideNames(text: string, words: string[], known: Set<string>) {
  const res = words.map((w) => wordRegex(w, "iu"));
  const isName = (w: string) => res.some((re) => re.test(w));
  const nameLike = (w: string) =>
    /^[\p{L}�][\p{L}'’.\-�]*$/u.test(w) && !NOT_A_NAME.has(w.toLowerCase()) && !FACT_WORD.test(w) && !tokens(w).some((t) => known.has(t));
  const out = new Set<string>();
  for (const line of text.split("\n")) {
    for (const part of line.split(/[,;:|·•()[\]{}"!?/\\<>]+/)) {
      const toks = part.split(/\s+/).filter(Boolean);
      toks.forEach((tok, i) => {
        if (!isName(tok)) return;
        for (const step of [-1, 1]) {
          for (let j = i + step, n = 0; j >= 0 && j < toks.length && n < 4; j += step, n++) {
            const w = toks[j].replace(/\.$/, "");
            if (!nameLike(w)) break;
            if (!isName(w)) for (const x of wordsOf(w)) out.add(x);
          }
        }
      });
    }
  }
  return [...out];
}

export function cleanTicketText(input: CleanInput): CleanResult {
  const pages = input.pages.map((p) => p.replace(/[ \t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim());
  if (!pages.some((p) => p.length > 0)) return { ok: false, reason: "no_text" };
  // The pages a barcode was read on first, whatever they read like, then the other ticket pages.
  const coded = [...new Set(input.barcodePages ?? [])].map((n) => n - 1).filter((i) => pages[i]).sort((a, b) => a - b);
  const keep = [...coded, ...pages.map((p, i) => (p && !coded.includes(i) && isTicketPage(p) ? i : -1)).filter((i) => i >= 0)];
  if (!keep.length) return { ok: false, reason: "no_ticket_page" };
  let text = keep.map((i) => pages[i].slice(0, MAX_PAGE_CHARS)).join("\n---\n");

  // The holder's name as typed must be the one printed, word for word: one letter off, or someone
  // else's, and the cleaner would look for a name the ticket does not carry and miss the one it does.
  const holderWords = wordsOf(input.holder ?? "");
  if (input.holder !== undefined && (!holderWords.length || holderWords.some((w) => !wordRegex(w, "iu").test(text)))) {
    return { ok: false, reason: "holder_not_found" };
  }
  const known = new Set((input.known ?? []).flatMap(tokens).filter((w) => w.length >= 3 && !NOT_A_NAME.has(w)));

  const removed: Record<Removal, number> = { payload: 0, labelled: 0, nik: 0, email: 0, phone: 0, code: 0, name: 0, other: 0 };
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
  const names = [...new Set([input.holder ?? "", ...input.names].map((n) => n.trim()).filter((n) => n.length >= 3))];
  // Each word of a name on its own as well ("LUTHFI" printed without "HADI"), and the words printed
  // next to one, read before anything is taken out.
  const typedWords = [...new Set(names.flatMap(wordsOf))];
  const nameWords = [...new Set([...typedWords, ...besideNames(text, typedWords, known)])];
  const wordRes = nameWords.map((w) => wordRegex(w, "iu"));
  const fuzzy = nameWords.filter((w) => w.length >= FUZZY_FROM && !w.includes("�")).map((w) => w.toLowerCase());
  const nameLine = (line: string) =>
    wordRes.some((re) => re.test(line)) ||
    (line.toLowerCase().match(/\p{L}+/gu) ?? []).some((t) => t.length >= FUZZY_FROM - 1 && fuzzy.some((w) => nearlySame(t, w)));

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
  for (const re of [NAME_ROW, GUEST_OF]) {
    text = text.replace(re, (_m, label: string) => {
      removed.labelled++;
      return `${label} ${MARK}`;
    });
  }
  text = strip(text, EMAIL, "email");
  text = strip(text, SPACED_EMAIL, "email");
  text = strip(text, NIK, "nik");
  text = strip(text, PHONE, "phone");
  text = strip(text, LANDLINE, "phone");
  text = strip(text, DIGIT_RUN, "code");
  text = strip(text, MIXED_CODE, "code", notACode);
  text = strip(text, PREFIXED_NUMBER, "code");

  // A line with any word of a name, or one letter off a long one, goes whole, so the rest of the
  // name goes with it. Then every line that reads as no fact of the show.
  text = text
    .split("\n")
    .filter((line) => {
      if (line.trim() === "---") return true;
      if (nameLine(line)) {
        removed.name++;
        return false;
      }
      if (!line.trim() || isFactLine(line, known)) return true;
      removed.other++;
      return false;
    })
    .join("\n");
  text = text.replace(/(?:\[x\][ \t]*){2,}/g, `${MARK} `).replace(/\n{3,}/g, "\n\n").trim();
  if (!text.replace(/^---$/gm, "").trim()) return { ok: false, reason: "no_ticket_page" };

  // Fail closed: look again, wider, and for anything we were told to remove, over every page read,
  // before any is cut short (a number cut in two would no longer look like one).
  const left: Removal[] = [];
  if (count(text, LOOSE.email)) left.push("email");
  const looseNik = [...text.matchAll(LOOSE.nik)].some((m) => !around(text, m.index, m.index + m[0].length).split(/\s+/).every((t) => AMOUNT_OR_DATE.test(t)));
  if (looseNik) left.push("nik");
  if (count(text, LOOSE.phone)) left.push("phone");
  if (payloads.some((p) => text.includes(p)) || payloadDigits.some((re) => count(text, re))) left.push("payload");
  if (names.some((n) => nameRegex(n).test(text)) || wordRes.some((re) => re.test(text))) left.push("name");
  if (left.length) return { ok: false, reason: "personal_data_left", left };

  // Each page its share: the barcode pages split the text between them, then the other ticket pages
  // follow while there is room. A page is cut at the end of a line where it can be.
  const parts = text.split(/\n?^---$\n?/m);
  if (parts.length !== keep.length) return { ok: true, text: text.slice(0, MAX_CLEAN_CHARS), pages: keep.map((i) => i + 1), removed };
  const share = Math.max(MIN_PAGE_SHARE, Math.floor(MAX_CLEAN_CHARS / (coded.length || keep.length)) - 5);
  const cut = (s: string) => {
    if (s.length <= share) return s;
    const at = s.lastIndexOf("\n", share);
    return at > share / 2 ? s.slice(0, at) : s.slice(0, share);
  };
  const sent: { page: number; text: string }[] = [];
  let length = 0;
  for (const [n, part] of parts.entries()) {
    const body = cut(part.trim());
    if (!body || length >= MAX_CLEAN_CHARS) continue;
    sent.push({ page: keep[n] + 1, text: body });
    length += body.length + 5;
  }
  return { ok: true, text: sent.map((s) => s.text).join("\n---\n").slice(0, MAX_CLEAN_CHARS), pages: sent.map((s) => s.page), removed };
}
