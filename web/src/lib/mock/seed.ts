import type { EventItem, Listing, User, Role } from "./types";
import { EVENT_DURATION_H } from "./escrow";
import { eventPoster } from "../poster";

// Resale ceiling = 150% of face value (docs: price cap).
export const CAP_PCT = 150;
export const FLOOR_PCT = 50;

export const DEMO_USERS: Record<Role, User> = {
  BUYER: { id: "u-buyer", name: "Luthfi Hadi", email: "luthfi@demo.id", role: "BUYER" },
  SELLER: { id: "u-seller", name: "Zahra Amelia", email: "zahra@demo.id", role: "SELLER" },
  ADMIN: { id: "u-admin", name: "Admin Lummy", email: "admin@lummy.id", role: "ADMIN" },
};

// Local event photos in public/assets/events (real artist shots from Wikimedia
// Commons under CC/PD; the national-team one is an Unsplash stadium), so the demo
// works offline. Falls back to a generated gradient poster when a seed has no photo.
// The -hd suffix is a version marker: rename it when swapping a photo so the
// next/image and browser caches bust.
const PHOTOS: Record<string, string> = {
  coldplay: "/assets/events/coldplay-hd.jpg",
  newjeans: "/assets/events/newjeans-hd.jpg",
  wtf: "/assets/events/wtf-crowd.jpg",
  tulus: "/assets/events/tulus-hd.jpg",
  sheila: "/assets/events/sheila-hd.jpg",
  pandji: "/assets/events/pandji-hd.jpg",
  timnas: "/assets/events/timnas-hd.jpg",
  dwp: "/assets/events/dwp-hd.jpg",
};
const img = (seed: string) => PHOTOS[seed] ?? eventPoster(seed);

const H = 3_600_000;
const WIB_H = 7;

/**
 * Tomorrow at `hour` o'clock Jakarta time. One show always sits this close, so the
 * last-minute listing rule (48h before doors) can be demonstrated on any day.
 */
function tomorrowWIB(hour: number, now: number) {
  const wib = new Date(now + WIB_H * H);
  return new Date(
    Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate() + 1, hour - WIB_H)
  ).toISOString();
}

// Price and listing count are derived from SEED_LISTINGS below, so they are left out here.
export type SeedEvent = Omit<EventItem, "fromPrice" | "listingCount">;

/** Shows that are always tomorrow, at this hour Jakarta time. Mirrored as events.rolling_hour. */
export const ROLLING_HOUR: Record<string, number> = { "ev-wtf": 14 };

// Fixed dates sit after the October demo window. A show that has ended drops out of
// the catalogue on its own (see getEvents), instead of staying on sale.
export const seedEvents = (now: number): SeedEvent[] => [
  {
    id: "ev-coldplay", title: "Coldplay: Music of the Spheres", category: "Music",
    dateISO: "2026-11-14T19:00:00+07:00", venue: "Stadion Utama GBK", city: "Jakarta",
    image: img("coldplay"), featured: true, transferPolicy: "letter",
    tiers: [
      { id: "t-cp-fest", name: "Festival", faceValue: 3_500_000 },
      { id: "t-cp-cat1", name: "CAT 1", faceValue: 2_250_000 },
      { id: "t-cp-cat3", name: "CAT 3", faceValue: 1_250_000 },
    ],
  },
  {
    id: "ev-newjeans", title: "NewJeans Fan Meeting: Bunnies Jakarta", category: "Music",
    dateISO: "2026-10-31T18:00:00+07:00", venue: "ICE BSD Hall 10", city: "Tangerang",
    image: img("newjeans"), featured: true, transferPolicy: "id_match",
    tiers: [
      { id: "t-nj-vip", name: "VIP Soundcheck", faceValue: 2_800_000 },
      { id: "t-nj-cat1", name: "CAT 1", faceValue: 1_500_000 },
    ],
  },
  {
    id: "ev-wtf", title: "We The Fest 2026", category: "Music",
    dateISO: tomorrowWIB(ROLLING_HOUR["ev-wtf"], now), venue: "JIExpo Kemayoran", city: "Jakarta",
    image: img("wtf"), featured: true, transferPolicy: "open",
    tiers: [
      { id: "t-wtf-3day", name: "3-Day Pass", faceValue: 1_850_000 },
      { id: "t-wtf-1day", name: "1-Day Pass", faceValue: 850_000 },
    ],
  },
  {
    id: "ev-tulus", title: "Tulus: Manusia Tour", category: "Music",
    dateISO: "2026-11-07T20:00:00+07:00", venue: "Sentul International Convention Center", city: "Bogor",
    image: img("tulus"), transferPolicy: "letter",
    tiers: [
      { id: "t-tl-vip", name: "VIP", faceValue: 1_200_000 },
      { id: "t-tl-reg", name: "Reguler", faceValue: 650_000 },
    ],
  },
  {
    id: "ev-sos", title: "Sheila on 7: Tunggu Aku di Jakarta", category: "Music",
    dateISO: "2026-12-13T19:30:00+07:00", venue: "Stadion Madya GBK", city: "Jakarta",
    image: img("sheila"), transferPolicy: "letter",
    tiers: [
      { id: "t-sos-fest", name: "Festival", faceValue: 750_000 },
      { id: "t-sos-tribun", name: "Tribun", faceValue: 500_000 },
    ],
  },
  {
    id: "ev-pandji", title: "Pandji Pragiwaksono: Menyala", category: "Theater",
    dateISO: "2026-11-28T19:00:00+07:00", venue: "Ciputra Artpreneur", city: "Jakarta",
    image: img("pandji"), transferPolicy: "open",
    tiers: [
      { id: "t-pj-gold", name: "Gold", faceValue: 500_000 },
      { id: "t-pj-silver", name: "Silver", faceValue: 350_000 },
    ],
  },
  {
    id: "ev-timnas", title: "Timnas Indonesia vs Jepang", category: "Sports",
    dateISO: "2026-11-19T19:00:00+07:00", venue: "Stadion Utama GBK", city: "Jakarta",
    image: img("timnas"), transferPolicy: "id_match",
    tiers: [
      { id: "t-tn-vip", name: "VIP", faceValue: 900_000 },
      { id: "t-tn-cat1", name: "Kategori 1", faceValue: 500_000 },
      { id: "t-tn-cat2", name: "Kategori 2", faceValue: 300_000 },
    ],
  },
];

// Beberapa listing resale. Termasuk 1 skor forgery tinggi + 1 barcode duplikat
// so the AI trust layer has something to demonstrate.
export const SEED_LISTINGS: Listing[] = [
  // Coldplay: mixed quantities so the "how many tickets" filter has something to do
  {
    id: "ls-1", eventId: "ev-coldplay", tierId: "t-cp-cat1", sellerName: "Zahra A.",
    askPrice: 2_800_000, faceValue: 2_250_000, quantity: 2, splittable: false, status: "active", gateKtp: true,
    ai: { autofilled: true, forgeryScore: 8, barcodeDuplicate: false, pdfSuspicious: false },
  },
  {
    id: "ls-2", eventId: "ev-coldplay", tierId: "t-cp-cat3", sellerName: "Rian P.",
    askPrice: 1_400_000, faceValue: 1_250_000, quantity: 1, splittable: false, status: "active", gateKtp: true,
    ai: { autofilled: true, forgeryScore: 12, barcodeDuplicate: false, pdfSuspicious: false },
  },
  {
    id: "ls-6", eventId: "ev-coldplay", tierId: "t-cp-cat1", sellerName: "Vino M.",
    askPrice: 2_650_000, faceValue: 2_250_000, quantity: 2, splittable: true, status: "active", gateKtp: true,
    ai: { autofilled: true, forgeryScore: 6, barcodeDuplicate: false, pdfSuspicious: false },
  },
  {
    id: "ls-7", eventId: "ev-coldplay", tierId: "t-cp-fest", sellerName: "Kirana W.",
    askPrice: 3_900_000, faceValue: 3_500_000, quantity: 4, splittable: true, status: "active", gateKtp: true,
    ai: { autofilled: true, forgeryScore: 10, barcodeDuplicate: false, pdfSuspicious: false },
  },
  // NewJeans: one flagged listing, to show the "under review" badge that cannot be bought
  {
    id: "ls-3", eventId: "ev-newjeans", tierId: "t-nj-cat1", sellerName: "Dinda K.",
    askPrice: 1_650_000, faceValue: 1_500_000, quantity: 2, splittable: true, status: "active", gateKtp: true,
    ai: { autofilled: true, forgeryScore: 74, barcodeDuplicate: false, pdfSuspicious: true },
  },
  // WTF: satu barcode duplikat (demo blok)
  {
    id: "ls-4", eventId: "ev-wtf", tierId: "t-wtf-1day", sellerName: "Bagas W.",
    askPrice: 950_000, faceValue: 850_000, quantity: 1, splittable: false, status: "active", gateKtp: false,
    ai: { autofilled: true, forgeryScore: 5, barcodeDuplicate: true, pdfSuspicious: false },
  },
  {
    id: "ls-5", eventId: "ev-timnas", tierId: "t-tn-cat1", sellerName: "Fajar S.",
    askPrice: 620_000, faceValue: 500_000, quantity: 3, splittable: true, status: "active", gateKtp: false,
    ai: { autofilled: true, forgeryScore: 9, barcodeDuplicate: false, pdfSuspicious: false },
  },
  // Clean listings, so every event in the catalogue has something a buyer can pay for
  // next to the flagged and duplicate ones above.
  {
    id: "ls-8", eventId: "ev-newjeans", tierId: "t-nj-cat1", sellerName: "Nadia P.",
    askPrice: 1_720_000, faceValue: 1_500_000, quantity: 2, splittable: true, status: "active", gateKtp: true,
    ai: { autofilled: true, forgeryScore: 7, barcodeDuplicate: false, pdfSuspicious: false },
  },
  {
    id: "ls-9", eventId: "ev-newjeans", tierId: "t-nj-vip", sellerName: "Gilang F.",
    askPrice: 3_300_000, faceValue: 2_800_000, quantity: 1, splittable: false, status: "active", gateKtp: true,
    ai: { autofilled: true, forgeryScore: 11, barcodeDuplicate: false, pdfSuspicious: false },
  },
  {
    id: "ls-10", eventId: "ev-wtf", tierId: "t-wtf-1day", sellerName: "Putri L.",
    askPrice: 900_000, faceValue: 850_000, quantity: 2, splittable: true, status: "active", gateKtp: false,
    ai: { autofilled: true, forgeryScore: 4, barcodeDuplicate: false, pdfSuspicious: false },
  },
  {
    id: "ls-11", eventId: "ev-wtf", tierId: "t-wtf-3day", sellerName: "Reza H.",
    askPrice: 2_050_000, faceValue: 1_850_000, quantity: 1, splittable: false, status: "active", gateKtp: false,
    ai: { autofilled: true, forgeryScore: 8, barcodeDuplicate: false, pdfSuspicious: false },
  },
  {
    id: "ls-12", eventId: "ev-tulus", tierId: "t-tl-reg", sellerName: "Salsa M.",
    askPrice: 720_000, faceValue: 650_000, quantity: 2, splittable: false, status: "active", gateKtp: false,
    ai: { autofilled: true, forgeryScore: 6, barcodeDuplicate: false, pdfSuspicious: false },
  },
  {
    id: "ls-13", eventId: "ev-tulus", tierId: "t-tl-vip", sellerName: "Dimas R.",
    askPrice: 1_380_000, faceValue: 1_200_000, quantity: 1, splittable: false, status: "active", gateKtp: false,
    ai: { autofilled: true, forgeryScore: 10, barcodeDuplicate: false, pdfSuspicious: false },
  },
  {
    id: "ls-14", eventId: "ev-sos", tierId: "t-sos-tribun", sellerName: "Intan D.",
    askPrice: 560_000, faceValue: 500_000, quantity: 4, splittable: true, status: "active", gateKtp: false,
    ai: { autofilled: true, forgeryScore: 5, barcodeDuplicate: false, pdfSuspicious: false },
  },
  {
    id: "ls-15", eventId: "ev-sos", tierId: "t-sos-fest", sellerName: "Bima K.",
    askPrice: 850_000, faceValue: 750_000, quantity: 2, splittable: false, status: "active", gateKtp: false,
    ai: { autofilled: true, forgeryScore: 9, barcodeDuplicate: false, pdfSuspicious: false },
  },
  {
    id: "ls-16", eventId: "ev-pandji", tierId: "t-pj-silver", sellerName: "Ayu S.",
    askPrice: 380_000, faceValue: 350_000, quantity: 2, splittable: true, status: "active", gateKtp: false,
    ai: { autofilled: true, forgeryScore: 7, barcodeDuplicate: false, pdfSuspicious: false },
  },
  {
    id: "ls-17", eventId: "ev-pandji", tierId: "t-pj-gold", sellerName: "Yoga P.",
    askPrice: 560_000, faceValue: 500_000, quantity: 1, splittable: false, status: "active", gateKtp: false,
    ai: { autofilled: true, forgeryScore: 12, barcodeDuplicate: false, pdfSuspicious: false },
  },
];

/** A buyer can pay for it: not a known duplicate, and not waiting on a human review. */
export const isBuyable = (l: Listing) =>
  !l.ai.barcodeDuplicate && !l.ai.pdfSuspicious && l.ai.forgeryScore < 60;

// The card, the price filter and the event page all read price and count from here,
// so they cannot drift apart from what is actually on sale.
const withPrices = (e: SeedEvent): EventItem => {
  const live = SEED_LISTINGS.filter((l) => l.eventId === e.id && l.status === "active" && isBuyable(l));
  return { ...e, listingCount: live.length, fromPrice: live.length ? Math.min(...live.map((l) => l.askPrice)) : 0 };
};

// Rebuilt when the Jakarta date changes, not once at module load: a server instance
// that lives past midnight would otherwise keep yesterday's "tomorrow" and disagree
// with a fresh browser. Within a day the objects stay the same, so they are stable
// as React memo dependencies.
let built: { day: number; events: EventItem[] } | null = null;
function catalogue(now: number): EventItem[] {
  const day = Math.floor((now + WIB_H * H) / (24 * H));
  if (built?.day !== day) built = { day, events: seedEvents(now).map(withPrices) };
  return built.events;
}

/** True once the show has run its course. Past shows are not for sale. */
export const isEventOver = (e: EventItem, now: number = Date.now()) =>
  now >= new Date(e.dateISO).getTime() + EVENT_DURATION_H * H;

// --- selectors ---
/** The catalogue: shows that have not ended yet. */
export const getEvents = (now: number = Date.now()) => catalogue(now).filter((e) => !isEventOver(e, now));
export const getFeaturedEvents = (now: number = Date.now()) => getEvents(now).filter((e) => e.featured);
export const getEventById = (id: string, now: number = Date.now()) => catalogue(now).find((e) => e.id === id);
export const getListingsByEvent = (eventId: string) =>
  SEED_LISTINGS.filter((l) => l.eventId === eventId);
export const getTier = (event: EventItem, tierId: string) =>
  event.tiers.find((t) => t.id === tierId);
