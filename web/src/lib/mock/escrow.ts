// Escrow settlement rules, kept in one place so the UI never invents its own.
// Policy source: docs/01-vision-product.md, "Kebijakan sengketa & refund".
//
//   1. Release is triggered by TIME, not by the buyer confirming anything.
//   2. Staying silent for 48h after the event = the seller gets paid.
//   3. A refund is a dispute with gate-time evidence, never a self-serve button.
//   4. Not showing up is not a refund reason. Relist instead.

import type { Dispute, DisputeEvidence, DisputeReason, EscrowPhase, Order } from "./types";

const H = 3_600_000;

export const DISPUTE_WINDOW_H = 48;
/** Assumed run time of a show, used to bound when gate evidence could exist. */
export const EVENT_DURATION_H = 4;
/** Slack around the show for queueing, late entry, and staff paperwork. */
export const GATE_GRACE_H = 3;

/** Scheduled end of the show (start + run time). */
export const scheduledEndISO = (o: Order) =>
  new Date(new Date(o.eventDateISO).getTime() + EVENT_DURATION_H * H).toISOString();

/** Deadline for filing, and for the automatic payout. Undefined until the event is over. */
export const disputeDeadlineISO = (o: Order) =>
  o.eventEndedAtISO
    ? new Date(new Date(o.eventEndedAtISO).getTime() + DISPUTE_WINDOW_H * H).toISOString()
    : undefined;

export function phaseOf(o: Order, now: number = Date.now()): EscrowPhase {
  if (o.escrowStatus === "RELEASED") return "RELEASED";
  if (o.escrowStatus === "REFUNDED") return "REFUNDED";
  if (o.escrowStatus === "DISPUTED") return "IN_REVIEW";
  if (!o.eventEndedAtISO) return "PRE_EVENT";
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
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

/** A dispute can only be filed after the show and before the window closes. */
export function canFileDispute(o: Order, now: number = Date.now()) {
  return phaseOf(o, now) === "WINDOW_OPEN";
}

// --- Evidence -----------------------------------------------------------------

/** Could this file plausibly have been shot at the gate? */
export function inGateWindow(o: Order, capturedAtISO: string) {
  const opens = new Date(o.eventDateISO).getTime() - GATE_GRACE_H * H;
  const closes = new Date(scheduledEndISO(o)).getTime() + GATE_GRACE_H * H;
  const t = new Date(capturedAtISO).getTime();
  return t >= opens && t <= closes;
}

/** Copy that the UI renders, carried in both languages. */
export interface Bi {
  en: string;
  id: string;
}

export interface EvidenceCheck {
  withinGateWindow: boolean;
  atVenue: boolean;
  filedInTime: boolean;
  /** STRONG only when every automated check passes. The arbiter still decides. */
  strength: "STRONG" | "WEAK";
  checks: { ok: boolean; label: Bi; detail: Bi }[];
}

export function checkEvidence(o: Order, ev: DisputeEvidence, filedAtISO: string): EvidenceCheck {
  const withinGateWindow = inGateWindow(o, ev.capturedAtISO);
  const atVenue = ev.atVenue;
  const deadline = disputeDeadlineISO(o);
  const filedInTime = !deadline || new Date(filedAtISO).getTime() <= new Date(deadline).getTime();
  const checks = [
    {
      ok: withinGateWindow,
      label: { en: "Captured during the event window", id: "Diambil saat jam acara" },
      detail: withinGateWindow
        ? { en: "Timestamp falls inside gate hours.", id: "Waktunya masuk jam gate." }
        : {
            en: "Timestamp falls outside gate hours, so it cannot show a live rejection.",
            id: "Waktunya di luar jam gate, jadi tidak mungkin merekam penolakan langsung.",
          },
    },
    {
      ok: atVenue,
      label: { en: "Location matches the venue", id: "Lokasi cocok dengan venue" },
      detail: atVenue
        ? { en: "Geotag matches the venue.", id: "Geotag cocok dengan venue." }
        : { en: "No venue geotag on the file.", id: "Tidak ada geotag venue di file ini." },
    },
    {
      ok: filedInTime,
      label: { en: "Filed within 48 hours", id: "Diajukan dalam 48 jam" },
      detail: filedInTime
        ? { en: "Filed inside the dispute window.", id: "Diajukan dalam masa sengketa." }
        : { en: "Filed after the window closed.", id: "Diajukan setelah masa sengketa tutup." },
    },
  ];
  return {
    withinGateWindow,
    atVenue,
    filedInTime,
    strength: checks.every((c) => c.ok) ? "STRONG" : "WEAK",
    checks,
  };
}

// --- Reasons ------------------------------------------------------------------

export interface ReasonMeta {
  id: DisputeReason;
  label: Bi;
  eligible: boolean;
}

export const DISPUTE_REASONS: ReasonMeta[] = [
  { id: "GATE_DENIED", label: { en: "Turned away at the gate", id: "Ditolak di gate" }, eligible: true },
  { id: "BARCODE_USED", label: { en: "Barcode already used", id: "Barcode sudah dipakai" }, eligible: true },
  { id: "NOT_DELIVERED", label: { en: "Ticket never handed over", id: "Tiket tidak pernah diserahkan" }, eligible: true },
  { id: "NOT_AS_LISTED", label: { en: "Ticket differs from the listing", id: "Tiket beda dari listing" }, eligible: true },
  { id: "NO_SHOW", label: { en: "I could not attend", id: "Berhalangan hadir" }, eligible: false },
];

export const reasonMeta = (id: DisputeReason) =>
  DISPUTE_REASONS.find((r) => r.id === id) ?? DISPUTE_REASONS[0];

// --- Mock uploads -------------------------------------------------------------

/**
 * Two canned files so the demo can show both outcomes: one shot at the gate
 * while the scanner was rejecting the ticket, one screenshot taken the morning
 * after. The metadata is what separates them, not the buyer's wording.
 */
export function mockEvidenceOptions(o: Order): DisputeEvidence[] {
  const start = new Date(o.eventDateISO).getTime();
  return [
    {
      fileName: "gate-scanner-rejected.jpg",
      kind: "SCANNER_PHOTO",
      capturedAtISO: new Date(start + 40 * 60_000).toISOString(),
      atVenue: true,
    },
    {
      fileName: "screenshot-next-morning.png",
      kind: "CHAT_LOG",
      capturedAtISO: new Date(start + 18 * H).toISOString(),
      atVenue: false,
    },
  ];
}

/** Default rationale offered to the arbiter, so verdicts read consistently. */
export function suggestedRationale(d: Dispute, check: EvidenceCheck): Bi {
  if (!check.filedInTime)
    return {
      en: "Filed after the 48h window closed.",
      id: "Diajukan setelah masa sengketa 48 jam tutup.",
    };
  if (check.strength === "STRONG")
    return {
      en: "Gate-time evidence is consistent with a denied entry: timestamp and location both check out.",
      id: "Bukti dari gate konsisten dengan penolakan masuk: waktu dan lokasi sama-sama cocok.",
    };
  if (!check.withinGateWindow)
    return {
      en: "Evidence was captured outside gate hours, so it cannot document a live rejection.",
      id: "Bukti diambil di luar jam gate, jadi tidak bisa merekam penolakan langsung.",
    };
  if (!check.atVenue)
    return {
      en: "Evidence carries no venue location, so entry denial is unverified.",
      id: "Bukti tidak punya lokasi venue, jadi penolakan masuk belum terverifikasi.",
    };
  return {
    en: `Evidence does not substantiate "${reasonMeta(d.reason).label.en.toLowerCase()}".`,
    id: `Bukti tidak mendukung klaim "${reasonMeta(d.reason).label.id.toLowerCase()}".`,
  };
}
