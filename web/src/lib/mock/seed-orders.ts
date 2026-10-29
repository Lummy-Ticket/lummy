// The sample buyer's orders, one in every settlement phase, so a demo never needs setup. Sample
// personas keep these in the browser; the demo accounts get the same ones in the database when a
// presenter resets them. Nothing here is made up beyond the people: every order is on a show in the
// catalogue, on one of its listings, and takes that show's own dates (decided 29 Oct 2026, when the
// made-up "Lummy ... (sample)" shows went).
//
// - or-seed-1, upcoming: the soonest rupiah show at least two days away, on a listing that is not
//   its cheapest, so a demo purchase there never sits next to an identical card.
// - or-seed-2, window running: only while a rupiah show really ended in the last 48 hours. On other
//   days a demo reaches this phase with "Mark event as finished" on the upcoming order.
// - or-seed-3, 4 and 5, settled: the latest rupiah show whose window has closed. One paid out by
//   itself, one with a claim the staff still have to rule on (against the sample seller, so her
//   dashboard has a claim to answer), and one the staff refunded.
import { DISPUTE_WINDOW_H, EVENT_DURATION_H, SELLER_PENALTY_PCT } from "./escrow";
import { DEMO_USERS, SEED_LISTINGS, eventArt, isBuyable, seedEvents, type SeedEvent } from "./seed";
import type { Listing, Order } from "./types";

const H = 3_600_000;
const DAY = 24 * H;
const iso = (t: number) => new Date(t).toISOString();
const startOf = (e: SeedEvent) => Date.parse(e.dateISO);
const endOf = (e: SeedEvent) => startOf(e) + EVENT_DURATION_H * H;

/** The sample seller as buyers see her: first name and initial (lib/listings/rules, publicSellerName). */
const SAMPLE_SELLER = (() => {
  const [first, ...rest] = DEMO_USERS.SELLER.name.split(" ");
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
})();

export function seedOrders(now: number = Date.now()): Order[] {
  const shows = seedEvents().filter((e) => (e.currency ?? "IDR") === "IDR");
  const listingsOf = (e: SeedEvent) => SEED_LISTINGS.filter((l) => l.eventId === e.id);
  const order = (id: string, e: SeedEvent, l: Listing, quantity: number, rest: Partial<Order> & Pick<Order, "escrowStatus" | "createdAtISO">): Order => ({
    id,
    listingId: l.id,
    eventId: e.id,
    eventTitle: e.title,
    eventImage: eventArt(e.id).image,
    eventDateISO: e.dateISO,
    tierName: e.tiers.find((t) => t.id === l.tierId)?.name ?? "",
    sellerName: l.sellerName,
    quantity,
    amount: l.askPrice * quantity,
    gateKtp: l.gateKtp,
    buyerId: DEMO_USERS.BUYER.id,
    ...rest,
  });
  const orders: Order[] = [];

  const upcoming = shows
    .filter((e) => startOf(e) > now + 2 * DAY)
    .sort((a, b) => startOf(a) - startOf(b))
    .map((e) => ({ e, on: listingsOf(e).filter((l) => l.status === "active" && isBuyable(l)).sort((a, b) => a.askPrice - b.askPrice) }))
    .find((x) => x.on.length >= 2);
  if (upcoming) {
    const l = upcoming.on[upcoming.on.length - 1];
    orders.push(order("or-seed-1", upcoming.e, l, 1, { escrowStatus: "LOCKED", createdAtISO: iso(now - 3 * DAY) }));
  }

  const justEnded = shows
    .filter((e) => endOf(e) <= now - H && endOf(e) > now - DISPUTE_WINDOW_H * H + H)
    .sort((a, b) => endOf(b) - endOf(a))
    .find((e) => listingsOf(e).length > 0);
  if (justEnded) {
    orders.push(order("or-seed-2", justEnded, listingsOf(justEnded)[0], 1, {
      escrowStatus: "LOCKED",
      createdAtISO: iso(startOf(justEnded) - 9 * DAY),
      eventEndedAtISO: iso(endOf(justEnded)),
    }));
  }

  const past = shows
    .filter((e) => endOf(e) + (DISPUTE_WINDOW_H + 24) * H <= now && listingsOf(e).length > 0)
    .sort((a, b) => endOf(b) - endOf(a))[0];
  if (past) {
    const S = startOf(past);
    const E = endOf(past);
    const ls = listingsOf(past);
    const hers = ls.find((l) => l.sellerName === SAMPLE_SELLER);
    const others = ls.filter((l) => l !== hers);
    const pick = (i: number) => others[i % Math.max(1, others.length)] ?? ls[0];

    // Nobody filed anything, so the escrow paid the seller by itself when the window closed.
    orders.push(order("or-seed-3", past, pick(0), 1, {
      escrowStatus: "RELEASED",
      createdAtISO: iso(S - 10 * DAY),
      eventEndedAtISO: iso(E),
      autoReleased: true,
    }));

    // Turned away because the code had been used already: filed the night of the show, still with the staff.
    const claimed = hers ?? pick(1);
    orders.push(order("or-seed-4", past, claimed, 1, {
      escrowStatus: "DISPUTED",
      createdAtISO: iso(S - 14 * DAY),
      eventEndedAtISO: iso(E),
      dispute: {
        reason: "BARCODE_USED",
        note: {
          en: "The scanner said the code had already been used. Staff turned me away at gate 3.",
          id: "Scanner bilang kodenya sudah pernah dipakai. Petugas menolak saya di gate 3.",
        },
        evidence: { fileName: "gate-scanner-rejected.jpg", kind: "SCANNER_PHOTO", capturedAtISO: iso(S + 0.6 * H), atVenue: true, showsBarcode: true },
        openedAtISO: iso(E + 1 * H),
      },
    }));

    // Denied entry with a note from the crew: the staff sided with the buyer, so it all came back.
    const refunded = pick(1);
    const amount = refunded.askPrice;
    orders.push(order("or-seed-5", past, refunded, 1, {
      escrowStatus: "REFUNDED",
      createdAtISO: iso(S - 20 * DAY),
      eventEndedAtISO: iso(E),
      dispute: {
        reason: "GATE_DENIED",
        note: {
          en: "The barcode was refused twice, and the crew wrote me a note saying so.",
          id: "Barcode-nya ditolak dua kali, dan petugas menuliskan surat penolakan.",
        },
        evidence: { fileName: "staff-rejection-note.jpg", kind: "STAFF_LETTER", capturedAtISO: iso(S + 0.4 * H), atVenue: true, showsBarcode: true },
        openedAtISO: iso(E + 0.5 * H),
        verdict: {
          toSeller: false,
          remedy: "REFUND_FULL",
          refundAmount: amount,
          sellerPenalty: Math.round((amount * SELLER_PENALTY_PCT) / 100),
          rationale: {
            en: "The note from the gate is consistent with a denied entry: its time and place both check out.",
            id: "Surat dari gate konsisten dengan penolakan masuk: waktu dan tempatnya sama-sama cocok.",
          },
          decidedAtISO: iso(E + 20 * H),
        },
      },
    }));
  }
  return orders;
}
