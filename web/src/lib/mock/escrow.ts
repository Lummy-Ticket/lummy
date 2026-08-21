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

export interface EvidenceCheck {
  withinGateWindow: boolean;
  atVenue: boolean;
  filedInTime: boolean;
  /** STRONG only when every automated check passes. The arbiter still decides. */
  strength: "STRONG" | "WEAK";
  checks: { ok: boolean; label: string; detail: string }[];
}

export function checkEvidence(o: Order, ev: DisputeEvidence, filedAtISO: string): EvidenceCheck {
  const withinGateWindow = inGateWindow(o, ev.capturedAtISO);
  const atVenue = ev.atVenue;
  const deadline = disputeDeadlineISO(o);
  const filedInTime = !deadline || new Date(filedAtISO).getTime() <= new Date(deadline).getTime();
  const checks = [
    {
      ok: withinGateWindow,
      label: "Captured during the event window",
      detail: withinGateWindow
        ? "Timestamp falls inside gate hours."
        : "Timestamp falls outside gate hours, so it cannot show a live rejection.",
    },
    {
      ok: atVenue,
      label: "Location matches the venue",
      detail: atVenue ? "Geotag matches the venue." : "No venue geotag on the file.",
    },
    {
      ok: filedInTime,
      label: "Filed within 48 hours",
      detail: filedInTime ? "Filed inside the dispute window." : "Filed after the window closed.",
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
  label: string;
  /** Indonesian gloss, shown as the secondary line. */
  sub: string;
  eligible: boolean;
}

export const DISPUTE_REASONS: ReasonMeta[] = [
  { id: "GATE_DENIED", label: "Turned away at the gate", sub: "Barcode ditolak scanner", eligible: true },
  { id: "BARCODE_USED", label: "Barcode already used", sub: "Barcode sudah dipakai orang lain", eligible: true },
  { id: "NOT_DELIVERED", label: "Ticket never handed over", sub: "Tiket tidak pernah diserahkan", eligible: true },
  { id: "NOT_AS_LISTED", label: "Ticket differs from the listing", sub: "Tiket beda dari yang diiklankan", eligible: true },
  { id: "NO_SHOW", label: "I could not attend", sub: "Berhalangan hadir", eligible: false },
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

/** Default rationale text offered to the arbiter, so verdicts stay consistent. */
export function suggestedRationale(d: Dispute, check: EvidenceCheck) {
  if (!check.filedInTime) return "Filed after the 48h window closed.";
  if (check.strength === "STRONG")
    return "Gate-time evidence is consistent with a denied entry: timestamp and location both check out.";
  if (!check.withinGateWindow)
    return "Evidence was captured outside gate hours, so it cannot document a live rejection.";
  if (!check.atVenue) return "Evidence carries no venue location, so entry denial is unverified.";
  return `Evidence does not substantiate "${reasonMeta(d.reason).label.toLowerCase()}".`;
}
