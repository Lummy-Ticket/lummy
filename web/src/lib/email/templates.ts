// The words and the layout of Lummy's emails (lib/email/send). One message carries both languages,
// Indonesian first and English below, since an account has no language of its own yet. Each email
// says what happened, the few facts of the recipient's own order or of the listing, one link to the
// page where they act on it, and why they got it. Nothing about the other party: no names, no
// addresses, no claim notes. HTML with inline styles in the brand guideline's colours, and the same
// words as plain text.
import { FEATURES } from "@/lib/features";
import { REMEDY_LABEL, reasonMeta } from "@/lib/mock/escrow";
import type { DisputeReason, Remedy } from "@/lib/mock/types";
import { USDC_UNIT } from "@/lib/mock/util";
import { REPLY_TO } from "./send";

/** Links always point at the live site: an email outlives whatever server sent it. */
export const SITE = "https://lummy.id";

type Lang = "id" | "en";
type Bi = { id: string; en: string };
export type Currency = "IDR" | "USDC";

/** Brand guideline 1.0 (tailwind.config.ts): Biru Lummy, Tinta, the grey for small text, Biru Pucat. */
const C = { navy: "#0F45B3", ink: "#1C2B4B", gray: "#5F6B7F", pale: "#EEF5FE", soft: "#F5F7FA", line: "#D2D2D2", warnBg: "#FFF5F2", warn: "#C2410C" };
const FONT = "'Plus Jakarta Sans',Arial,Helvetica,sans-serif";
const ARBITRUM_ONE = 42161;

/** An amount in the show's own money, as the pages write it (formatMoney in lib/i18n). */
export function money(n: number, currency: Currency, lang: Lang) {
  const locale = lang === "id" ? "id-ID" : "en-US";
  return currency === "USDC"
    ? `${(n / USDC_UNIT).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`
    : `Rp${n.toLocaleString(locale)}`;
}

/** Shows read in Jakarta time on the site (EVENT_TZ in lib/i18n), so here too. */
export function showDate(iso: string, lang: Lang) {
  const when = new Date(iso).toLocaleString(lang === "id" ? "id-ID" : "en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
  });
  return `${when} WIB`;
}

const both = (f: (lang: Lang) => string): Bi => ({ id: f("id"), en: f("en") });

type Letter = {
  subject: Bi;
  /** The show's title, after the subject. */
  about: string;
  heading: Bi;
  lines: Bi[];
  facts: { label: Bi; value: Bi }[];
  action: { path: string; label: Bi };
  note?: Bi;
  why: Bi;
};

export type Rendered = { subject: string; html: string; text: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function section(l: Letter, lang: Lang, href: string) {
  const p = (s: string) => `<p style="margin:0 0 12px;">${esc(s)}</p>`;
  const facts = l.facts
    .map(
      (f) =>
        `<tr><td style="padding:6px 12px;color:${C.gray};font-size:13px;vertical-align:top;">${esc(f.label[lang])}</td>` +
        `<td style="padding:6px 12px;font-weight:600;text-align:right;vertical-align:top;">${esc(f.value[lang])}</td></tr>`
    )
    .join("");
  const note = l.note
    ? `<p style="margin:0 0 16px;padding:10px 12px;background:${C.warnBg};color:${C.warn};border-radius:10px;font-size:13px;">${esc(l.note[lang])}</p>`
    : "";
  return (
    `<tr><td lang="${lang}" style="padding:20px 28px 8px;font:15px/1.55 ${FONT};color:${C.ink};">` +
    `<h1 style="margin:0 0 12px;font:700 18px/1.3 ${FONT};color:${C.ink};">${esc(l.heading[lang])}</h1>` +
    l.lines.map((line) => p(line[lang])).join("") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;margin:4px 0 16px;background:${C.soft};border-radius:12px;">${facts}</table>` +
    note +
    `<a href="${esc(href)}" style="display:inline-block;background:${C.navy};color:#FFFFFF;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;">${esc(l.action.label[lang])}</a>` +
    `<p style="margin:10px 0 0;font-size:12px;color:${C.gray};word-break:break-all;">${esc(href)}</p>` +
    `</td></tr>`
  );
}

function textSection(l: Letter, lang: Lang, href: string) {
  return [
    l.heading[lang],
    "",
    ...l.lines.flatMap((line, i) => (i ? ["", line[lang]] : [line[lang]])),
    "",
    ...l.facts.map((f) => `${f.label[lang]}: ${f.value[lang]}`),
    ...(l.note ? ["", l.note[lang]] : []),
    "",
    `${l.action.label[lang]}: ${href}`,
  ].join("\n");
}

function render(l: Letter): Rendered {
  const href = `${SITE}${l.action.path}`;
  const subject = `${l.subject.id} / ${l.subject.en}: ${l.about}`;
  const footer = { id: `Ada pertanyaan? Balas email ini atau tulis ke ${REPLY_TO}.`, en: `Questions? Reply to this email or write to ${REPLY_TO}.` };
  const html =
    `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${C.pale};">` +
    // The line a mail app shows next to the subject.
    `<div style="display:none;max-height:0;overflow:hidden;">${esc(l.lines[0]?.id ?? "")}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.pale};"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;">` +
    `<tr><td style="padding:24px 28px 0;font:700 22px/1.2 ${FONT};color:${C.navy};">Lummy</td></tr>` +
    section(l, "id", href) +
    `<tr><td style="padding:8px 28px 0;"><div style="border-top:1px solid ${C.line};font-size:0;line-height:0;">&nbsp;</div></td></tr>` +
    section(l, "en", href) +
    `<tr><td style="padding:16px 28px 24px;font:12px/1.5 ${FONT};color:${C.gray};">` +
    `<p style="margin:0 0 6px;">${esc(l.why.id)} ${esc(footer.id)}</p>` +
    `<p lang="en" style="margin:0;">${esc(l.why.en)} ${esc(footer.en)}</p>` +
    `</td></tr></table></td></tr></table></body></html>`;
  const text = [
    "Lummy",
    "",
    textSection(l, "id", href),
    "",
    "----",
    "",
    textSection(l, "en", href),
    "",
    "--",
    `${l.why.id} ${footer.id}`,
    `${l.why.en} ${footer.en}`,
    "",
  ].join("\n");
  return { subject, html, text };
}

/** One order, as its emails speak of it. Amounts are what the order holds, in its own money. */
export type OrderFacts = {
  id: string;
  eventTitle: string;
  eventDate: string;
  tierName: string;
  quantity: number;
  amount: number;
  fee: number;
  materai: number;
  currency: Currency;
  chainId: number | null;
};

const TESTNET_NOTE: Bi = {
  id: "Demo testnet: dibayar dengan USDC uji di Arbitrum Sepolia, bukan uang sungguhan.",
  en: "Testnet demo: paid in test USDC on Arbitrum Sepolia, not real money.",
};
const TEST_MODE_NOTE: Bi = {
  id: "Lummy masih mode uji: belum ada uang sungguhan yang berpindah.",
  en: "Lummy is still in test mode: no real money moves yet.",
};

/** Said wherever money is, for as long as none of it is real (lib/features.ts, `payouts`). */
function moneyNote(o: OrderFacts): Bi | undefined {
  if (o.currency === "USDC" && o.chainId !== ARBITRUM_ONE) return TESTNET_NOTE;
  return FEATURES.payouts ? undefined : TEST_MODE_NOTE;
}

const WHY_BUYER: Bi = { id: "Kamu menerima email ini karena membeli pesanan ini di Lummy.", en: "You get this email because you bought this order on Lummy." };
const WHY_SELLER: Bi = { id: "Kamu menerima email ini karena tiketmu terjual di Lummy.", en: "You get this email because your ticket sold on Lummy." };
const OPEN_ORDER = { label: { id: "Buka pesanan", en: "Open the order" } };
const OPEN_SALES = { path: "/seller", label: { id: "Buka halaman penjual", en: "Open the seller page" } };

const same = (s: string): Bi => ({ id: s, en: s });
const factShow = (o: OrderFacts) => ({ label: { id: "Acara", en: "Show" }, value: same(o.eventTitle) });
const factOrder = (o: OrderFacts) => ({ label: { id: "Nomor pesanan", en: "Order" }, value: same(o.id) });
const factTier = (o: OrderFacts) => ({ label: { id: "Kategori", en: "Tier" }, value: same(`${o.tierName} × ${o.quantity}`) });
const total = (o: OrderFacts) => o.amount + o.fee + o.materai;

/** The buyer's money is in: the order exists and the escrow holds it. */
export function orderPaid(o: OrderFacts): Rendered {
  return render({
    subject: { id: "Pembayaran diterima", en: "Payment received" },
    about: o.eventTitle,
    heading: { id: "Pembayaranmu sudah kami terima", en: "We have your payment" },
    lines: [
      {
        id: `Pesananmu untuk ${o.eventTitle} tercatat. Uangnya ditahan di escrow Lummy, dan baru diteruskan ke penjual setelah acaranya selesai dan masa klaim lewat tanpa masalah.`,
        en: `Your order for ${o.eventTitle} is in. The money is held in Lummy's escrow and goes to the seller only after the show, once the claim window passes without a problem.`,
      },
      { id: "Rincian pesanan dan tiketmu ada di halaman pesanan.", en: "Your order and your ticket are on the order page." },
    ],
    facts: [
      factShow(o),
      { label: { id: "Tanggal", en: "Date" }, value: both((lang) => showDate(o.eventDate, lang)) },
      factTier(o),
      { label: { id: "Total dibayar", en: "Total paid" }, value: both((lang) => money(total(o), o.currency, lang)) },
      factOrder(o),
    ],
    action: { path: `/tickets/${o.id}`, ...OPEN_ORDER },
    note: moneyNote(o),
    why: WHY_BUYER,
  });
}

/** The seller hears that a claim froze the payout, and where to answer it. */
export function claimToSeller(o: OrderFacts, reason: DisputeReason): Rendered {
  const r = reasonMeta(reason).label;
  return render({
    subject: { id: "Ada klaim untuk penjualanmu", en: "A claim on your sale" },
    about: o.eventTitle,
    heading: { id: "Pembeli mengajukan klaim", en: "The buyer filed a claim" },
    lines: [
      {
        id: `Pembeli mengajukan klaim untuk pesanan ${o.id}: ${r.id.toLowerCase()}. Pencairan ke kamu ditahan sampai staf Lummy memutus.`,
        en: `The buyer filed a claim on order ${o.id}: ${r.en.toLowerCase()}. The payout to you is on hold until Lummy staff rule on it.`,
      },
      {
        id: "Jawab dengan buktimu di halaman penjual. Staf membaca bukti kedua pihak sebelum memutus.",
        en: "Answer with your evidence on the seller page. Staff read both sides before they rule.",
      },
    ],
    facts: [factShow(o), factTier(o), { label: { id: "Alasan klaim", en: "Claim" }, value: r }, factOrder(o)],
    action: OPEN_SALES,
    note: moneyNote(o),
    why: WHY_SELLER,
  });
}

/** The buyer's own receipt for the claim they filed. */
export function claimReceipt(o: OrderFacts, reason: DisputeReason): Rendered {
  const r = reasonMeta(reason).label;
  return render({
    subject: { id: "Klaimmu sudah masuk", en: "Your claim is in" },
    about: o.eventTitle,
    heading: { id: "Klaimmu sudah kami terima", en: "We have your claim" },
    lines: [
      {
        id: `Klaimmu untuk ${o.eventTitle} sudah masuk: ${r.id.toLowerCase()}. Uangnya tetap ditahan di escrow selama klaim berjalan.`,
        en: `Your claim for ${o.eventTitle} is in: ${r.en.toLowerCase()}. The money stays in escrow while it is open.`,
      },
      {
        id: "Penjual bisa menjawab dengan buktinya, lalu staf Lummy memutus. Putusannya kami kirim lewat email juga.",
        en: "The seller may answer with their evidence, then Lummy staff rule. We email you the ruling too.",
      },
    ],
    facts: [factShow(o), { label: { id: "Alasan klaim", en: "Claim" }, value: r }, factOrder(o)],
    action: { path: `/tickets/${o.id}`, ...OPEN_ORDER },
    note: moneyNote(o),
    why: WHY_BUYER,
  });
}

/** Staff ruled. `refund` is what goes back to the buyer, out of the order's amount. */
export function ruling(o: OrderFacts, side: "buyer" | "seller", remedy: Remedy, refund: number): Rendered {
  const label = REMEDY_LABEL[remedy];
  // A replacement is settled as a full refund (api/orders/[id]), and the email says so.
  const decided: Bi =
    remedy === "REPLACEMENT" ? { id: `${label.id}, diselesaikan sebagai refund penuh`, en: `${label.en}, settled as a full refund` } : label;
  const buyer = side === "buyer";
  return render({
    subject: { id: "Putusan klaim", en: "Claim ruling" },
    about: o.eventTitle,
    heading: buyer ? { id: "Klaimmu sudah diputus", en: "Your claim has a ruling" } : { id: "Klaim atas penjualanmu sudah diputus", en: "The claim on your sale has a ruling" },
    lines: [
      {
        id: `Staf Lummy sudah memutus klaim untuk pesanan ${o.id} (${o.eventTitle}). Alasan putusannya ada di halaman ${buyer ? "pesanan" : "penjual"}.`,
        en: `Lummy staff have ruled on the claim for order ${o.id} (${o.eventTitle}). The reasons are on the ${buyer ? "order" : "seller"} page.`,
      },
    ],
    facts: [
      factShow(o),
      { label: { id: "Putusan", en: "Ruling" }, value: decided },
      buyer
        ? { label: { id: "Kembali ke kamu", en: "Back to you" }, value: both((lang) => money(refund, o.currency, lang)) }
        : { label: { id: "Diteruskan ke kamu", en: "To you" }, value: both((lang) => money(Math.max(0, o.amount - refund), o.currency, lang)) },
      factOrder(o),
    ],
    action: buyer ? { path: `/tickets/${o.id}`, ...OPEN_ORDER } : OPEN_SALES,
    note: moneyNote(o),
    why: buyer ? WHY_BUYER : WHY_SELLER,
  });
}

/** The organiser cancelled: the order went back in full, the fee too (api/events/[id]). */
export function showCancelled(o: OrderFacts): Rendered {
  const fee = o.fee + o.materai > 0;
  return render({
    subject: { id: "Acara dibatalkan, uangmu kembali", en: "Show cancelled, your money back" },
    about: o.eventTitle,
    heading: { id: "Penyelenggara membatalkan acaranya", en: "The organiser cancelled the show" },
    lines: [
      {
        id: `${o.eventTitle} dibatalkan, jadi pesananmu direfund penuh${fee ? ", biaya layanan juga" : ""}. Kamu tidak perlu mengajukan apa pun.`,
        en: `${o.eventTitle} was cancelled, so your order is refunded in full${fee ? ", the service fee too" : ""}. There is nothing you need to file.`,
      },
      {
        id: "Penjual tidak dikenai penalti: pembatalan bukan salah siapa pun.",
        en: "The seller is not penalised: a cancellation is no one's fault.",
      },
    ],
    facts: [factShow(o), factTier(o), { label: { id: "Direfund", en: "Refunded" }, value: both((lang) => money(total(o), o.currency, lang)) }, factOrder(o)],
    action: { path: `/tickets/${o.id}`, ...OPEN_ORDER },
    note: moneyNote(o),
    why: WHY_BUYER,
  });
}

export type ListingFacts = {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  tierName: string;
  quantity: number;
  /** Per ticket, in the show's money, before the fee. */
  askPrice: number;
  currency: Currency;
};

/** Tickets went on sale for a show, or a tier, the recipient follows. */
export function ticketsListed(l: ListingFacts): Rendered {
  // The listings on real shows are samples until real sellers list there (lib/features.ts, `realListings`).
  const sample = l.currency === "USDC" || !FEATURES.realListings;
  const fee = l.currency === "IDR";
  return render({
    subject: { id: "Tiket baru", en: "New tickets" },
    about: l.eventTitle,
    heading: { id: "Ada tiket untuk acara yang kamu ikuti", en: "Tickets for a show you follow" },
    lines: [
      {
        id: `Baru tayang di Lummy: ${l.quantity} tiket ${l.tierName} untuk ${l.eventTitle}. Siapa cepat dia dapat; kami tidak menahannya untukmu.`,
        en: `Just listed on Lummy: ${l.quantity} ${l.tierName} ticket${l.quantity > 1 ? "s" : ""} for ${l.eventTitle}. First come, first served; we do not hold ${l.quantity > 1 ? "them" : "it"} for you.`,
      },
    ],
    facts: [
      { label: { id: "Acara", en: "Show" }, value: same(l.eventTitle) },
      { label: { id: "Tanggal", en: "Date" }, value: both((lang) => showDate(l.eventDate, lang)) },
      { label: { id: "Kategori", en: "Tier" }, value: same(`${l.tierName} × ${l.quantity}`) },
      {
        label: fee ? { id: "Harga per tiket, sebelum biaya layanan", en: "Price per ticket, before the fee" } : { id: "Harga per tiket", en: "Price per ticket" },
        value: both((lang) => money(l.askPrice, l.currency, lang)),
      },
    ],
    action: { path: `/events/${l.eventId}`, label: { id: "Lihat tiketnya", en: "See the tickets" } },
    note: sample
      ? {
          id: "Mode uji: listing di Lummy masih contoh untuk demo, bukan tiket sungguhan yang dijual, dan belum ada uang sungguhan yang ditarik.",
          en: "Test mode: listings on Lummy are still samples for the demo, not real tickets for sale, and no real money is taken yet.",
        }
      : undefined,
    why: {
      id: `Kamu menerima email ini karena minta dikabari soal tiket acara ini. Berhenti kapan saja di ${SITE}/profile.`,
      en: `You get this email because you asked to hear about tickets for this show. Stop any time at ${SITE}/profile.`,
    },
  });
}
