// One order in every settlement phase, so a demo never needs setup: upcoming, window running,
// auto-released, in review, refunded. Sample personas keep these in the browser; the demo
// accounts get the same five in the database when a presenter resets them. Dates for the
// settled ones are relative to the moment they are made, which keeps the 48h countdown live.
// Tour stops differ from the catalogue on purpose: those shows already happened, so they are
// no longer listed for sale.
import type { Order } from "./types";

const H = 3_600_000;

export function seedOrders(now: number = Date.now()): Order[] {
  const ago = (hours: number) => new Date(now - hours * H).toISOString();
  return [
    {
      id: "or-seed-1", listingId: "ls-2", eventId: "ev-coldplay",
      eventTitle: "Coldplay: Music of the Spheres",
      eventImage: "/assets/events/coldplay-hd.jpg",
      eventDateISO: "2026-11-14T19:00:00+07:00", tierName: "CAT 3", sellerName: "Rian P.",
      quantity: 1, amount: 1_400_000, gateKtp: true, escrowStatus: "LOCKED",
      createdAtISO: ago(20 * 24),
    },
    {
      // Show ended 6 hours ago: dispute window running, roughly 42h on the clock.
      id: "or-seed-2", listingId: "ls-x1", eventId: "ev-tulus",
      eventTitle: "Tulus: Manusia Tour, Surabaya",
      eventImage: "/assets/events/tulus-hd.jpg",
      eventDateISO: ago(10), tierName: "Festival", sellerName: "Bagas W.",
      quantity: 1, amount: 950_000, gateKtp: false, escrowStatus: "LOCKED",
      createdAtISO: ago(16 * 24), eventEndedAtISO: ago(6),
    },
    {
      // Nobody filed anything, so the contract paid the seller by itself.
      id: "or-seed-3", listingId: "ls-x2", eventId: "ev-dwp",
      eventTitle: "Djakarta Warehouse Project 2026",
      eventImage: "/assets/events/dwp-hd.jpg",
      eventDateISO: "2026-08-09T20:00:00+07:00", tierName: "GA", sellerName: "Rizky T.",
      quantity: 1, amount: 1_250_000, gateKtp: false, escrowStatus: "RELEASED",
      createdAtISO: "2026-07-18T13:00:00+07:00",
      eventEndedAtISO: "2026-08-10T00:00:00+07:00", autoReleased: true,
    },
    {
      // Filed 20h ago with gate-time evidence, still with the arbiter.
      id: "or-seed-4", listingId: "ls-x3", eventId: "ev-pandji",
      eventTitle: "Pandji Pragiwaksono: Menyala, Bandung",
      eventImage: "/assets/events/pandji-hd.jpg",
      eventDateISO: ago(30), tierName: "Silver", sellerName: "Zahra Amelia",
      quantity: 1, amount: 430_000, gateKtp: false, escrowStatus: "DISPUTED",
      createdAtISO: ago(24 * 24), eventEndedAtISO: ago(26),
      dispute: {
        reason: "BARCODE_USED",
        note: {
          en: "Scanner showed the code had already been used. Staff turned me away at gate 3.",
          id: "Scanner menunjukkan kodenya sudah pernah dipakai. Petugas menolak saya di gate 3.",
        },
        evidence: {
          fileName: "gate-scanner-rejected.jpg",
          kind: "SCANNER_PHOTO",
          capturedAtISO: ago(29),
          atVenue: true,
          showsBarcode: true,
        },
        openedAtISO: ago(20),
      },
    },
    {
      // Arbiter sided with the buyer, so the escrow refunded instead of paying out.
      id: "or-seed-5", listingId: "ls-x4", eventId: "ev-sos",
      eventTitle: "Sheila on 7: Tunggu Aku, Yogyakarta",
      eventImage: "/assets/events/sheila-hd.jpg",
      eventDateISO: ago(21 * 24), tierName: "Tribune", sellerName: "Farhan A.",
      quantity: 2, amount: 700_000, gateKtp: false, escrowStatus: "REFUNDED",
      createdAtISO: ago(40 * 24), eventEndedAtISO: ago(21 * 24 - 4),
      dispute: {
        reason: "GATE_DENIED",
        note: {
          en: "Barcode was rejected twice, the crew wrote a rejection note.",
          id: "Barcode ditolak dua kali, petugas menuliskan surat penolakan.",
        },
        evidence: {
          fileName: "staff-rejection-note.jpg",
          kind: "STAFF_LETTER",
          capturedAtISO: ago(21 * 24 - 3),
          atVenue: true,
          showsBarcode: true,
        },
        openedAtISO: ago(21 * 24 - 6),
        verdict: {
          toSeller: false,
          remedy: "REFUND_FULL",
          refundAmount: 700_000,
          sellerPenalty: 280_000,
          rationale: {
            en: "Gate-time evidence is consistent with a denied entry: timestamp and location both check out.",
            id: "Bukti dari gate konsisten dengan penolakan masuk: waktu dan lokasi sama-sama cocok.",
          },
          decidedAtISO: ago(20 * 24),
        },
      },
    },
  ];
}
