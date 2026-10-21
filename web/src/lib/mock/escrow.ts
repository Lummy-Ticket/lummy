// Escrow settlement rules, kept in one place so the UI never invents its own.
// Policy source: docs/01-vision-product.md, "Kebijakan sengketa & refund",
// cross-checked against how Tixel, StubHub and Viagogo actually behave.
//
//   1. Release is triggered by TIME, not by the buyer confirming anything.
//   2. Staying silent for 48h after the event = the seller gets paid.
//   3. A refund is a claim with evidence, never a self-serve button.
//   4. Not showing up is not a refund reason. Relist instead.
//   5. Every failure mode has exactly one path, and each path names the
//      evidence that settles it. Nothing is left to "contact support".
//
// The remedy ladder mirrors the industry: seat the buyer first (replacement),
// correct the price second (partial), refund third, and release to the seller
// when a claim does not stand up.

import type { Dispute, DisputeEvidence, DisputeReason, EscrowPhase, Order, Remedy } from "./types";

const H = 3_600_000;

export const DISPUTE_WINDOW_H = 48;
/** Assumed run time of a show, used to bound when gate evidence could exist. */
export const EVENT_DURATION_H = 4;
/** Slack around the show for queueing, late entry, and staff paperwork. */
export const GATE_GRACE_H = 3;
/**
 * Listings created inside this window before doors are the highest-risk cohort:
 * duplicate-pass fraud concentrates on fans buying in a panic on the day.
 * They still go live, but only after a human has looked at them.
 */
export const LATE_LISTING_H = 48;
/**
 * How long a held listing should wait for a person, at most. A target the team keeps (the staff
 * queue marks what has waited longer), not something the code enforces: the seller sees it so a
 * held listing is not a silence with no end.
 */
export const REVIEW_TARGET_H = 24;
/** Charged to a seller whose ticket failed, on top of losing the sale. */
export const SELLER_PENALTY_PCT = 40;

/** Copy the UI renders, carried in both languages. */
export interface Bi {
  en: string;
  id: string;
}

/** Scheduled end of the show (start + run time). */
export const scheduledEndISO = (o: Order) =>
  new Date(new Date(o.eventDateISO).getTime() + EVENT_DURATION_H * H).toISOString();

/**
 * When the show ended, if it has: confirmed by hand on a sample order, or the scheduled end
 * once it has passed on an order that knows it.
 */
export function endedAtISO(o: Order, now: number = Date.now()) {
  if (o.eventEndedAtISO) return o.eventEndedAtISO;
  if (o.eventEndsAtISO && now >= new Date(o.eventEndsAtISO).getTime()) return o.eventEndsAtISO;
  return undefined;
}

/**
 * Deadline for filing, and for the automatic payout. Undefined until the end of the show is
 * known. An on-chain order takes it from the contract, which also counts the handover.
 */
export const disputeDeadlineISO = (o: Order) => {
  const ended = o.eventEndedAtISO ?? o.eventEndsAtISO;
  if (!ended) return undefined;
  if (o.chain?.deadline) return new Date(o.chain.deadline * 1000).toISOString();
  return new Date(new Date(ended).getTime() + DISPUTE_WINDOW_H * H).toISOString();
};

/** Length of the dispute window. The testnet contract runs a 10-minute demo window. */
export const windowMs = (o: Order) => (o.chain?.window ? o.chain.window * 1000 : DISPUTE_WINDOW_H * H);

/** The window said in words, so on-chain orders never claim 48 hours they do not have. */
export function windowLabel(o: Order): Bi {
  if (!o.chain?.window) return { en: `${DISPUTE_WINDOW_H}h`, id: `${DISPUTE_WINDOW_H} jam` };
  const min = Math.round(o.chain.window / 60);
  return { en: `${min} min (testnet demo)`, id: `${min} menit (demo testnet)` };
}

export function phaseOf(o: Order, now: number = Date.now()): EscrowPhase {
  if (o.escrowStatus === "RELEASED") return "RELEASED";
  if (o.escrowStatus === "REFUNDED") return "REFUNDED";
  if (o.escrowStatus === "DISPUTED") return "IN_REVIEW";
  if (!endedAtISO(o, now)) return "PRE_EVENT";
  const deadline = disputeDeadlineISO(o);
  return deadline && now >= new Date(deadline).getTime() ? "WINDOW_CLOSED" : "WINDOW_OPEN";
}

/** Milliseconds left before the escrow pays out on its own. */
export function msUntilRelease(o: Order, now: number = Date.now()) {
  const deadline = disputeDeadlineISO(o);
  return deadline ? new Date(deadline).getTime() - now : Infinity;
}

export function formatCountdown(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "00h 00m 00s";
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}h ${pad(Math.floor((total % 3600) / 60))}m ${pad(total % 60)}s`;
}

/** True while a claim of any kind can still be raised on this order. */
export function canFileDispute(o: Order, now: number = Date.now()) {
  const phase = phaseOf(o, now);
  return phase === "PRE_EVENT" || phase === "WINDOW_OPEN";
}

/**
 * The organiser moved the show after this order was bought. Until the new date starts the buyer may
 * take the money back instead of keeping the ticket, with no arbiter (docs/01), fee included
 * (decision E). An order bought after the move knew the new date, so it is not "postponed".
 */
export function canRefundPostponed(o: Order, now: number = Date.now()) {
  return o.eventStatus === "postponed" && o.escrowStatus === "LOCKED" && !endedAtISO(o, now) && now < new Date(o.eventDateISO).getTime();
}

/** Listed so close to doors that it needs a human before it goes live. */
export const isLateListing = (eventISO: string, now: number = Date.now()) =>
  new Date(eventISO).getTime() - now <= LATE_LISTING_H * H;

// --- Reasons ------------------------------------------------------------------

/** When a reason can be raised, relative to the show. */
export type ClaimWindow = "PRE" | "POST" | "BOTH" | "NONE";
/** What kind of proof settles this class of claim. */
export type ProofKind = "GATE" | "DOCS" | "COMPARISON" | "NONE";

export interface ReasonMeta {
  id: DisputeReason;
  label: Bi;
  eligible: boolean;
  window: ClaimWindow;
  proof: ProofKind;
  /** What to bring, said plainly, so nobody files blind. */
  help: Bi;
}

export const DISPUTE_REASONS: ReasonMeta[] = [
  {
    id: "GATE_DENIED",
    label: { en: "Turned away at the gate", id: "Ditolak di gate" },
    eligible: true, window: "POST", proof: "GATE",
    help: {
      en: "A photo taken at the gate showing the scanner refusing your ticket.",
      id: "Foto yang diambil di gate memperlihatkan scanner menolak tiketmu.",
    },
  },
  {
    id: "BARCODE_USED",
    label: { en: "Barcode already used", id: "Barcode sudah dipakai" },
    eligible: true, window: "POST", proof: "GATE",
    help: {
      en: "A photo at the gate showing the scanner reporting the code as already scanned.",
      id: "Foto di gate memperlihatkan scanner menyatakan kodenya sudah pernah dipindai.",
    },
  },
  {
    id: "NAME_MISMATCH",
    label: { en: "Turned away over the name", id: "Ditolak karena nama tidak cocok" },
    eligible: true, window: "POST", proof: "GATE",
    help: {
      en: "A photo at the gate showing the ID check that refused you, with this order's ticket in view.",
      id: "Foto di gate yang memperlihatkan pemeriksaan KTP yang menolakmu, dengan tiket order ini terlihat.",
    },
  },
  {
    id: "NOT_DELIVERED",
    label: { en: "Ticket never handed over", id: "Tiket tidak pernah diserahkan" },
    eligible: true, window: "BOTH", proof: "DOCS",
    help: {
      en: "No proof to gather: our own record of whether you ever opened the handover documents settles this.",
      id: "Tidak perlu cari bukti: catatan kami soal apakah kamu pernah membuka dokumen serah-terima yang menentukan.",
    },
  },
  {
    id: "NOT_AS_LISTED",
    label: { en: "Ticket differs from the listing", id: "Tiket beda dari listing" },
    eligible: true, window: "BOTH", proof: "COMPARISON",
    help: {
      en: "A photo of the ticket you received, so the tier on it can be compared with the listing.",
      id: "Foto tiket yang kamu terima, supaya kategorinya bisa dibandingkan dengan listing.",
    },
  },
  {
    id: "EVENT_CANCELLED",
    label: { en: "Event cancelled", id: "Acara dibatalkan" },
    eligible: true, window: "BOTH", proof: "NONE",
    help: {
      en: "Handled automatically. A cancelled show refunds every locked order without anyone filing.",
      id: "Ditangani otomatis. Acara yang batal mengembalikan semua dana terkunci tanpa perlu ada yang mengajukan.",
    },
  },
  {
    id: "NO_SHOW",
    label: { en: "I could not attend", id: "Berhalangan hadir" },
    eligible: false, window: "NONE", proof: "NONE",
    help: {
      en: "Not a claim. The ticket worked, so the remedy is to relist it before the show.",
      id: "Bukan klaim. Tiketnya berfungsi, jadi jalan keluarnya menjual lagi sebelum acara.",
    },
  },
];

export const reasonMeta = (id: DisputeReason) =>
  DISPUTE_REASONS.find((r) => r.id === id) ?? DISPUTE_REASONS[0];

/** Reasons a buyer can actually pick right now, given where the show is. */
export function availableReasons(o: Order, now: number = Date.now()): ReasonMeta[] {
  const phase = phaseOf(o, now);
  const pre = phase === "PRE_EVENT";
  return DISPUTE_REASONS.filter((r) => {
    if (r.id === "EVENT_CANCELLED") return false; // never filed by hand
    // A refusal over the name only counts as nobody's fault when the seller staged their ID card
    // for the gate. Without it, the refusal is theirs and goes through "Turned away at the gate".
    if (r.id === "NAME_MISMATCH" && !o.gateKtp) return false;
    if (!r.eligible) return true; // shown so the policy can refuse it out loud
    if (r.window === "BOTH") return true;
    return pre ? r.window === "PRE" : r.window === "POST";
  });
}

/** Why a reason is not selectable yet, if it is not. */
export function reasonBlockedNote(o: Order, r: ReasonMeta, now: number = Date.now()): Bi | null {
  if (!r.eligible) return null;
  const pre = phaseOf(o, now) === "PRE_EVENT";
  if (pre && r.window === "POST")
    return {
      en: "Only after the show, since it needs evidence recorded at the gate.",
      id: "Baru bisa setelah acara, karena butuh bukti yang direkam di gate.",
    };
  return null;
}

// --- Evidence -----------------------------------------------------------------

/** Could this file plausibly have been shot at the gate? */
function inGateWindow(o: Order, capturedAtISO: string) {
  const opens = new Date(o.eventDateISO).getTime() - GATE_GRACE_H * H;
  const closes = new Date(scheduledEndISO(o)).getTime() + GATE_GRACE_H * H;
  const t = new Date(capturedAtISO).getTime();
  return t >= opens && t <= closes;
}

export interface EvidenceCheck {
  strength: "STRONG" | "WEAK";
  /** unknown: the check could not be made (nothing on the file or on record to check against). */
  checks: { ok: boolean; unknown?: boolean; label: Bi; detail: Bi }[];
}

/**
 * Checks are chosen by what the claim actually depends on, so a buyer is never
 * asked for proof that could not exist. Gate claims stand on time, place and
 * whether the file shows this ticket. A non-delivery claim stands on the
 * platform's own access log, which neither side can edit.
 */
export function checkEvidence(
  o: Order,
  reason: DisputeReason,
  ev: DisputeEvidence | null | undefined,
  filedAtISO: string
): EvidenceCheck {
  const deadline = disputeDeadlineISO(o);
  const filedInTime = !deadline || new Date(filedAtISO).getTime() <= new Date(deadline).getTime();
  const inTime = {
    ok: filedInTime,
    label: { en: "Filed within the window", id: "Diajukan dalam masa berlaku" },
    detail: filedInTime
      ? { en: "Raised while the escrow still held the money.", id: "Diajukan selagi dananya masih ditahan escrow." }
      : { en: "Raised after the window closed.", id: "Diajukan setelah masa sengketa tutup." },
  };

  if (reason === "NOT_DELIVERED") {
    const ticket = !!o.docsAccessed?.ticketAtISO;
    const opened = ticket || !!(o.docsAccessed?.letterAtISO || o.docsAccessed?.sellerIdAtISO);
    const checks = [
      {
        ok: !opened,
        label: { en: "No handover on record", id: "Tidak ada serah-terima tercatat" },
        detail: ticket
          ? {
              en: "Our log shows the ticket file itself was downloaded, which contradicts the claim.",
              id: "Catatan kami menunjukkan file tiketnya sendiri sudah diunduh, jadi klaimnya bertentangan.",
            }
          : opened
          ? {
              en: "Our log shows the handover documents were opened, which contradicts the claim.",
              id: "Catatan kami menunjukkan dokumen serah-terima sudah dibuka, jadi klaimnya bertentangan.",
            }
          : {
              en: "The documents were never opened, consistent with nothing being handed over.",
              id: "Dokumennya tidak pernah dibuka, konsisten dengan tidak adanya serah-terima.",
            },
      },
      inTime,
    ];
    return { strength: checks.every((c) => c.ok) ? "STRONG" : "WEAK", checks };
  }

  // The gate's own record: the venue's scanner refused this order's pass because its ticket had
  // already gone in. Nobody photographed anything, so there is nothing to doubt about time or place.
  if (ev?.gate) {
    const checks = [
      {
        ok: true,
        label: { en: "Recorded by the gate itself", id: "Dicatat sistem gate sendiri" },
        detail: {
          en: `${ev.gate.gate} refused this order's pass: its ticket had already gone in on ${ev.gate.firstUse === "copy" ? "another copy" : "its own barcode"}.`,
          id: `${ev.gate.gate} menolak pass pesanan ini: tiketnya sudah lebih dulu masuk lewat ${ev.gate.firstUse === "copy" ? "salinan lain" : "barcode aslinya"}.`,
        },
      },
      inTime,
    ];
    return { strength: checks.every((c) => c.ok) ? "STRONG" : "WEAK", checks };
  }

  // A real upload is judged on what could be read off it: a check with nothing to go on is
  // "not checked" rather than failed, and only a check that ran and failed weakens it.
  const uploaded = !!ev?.upload;
  const strengthOf = (checks: EvidenceCheck["checks"], required: EvidenceCheck["checks"]): EvidenceCheck["strength"] =>
    uploaded
      ? required.every((c) => c.ok) && checks.every((c) => c.ok || c.unknown) ? "STRONG" : "WEAK"
      : checks.every((c) => c.ok) ? "STRONG" : "WEAK";

  if (reason === "NOT_AS_LISTED") {
    const legible = barcodeCheck(
      ev,
      { en: "Ticket is legible in the file", id: "Tiket terbaca di file" },
      { en: "The tier and code can be read and compared with the listing.", id: "Kategori dan kodenya bisa dibaca dan dibandingkan dengan listing." },
      { en: "Nothing readable to compare against the listing.", id: "Tidak ada yang bisa dibaca untuk dibandingkan dengan listing." }
    );
    const checks = [legible, inTime];
    return { strength: strengthOf(checks, [legible, inTime]), checks };
  }

  // Gate claims.
  const withinGate = ev?.capturedAtISO ? inGateWindow(o, ev.capturedAtISO) : null;
  const time = {
    ok: withinGate === true,
    unknown: uploaded && withinGate === null,
    label: { en: "Captured during the event window", id: "Diambil saat jam acara" },
    detail:
      withinGate === true
        ? { en: "Timestamp falls inside gate hours.", id: "Waktunya masuk jam gate." }
        : withinGate === false
        ? { en: "Timestamp falls outside gate hours, so it cannot show a live rejection.", id: "Waktunya di luar jam gate, jadi tidak mungkin merekam penolakan langsung." }
        : uploaded
        ? { en: "The file carries no capture time (screenshots and some apps drop it), so the time was not checked.", id: "File ini tidak membawa waktu pengambilan (screenshot dan sebagian aplikasi menghapusnya), jadi waktunya tidak dicek." }
        : { en: "No file, so there is no timestamp to check.", id: "Tidak ada file, jadi tidak ada waktu yang bisa dicek." },
  };
  const place = {
    ok: ev?.atVenue === true,
    unknown: uploaded && ev?.atVenue == null,
    label: { en: "Location matches the venue", id: "Lokasi cocok dengan venue" },
    detail:
      ev?.atVenue === true
        ? { en: "Geotag matches the venue.", id: "Geotag cocok dengan venue." }
        : uploaded && ev?.atVenue === false
        ? { en: "The photo's location is away from the venue.", id: "Lokasi foto jauh dari venue." }
        : uploaded && ev?.upload?.gps
        ? { en: "The photo has a location, but the venue has none on record, so they were not compared.", id: "Foto ini punya lokasi, tapi venue belum punya lokasi tercatat, jadi tidak dibandingkan." }
        : uploaded
        ? { en: "The file carries no location (phones often strip it on upload), so the place was not checked.", id: "File ini tidak membawa lokasi (HP sering menghapusnya saat upload), jadi tempatnya tidak dicek." }
        : { en: "No venue geotag on the file.", id: "Tidak ada geotag venue di file ini." },
  };
  const ticket = barcodeCheck(
    ev,
    { en: "Shows this order's ticket", id: "Memperlihatkan tiket order ini" },
    { en: "The code on screen matches this order.", id: "Kode di layar cocok dengan order ini." },
    { en: "No readable code, so this could be someone else being refused.", id: "Tidak ada kode yang terbaca, jadi bisa saja ini orang lain yang ditolak." }
  );
  const checks = [
    time,
    place,
    ticket,
    inTime,
  ];
  // A real photo can be strong without a location (phones strip it), never without the time
  // and this order's code; a location that was read and is elsewhere still weakens it.
  return { strength: strengthOf(checks, [time, ticket, inTime]), checks };
}

/** Whether the file shows this order's ticket, worded for what was actually read off it. */
function barcodeCheck(ev: DisputeEvidence | null | undefined, label: Bi, matched: Bi, missing: Bi) {
  const shows = ev?.showsBarcode;
  const uploaded = !!ev?.upload;
  return {
    ok: shows === true,
    unknown: uploaded && shows === null,
    label,
    detail:
      shows === true
        ? uploaded
          ? { en: "The code in the photo is this order's ticket.", id: "Kode di foto ini adalah tiket order ini." }
          : matched
        : uploaded && ev?.upload?.foreignCode
        ? { en: "A code is readable, but it is not this order's ticket.", id: "Ada kode yang terbaca, tapi bukan tiket order ini." }
        : uploaded && shows === null
        ? { en: "This order's listing has no barcode on record, so the code was not compared.", id: "Listing order ini tidak punya barcode tercatat, jadi kodenya tidak dibandingkan." }
        : missing,
  };
}

// --- Remedies -----------------------------------------------------------------

export const REMEDY_LABEL: Record<Remedy, Bi> = {
  REPLACEMENT: { en: "Replacement ticket", id: "Tiket pengganti" },
  REFUND_PARTIAL: { en: "Partial refund", id: "Refund sebagian" },
  REFUND_FULL: { en: "Full refund", id: "Refund penuh" },
  RELEASE_SELLER: { en: "Release to seller", id: "Cairkan ke penjual" },
};

/** What a partial remedy is worth: the gap between what was sold and what arrived. */
export function partialAmount(o: Order, reason: DisputeReason) {
  // A downgraded tier is worth the difference, capped so it cannot exceed the sale.
  if (reason === "NOT_AS_LISTED") return Math.min(o.amount, Math.round(o.amount * 0.5));
  // Otherwise a partial covers the tickets that failed, assuming one of the set.
  return o.quantity > 1 ? Math.round(o.amount / o.quantity) : o.amount;
}

export const sellerPenalty = (amount: number) => Math.round((amount * SELLER_PENALTY_PCT) / 100);

/**
 * Refusals that are nobody's fault: the ticket was genuine and the rules at the door stopped it.
 * The buyer is still refunded, but the seller is not charged on top.
 */
const NO_FAULT: DisputeReason[] = ["NAME_MISMATCH", "EVENT_CANCELLED"];

/** What a verdict charges the seller: nothing when they are paid, nothing when the refusal was not their doing. */
export const penaltyFor = (reason: DisputeReason, toSeller: boolean, amount: number) =>
  toSeller || NO_FAULT.includes(reason) ? 0 : sellerPenalty(amount);

export interface RemedyOption {
  remedy: Remedy;
  amount: number;
  label: Bi;
  note: Bi;
}

/**
 * The ladder, in order, with the one we would reach for first marked by the
 * caller. Replacement is only real before the show; afterwards there is no seat
 * left to give.
 */
export function remedyOptions(o: Order, reason: DisputeReason, now: number = Date.now()): RemedyOption[] {
  const pre = phaseOf(o, now) === "PRE_EVENT";
  const options: RemedyOption[] = [];
  if (pre) {
    options.push({
      remedy: "REPLACEMENT",
      amount: 0,
      label: REMEDY_LABEL.REPLACEMENT,
      note: {
        en: "Seat the buyer from another listing for the same show, escrow stays open.",
        id: "Dudukkan pembeli dari listing lain di acara yang sama, escrow tetap berjalan.",
      },
    });
  }
  // Only meaningful when there is something to split: a multi-ticket set where
  // part of it failed, or a downgrade where the buyer still got in.
  const partial = partialAmount(o, reason);
  if (partial < o.amount) {
    options.push({
      remedy: "REFUND_PARTIAL",
      amount: partial,
      label: REMEDY_LABEL.REFUND_PARTIAL,
      note:
        reason === "NOT_AS_LISTED"
          ? {
              en: "They got in, but on a lesser ticket than they paid for. Refund the difference.",
              id: "Dia tetap masuk, tapi dengan tiket lebih rendah dari yang dibayar. Kembalikan selisihnya.",
            }
          : {
              en: "Only part of the set failed, so only that part is refunded.",
              id: "Yang gagal cuma sebagian dari setnya, jadi yang dikembalikan sebagian itu saja.",
            },
    });
  }
  options.push({
    remedy: "REFUND_FULL",
    amount: o.amount,
    label: REMEDY_LABEL.REFUND_FULL,
    note: {
      en: "The buyer got nothing of what they paid for.",
      id: "Pembeli tidak mendapat apa pun dari yang dibayarnya.",
    },
  });
  options.push({
    remedy: "RELEASE_SELLER",
    amount: 0,
    label: REMEDY_LABEL.RELEASE_SELLER,
    note: {
      en: "The claim does not hold up. The seller is paid as normal.",
      id: "Klaimnya tidak kuat. Penjual dibayar seperti biasa.",
    },
  });
  return options;
}

/** Which rung the automated read points at, before a human decides. */
export function suggestedRemedy(o: Order, reason: DisputeReason, check: EvidenceCheck, now: number = Date.now()): Remedy {
  if (check.strength !== "STRONG") return "RELEASE_SELLER";
  if (reason === "NOT_AS_LISTED" && partialAmount(o, reason) < o.amount) return "REFUND_PARTIAL";
  if (phaseOf(o, now) === "PRE_EVENT") return "REPLACEMENT";
  return "REFUND_FULL";
}

/** Default rationale offered to the arbiter, so verdicts read consistently. */
export function suggestedRationale(d: Dispute, check: EvidenceCheck): Bi {
  const failed = check.checks.find((c) => !c.ok);
  if (check.strength === "STRONG") {
    if (d.reason === "NOT_DELIVERED")
      return {
        en: "Our own access log shows the handover documents were never opened, which supports the claim.",
        id: "Catatan akses kami menunjukkan dokumen serah-terima tidak pernah dibuka, dan itu mendukung klaimnya.",
      };
    if (d.reason === "NAME_MISMATCH")
      return {
        en: "Gate-time evidence shows a genuine ticket refused over the name. The seller staged their ID card, so the refund carries no penalty.",
        id: "Bukti dari gate menunjukkan tiket asli yang ditolak karena nama. Penjual sudah menyiapkan KTP, jadi refund-nya tanpa penalti.",
      };
    if (d.reason === "NOT_AS_LISTED")
      return {
        en: "The ticket received does not match the tier that was sold.",
        id: "Tiket yang diterima tidak sesuai dengan kategori yang dijual.",
      };
    return {
      en: "Gate-time evidence is consistent with a denied entry: time, place and the code all check out.",
      id: "Bukti dari gate konsisten dengan penolakan masuk: waktu, tempat, dan kodenya sama-sama cocok.",
    };
  }
  if (failed) return failed.detail;
  return {
    en: `Evidence does not substantiate "${reasonMeta(d.reason).label.en.toLowerCase()}".`,
    id: `Bukti tidak mendukung klaim "${reasonMeta(d.reason).label.id.toLowerCase()}".`,
  };
}

// --- Mock uploads -------------------------------------------------------------

/**
 * Canned files per claim type, so the demo can show a strong and a weak version
 * of the same story. The metadata is what separates them, not the wording.
 */
export function mockEvidenceOptions(o: Order, reason: DisputeReason): DisputeEvidence[] {
  const start = new Date(o.eventDateISO).getTime();
  if (reason === "NOT_DELIVERED") return [];
  if (reason === "NAME_MISMATCH") {
    return [
      {
        fileName: "gate-id-check-refused.jpg",
        kind: "SCANNER_PHOTO",
        capturedAtISO: new Date(start + 35 * 60_000).toISOString(),
        atVenue: true,
        showsBarcode: true,
      },
      {
        fileName: "queue-photo-no-ticket.jpg",
        kind: "SCANNER_PHOTO",
        capturedAtISO: new Date(start + 50 * 60_000).toISOString(),
        atVenue: true,
        showsBarcode: false,
      },
    ];
  }
  if (reason === "NOT_AS_LISTED") {
    return [
      {
        fileName: "ticket-received.jpg",
        kind: "TICKET_PHOTO",
        capturedAtISO: new Date(start - 24 * H).toISOString(),
        atVenue: false,
        showsBarcode: true,
      },
      {
        fileName: "blurry-screenshot.png",
        kind: "TICKET_PHOTO",
        capturedAtISO: new Date(start - 24 * H).toISOString(),
        atVenue: false,
        showsBarcode: false,
      },
    ];
  }
  return [
    {
      fileName: "gate-scanner-rejected.jpg",
      kind: "SCANNER_PHOTO",
      capturedAtISO: new Date(start + 40 * 60_000).toISOString(),
      atVenue: true,
      showsBarcode: true,
    },
    {
      fileName: "scanner-no-code-visible.jpg",
      kind: "SCANNER_PHOTO",
      capturedAtISO: new Date(start + 45 * 60_000).toISOString(),
      atVenue: true,
      showsBarcode: false,
    },
    {
      fileName: "screenshot-next-morning.png",
      kind: "CHAT_LOG",
      capturedAtISO: new Date(start + 18 * H).toISOString(),
      atVenue: false,
      showsBarcode: false,
    },
  ];
}

/**
 * What a seller can put forward against a claim. The strong one is the handover
 * thread with a timestamp; the weak one is an assertion with nothing behind it.
 */
export function mockSellerEvidence(o: Order): DisputeEvidence[] {
  const start = new Date(o.eventDateISO).getTime();
  return [
    {
      fileName: "handover-chat.png",
      kind: "CHAT_LOG",
      capturedAtISO: new Date(start - 36 * H).toISOString(),
      atVenue: false,
      showsBarcode: true,
    },
    {
      fileName: "my-screenshot.png",
      kind: "CHAT_LOG",
      capturedAtISO: new Date(start + 30 * H).toISOString(),
      atVenue: false,
      showsBarcode: false,
    },
  ];
}
