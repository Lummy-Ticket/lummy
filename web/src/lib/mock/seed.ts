import type { EventItem, Listing, User, Role } from "./types";
import { EVENT_DURATION_H } from "./escrow";
import { eventPoster } from "../poster";

// Resale ceiling = 150% of face value (docs: price cap).
export const CAP_PCT = 150;
export const FLOOR_PCT = 50;

// Made-up people, never the team's own names, on Lummy's own demo subdomain (no DNS, so no mail
// can reach it), the same names and addresses as the presenter's demo accounts (lib/supabase/demo.ts).
export const DEMO_USERS: Record<Role, User> = {
  BUYER: { id: "u-buyer", name: "Raka Pratama", email: "raka@demo.lummy.id", role: "BUYER" },
  SELLER: { id: "u-seller", name: "Maya Kusuma", email: "maya@demo.lummy.id", role: "SELLER" },
  ADMIN: { id: "u-admin", name: "Admin Lummy", email: "admin@demo.lummy.id", role: "ADMIN" },
};

// Photos of the real shows: freely licensed (CC BY, CC BY-SA, CC0) from Wikimedia Commons, cropped
// to 16:9, with the credit their licence asks for shown under the photo on the show's page
// (public/assets/events/CREDITS.md). A show without one gets a generated poster.
const PHOTOS: Record<string, { image: string; imageCredit: string }> = {
  "ev-ye-jakarta": { image: "/assets/events/ev-ye-jakarta.jpg", imageCredit: "Photo: Matete Plays, CC BY-SA 4.0, via Wikimedia Commons" },
  "ev-gnr-jakarta": { image: "/assets/events/ev-gnr-jakarta.jpg", imageCredit: "Photo: Raph_PH, CC BY 2.0, via Wikimedia Commons" },
  "ev-5sos-jakarta": { image: "/assets/events/ev-5sos-jakarta.jpg", imageCredit: "Photo: Sharkywoo at English Wikipedia, CC BY-SA 3.0, via Wikimedia Commons" },
  // The sold-out first night of the same tour, same band and venue: the same photo.
  "ev-5sos-jakarta-nov": { image: "/assets/events/ev-5sos-jakarta.jpg", imageCredit: "Photo: Sharkywoo at English Wikipedia, CC BY-SA 3.0, via Wikimedia Commons" },
  "ev-boyz-dewa": { image: "/assets/events/ev-boyz-dewa.jpg", imageCredit: "Photo: Library of Congress Life, CC0, via Wikimedia Commons" },
  "ev-men-i-trust": { image: "/assets/events/ev-men-i-trust.jpg", imageCredit: "Photo: Justin Higuchi, CC BY 2.0, via Wikimedia Commons" },
  "ev-simple-plan": { image: "/assets/events/ev-simple-plan.jpg", imageCredit: "Photo: Alfred Nitsch, CC BY-SA 4.0, via Wikimedia Commons" },
  "ev-dwp-2026": { image: "/assets/events/ev-dwp-2026.jpg", imageCredit: "Photo of JIExpo Kemayoran: Midori, CC BY 3.0, via Wikimedia Commons" },
  "ev-bbw-2026": { image: "/assets/events/ev-bbw-2026.jpg", imageCredit: "Photo of the convention centre: กสิณธร ราชโอรส, CC BY-SA 4.0, via Wikimedia Commons" },
  "ev-devcon-8": { image: "/assets/events/ev-devcon-8.jpg", imageCredit: "Photo of the Jio World Centre: Fuzheado, CC0, via Wikimedia Commons" },
  "ev-sbw-2026": { image: "/assets/events/ev-sbw-2026.jpg", imageCredit: "Photo of Marina Bay: Dietmar Rabich, CC BY-SA 4.0, via Wikimedia Commons" },
};
const art = (id: string) => PHOTOS[id] ?? { image: eventPoster(id) };
/** A show's picture, for orders that snapshot it. */
export const eventArt = (id: string): { image: string; imageCredit?: string } => art(id);

const H = 3_600_000;

// Price and listing count are derived from SEED_LISTINGS below, so they are left out here.
export type SeedEvent = Omit<EventItem, "fromPrice" | "listingCount">;

/** Short names fans type that the titles do not carry, matched by the search boxes (lib/catalogue). */
export const SEARCH_KEYWORDS: Record<string, string> = {
  "ev-ye-jakarta": "kanye west",
  "ev-gnr-jakarta": "gnr guns and roses",
  "ev-5sos-jakarta-nov": "5sos first show",
  "ev-5sos-jakarta": "5sos",
  "ev-boyz-dewa": "boyz 2 men boys dewa19",
  "ev-dwp-2026": "dwp",
  "ev-bbw-2026": "bbw binance",
  "ev-devcon-8": "ethereum",
  "ev-sbw-2026": "sbw",
};

/**
 * Where each venue is, for the location check on claim photos (radius 1.5 km,
 * lib/evidence/server.ts). Taken from each venue's Wikipedia article, not guessed. Tennis Indoor
 * Senayan has no point of its own; its article leads to the Gelora Bung Karno complex it stands
 * in, so it takes that one. The Jio World Centre has none at all, so its show skips the check.
 * Mirrored as events.venue_lat and venue_lng.
 */
export const VENUE_LOCATION: Record<string, { lat: number; lng: number }> = {
  "Stadion Utama GBK": { lat: -6.21858, lng: 106.80251 },
  "Stadion Madya GBK": { lat: -6.21694, lng: 106.79917 },
  "Indonesia Arena": { lat: -6.21472, lng: 106.80056 },
  "Tennis Indoor Senayan": { lat: -6.21858, lng: 106.80251 },
  "JIExpo Kemayoran": { lat: -6.1467, lng: 106.84568 },
  "Queen Sirikit National Convention Center": { lat: 13.723992, lng: 100.559222 },
};

// Real shows (tasks/real-events-2026.md, with a source for every price): title, day, venue and
// face values as the promoter or the press published them; where a category sold in phases, the
// last phase's price. A name rule is set only where the terms the tickets are sold under state one
// (Ye's, on Loket; 5 Seconds of Summer's, on SODTix); the rest read "not confirmed". Where no start
// time was published, 19:00 WIB stands in.
// Shows abroad are priced in USDC, in micro-USDC.
// Every show is real (decided 29 Oct 2026: no made-up sample show). What a demo has to show lives on
// them: a held listing, an ID-match checkout (5 Seconds of Summer), and past orders on a show that
// has happened, on its own date. A show that has passed stays here, so its orders keep their show.
export const seedEvents = (): SeedEvent[] => [
  {
    id: "ev-ye-jakarta", title: "Ye Live in Jakarta", category: "Music",
    dateISO: "2026-10-24T19:00:00+07:00", venue: "Stadion Utama GBK", city: "Jakarta",
    // Loket's terms: the purchase is in the name on an official ID and cannot be changed after,
    // and entry is through the buyer's own LOKET X account.
    ...art("ev-ye-jakarta"), featured: true, transferPolicy: "id_match",
    tiers: [
      { id: "t-ye-cat1", name: "CAT 1A", faceValue: 4_875_000 },
      { id: "t-ye-fest", name: "Festival A", faceValue: 3_500_000 },
      { id: "t-ye-cat3", name: "CAT 3A", faceValue: 2_875_000 },
      { id: "t-ye-cat4", name: "CAT 4A", faceValue: 1_875_000 },
    ],
  },
  {
    id: "ev-gnr-jakarta", title: "Guns N' Roses World Tour 2026, Jakarta", category: "Music",
    dateISO: "2026-11-21T19:00:00+07:00", venue: "Stadion Madya GBK", city: "Jakarta",
    ...art("ev-gnr-jakarta"), featured: true, transferPolicy: null,
    tiers: [
      { id: "t-gnr-vip", name: "VIP", faceValue: 7_500_000 },
      { id: "t-gnr-fest-a", name: "Festival A", faceValue: 3_750_000 },
      { id: "t-gnr-trib-b", name: "Tribune B", faceValue: 2_250_000 },
      { id: "t-gnr-fest-c", name: "Festival C", faceValue: 1_750_000 },
    ],
  },
  // 5 Seconds of Summer, two nights with the same seat plan and prices; the first sold out in May.
  // Tickets are sold on SODTix, in the buyer's name with an ID number, and its terms (items 6 and 7)
  // turn away an e-ticket whose name differs from the ID shown, unless the promoter accepts a signed
  // letter; Chakra Live Asia has not said it does. Both start at 18:00 WIB: SODTix's own record for
  // the second show runs 18:00 to 23:00; no door time is published, and the first show's record is
  // not public, so it takes the same hour. The No.1 Obsession packages are tickets with extras; the
  // Bite the Apple upgrade is not a ticket, so it is not a category here.
  {
    id: "ev-5sos-jakarta-nov", title: "5 Seconds of Summer: Everyone's a Star! Jakarta", category: "Music",
    dateISO: "2026-11-14T18:00:00+07:00", venue: "Indonesia Arena", city: "Jakarta",
    ...art("ev-5sos-jakarta-nov"), transferPolicy: "id_match",
    tiers: [
      { id: "t-5sos-nov-vip-box", name: "VIP Box No.1 Obsession Seat Package", faceValue: 5_000_000 },
      { id: "t-5sos-nov-cat1-vip", name: "CAT 1 VIP No.1 Obsession Seat Package", faceValue: 4_140_000 },
      { id: "t-5sos-nov-ga-vip", name: "GA VIP No.1 Obsession Package", faceValue: 3_950_000 },
      { id: "t-5sos-nov-cat1", name: "CAT 1", faceValue: 2_140_000 },
      { id: "t-5sos-nov-ga", name: "GA", faceValue: 1_950_000 },
      { id: "t-5sos-nov-cat2", name: "CAT 2", faceValue: 1_630_000 },
      { id: "t-5sos-nov-cat3", name: "CAT 3", faceValue: 1_320_000 },
      { id: "t-5sos-nov-cat4", name: "CAT 4", faceValue: 910_000 },
    ],
  },
  {
    // SODTix names it the second show, which also tells the two apart in the sell form's list.
    id: "ev-5sos-jakarta", title: "5 Seconds of Summer: Everyone's a Star! Jakarta, Second Show", category: "Music",
    dateISO: "2026-12-06T18:00:00+07:00", venue: "Indonesia Arena", city: "Jakarta",
    ...art("ev-5sos-jakarta"), transferPolicy: "id_match",
    tiers: [
      { id: "t-5sos-vip-box", name: "VIP Box No.1 Obsession Seat Package", faceValue: 5_000_000 },
      { id: "t-5sos-cat1-vip", name: "CAT 1 VIP No.1 Obsession Seat Package", faceValue: 4_140_000 },
      { id: "t-5sos-ga-vip", name: "GA VIP No.1 Obsession Package", faceValue: 3_950_000 },
      { id: "t-5sos-cat1", name: "CAT 1", faceValue: 2_140_000 },
      { id: "t-5sos-ga", name: "GA", faceValue: 1_950_000 },
      { id: "t-5sos-cat2", name: "CAT 2", faceValue: 1_630_000 },
      { id: "t-5sos-cat3", name: "CAT 3", faceValue: 1_320_000 },
      { id: "t-5sos-cat4", name: "CAT 4", faceValue: 910_000 },
    ],
  },
  {
    id: "ev-boyz-dewa", title: "Boyz II Men & Dewa 19 Live in Jakarta", category: "Music",
    dateISO: "2026-12-09T19:00:00+07:00", venue: "Indonesia Arena", city: "Jakarta",
    ...art("ev-boyz-dewa"), transferPolicy: null,
    tiers: [
      { id: "t-bd-vip", name: "VIP", faceValue: 5_000_000 },
      { id: "t-bd-platinum", name: "Platinum", faceValue: 2_500_000 },
      { id: "t-bd-festival", name: "Festival", faceValue: 1_750_000 },
      { id: "t-bd-silver", name: "Silver", faceValue: 750_000 },
    ],
  },
  {
    id: "ev-men-i-trust", title: "Men I Trust: Asia Tour 2026, Jakarta", category: "Music",
    dateISO: "2026-11-12T19:00:00+07:00", venue: "Tennis Indoor Senayan", city: "Jakarta",
    ...art("ev-men-i-trust"), transferPolicy: null,
    tiers: [
      { id: "t-mit-trib-a", name: "Tribune A", faceValue: 818_000 },
      { id: "t-mit-trib-b", name: "Tribune B", faceValue: 718_000 },
      { id: "t-mit-fest", name: "Festival 1", faceValue: 618_000 },
      { id: "t-mit-trib-c", name: "Tribune C", faceValue: 518_000 },
    ],
  },
  {
    id: "ev-simple-plan", title: "Simple Plan Live in Jakarta 2026", category: "Music",
    dateISO: "2026-11-27T19:00:00+07:00", venue: "Tennis Indoor Senayan", city: "Jakarta",
    ...art("ev-simple-plan"), transferPolicy: null,
    tiers: [
      { id: "t-sp-cat3", name: "CAT 3", faceValue: 1_950_000 },
      { id: "t-sp-cat1", name: "CAT 1", faceValue: 1_650_000 },
      { id: "t-sp-cat4", name: "CAT 4", faceValue: 1_450_000 },
      { id: "t-sp-cat2", name: "CAT 2", faceValue: 950_000 },
    ],
  },
  {
    id: "ev-dwp-2026", title: "Djakarta Warehouse Project 2026", category: "Music",
    dateISO: "2026-12-11T19:00:00+07:00", venue: "JIExpo Kemayoran", city: "Jakarta",
    ...art("ev-dwp-2026"), transferPolicy: null,
    tiers: [
      { id: "t-dwp-vip", name: "VIP 3-Day Pass", faceValue: 4_200_000 },
      { id: "t-dwp-ga", name: "GA 3-Day Pass", faceValue: 2_100_000 },
    ],
  },
  {
    id: "ev-bbw-2026", title: "Binance Blockchain Week 2026", category: "Technology",
    dateISO: "2026-11-28T09:00:00+07:00", venue: "Queen Sirikit National Convention Center", city: "Bangkok",
    ...art("ev-bbw-2026"), featured: true, transferPolicy: null, country: "TH", currency: "USDC",
    tiers: [
      { id: "t-bbw-early", name: "Early Bird", faceValue: 19_000_000 },
      { id: "t-bbw-full", name: "Full Pass", faceValue: 129_000_000 },
    ],
  },
  {
    id: "ev-devcon-8", title: "Devcon 8", category: "Technology",
    dateISO: "2026-11-03T09:00:00+05:30", venue: "Jio World Centre", city: "Mumbai",
    ...art("ev-devcon-8"), transferPolicy: null, country: "IN", currency: "USDC",
    tiers: [
      { id: "t-devcon-early", name: "Early Bird", faceValue: 349_000_000 },
      { id: "t-devcon-ga", name: "General Admission", faceValue: 499_000_000 },
    ],
  },
  {
    id: "ev-sbw-2026", title: "Singapore Blockchain Week 2026", category: "Technology",
    dateISO: "2026-11-13T09:00:00+08:00", venue: "Singapore & Johor", city: "Singapore",
    ...art("ev-sbw-2026"), transferPolicy: null, country: "SG", currency: "USDC",
    tiers: [
      { id: "t-sbw-general", name: "General", faceValue: 88_000_000 },
      { id: "t-sbw-corporate", name: "Corporate", faceValue: 388_000_000 },
      { id: "t-sbw-professional", name: "Professional", faceValue: 688_000_000 },
      { id: "t-sbw-vip", name: "VIP", faceValue: 988_000_000 },
    ],
  },
];

// Resale listings, all samples (sellers without an account), checked like any other. One is held
// for review (ls-29, on DWP), as a real account's flagged listing is.
const ok = (forgeryScore: number) => ({ autofilled: true, forgeryScore, barcodeDuplicate: false, pdfSuspicious: false });
export const SEED_LISTINGS: Listing[] = [
  // Guns N' Roses: mixed quantities, so the "how many tickets" filter has something to do.
  { id: "ls-1", eventId: "ev-gnr-jakarta", tierId: "t-gnr-trib-b", sellerName: "Maya K.", askPrice: 2_800_000, faceValue: 2_250_000, quantity: 2, splittable: false, status: "active", gateKtp: false, ai: ok(8) },
  { id: "ls-2", eventId: "ev-gnr-jakarta", tierId: "t-gnr-fest-c", sellerName: "Rian P.", askPrice: 1_950_000, faceValue: 1_750_000, quantity: 1, splittable: false, status: "active", gateKtp: false, ai: ok(12) },
  { id: "ls-6", eventId: "ev-gnr-jakarta", tierId: "t-gnr-trib-b", sellerName: "Vino M.", askPrice: 2_650_000, faceValue: 2_250_000, quantity: 2, splittable: true, status: "active", gateKtp: false, ai: ok(6) },
  { id: "ls-7", eventId: "ev-gnr-jakarta", tierId: "t-gnr-fest-a", sellerName: "Kirana W.", askPrice: 3_900_000, faceValue: 3_750_000, quantity: 4, splittable: true, status: "active", gateKtp: false, ai: ok(10) },
  // Ye has happened (24 Oct 2026): what is left of its listings is what the sample orders bought
  // (lib/mock/seed-orders.ts), one of them the sample seller's.
  { id: "ls-18", eventId: "ev-ye-jakarta", tierId: "t-ye-fest", sellerName: "Maya K.", askPrice: 4_200_000, faceValue: 3_500_000, quantity: 1, splittable: false, status: "sold", gateKtp: false, ai: ok(7) },
  { id: "ls-19", eventId: "ev-ye-jakarta", tierId: "t-ye-cat4", sellerName: "Citra N.", askPrice: 2_450_000, faceValue: 1_875_000, quantity: 1, splittable: false, status: "sold", gateKtp: false, ai: ok(9) },
  { id: "ls-20", eventId: "ev-ye-jakarta", tierId: "t-ye-cat1", sellerName: "Hendra W.", askPrice: 5_600_000, faceValue: 4_875_000, quantity: 1, splittable: false, status: "sold", gateKtp: false, ai: ok(11) },
  // 5 Seconds of Summer: the sold-out first night, then the second.
  { id: "ls-27", eventId: "ev-5sos-jakarta-nov", tierId: "t-5sos-nov-cat3", sellerName: "Nabila F.", askPrice: 1_550_000, faceValue: 1_320_000, quantity: 2, splittable: true, status: "active", gateKtp: false, ai: ok(6) },
  { id: "ls-28", eventId: "ev-5sos-jakarta-nov", tierId: "t-5sos-nov-ga", sellerName: "Rizky H.", askPrice: 2_350_000, faceValue: 1_950_000, quantity: 1, splittable: false, status: "active", gateKtp: false, ai: ok(9) },
  { id: "ls-12", eventId: "ev-5sos-jakarta", tierId: "t-5sos-cat4", sellerName: "Salsa M.", askPrice: 1_050_000, faceValue: 910_000, quantity: 2, splittable: false, status: "active", gateKtp: false, ai: ok(6) },
  { id: "ls-13", eventId: "ev-5sos-jakarta", tierId: "t-5sos-cat3", sellerName: "Dimas R.", askPrice: 1_450_000, faceValue: 1_320_000, quantity: 1, splittable: false, status: "active", gateKtp: false, ai: ok(10) },
  { id: "ls-16", eventId: "ev-5sos-jakarta", tierId: "t-5sos-ga", sellerName: "Ayu S.", askPrice: 2_100_000, faceValue: 1_950_000, quantity: 2, splittable: true, status: "active", gateKtp: false, ai: ok(7) },
  // Boyz II Men + Dewa19
  { id: "ls-14", eventId: "ev-boyz-dewa", tierId: "t-bd-silver", sellerName: "Intan D.", askPrice: 850_000, faceValue: 750_000, quantity: 4, splittable: true, status: "active", gateKtp: false, ai: ok(5) },
  { id: "ls-15", eventId: "ev-boyz-dewa", tierId: "t-bd-festival", sellerName: "Bima K.", askPrice: 1_950_000, faceValue: 1_750_000, quantity: 2, splittable: false, status: "active", gateKtp: false, ai: ok(9) },
  { id: "ls-17", eventId: "ev-boyz-dewa", tierId: "t-bd-vip", sellerName: "Yoga P.", askPrice: 5_400_000, faceValue: 5_000_000, quantity: 1, splittable: false, status: "active", gateKtp: false, ai: ok(12) },
  { id: "ls-5", eventId: "ev-boyz-dewa", tierId: "t-bd-platinum", sellerName: "Fajar S.", askPrice: 2_750_000, faceValue: 2_500_000, quantity: 3, splittable: true, status: "active", gateKtp: false, ai: ok(9) },
  // Men I Trust, Simple Plan and DWP
  { id: "ls-21", eventId: "ev-men-i-trust", tierId: "t-mit-trib-c", sellerName: "Laras P.", askPrice: 600_000, faceValue: 518_000, quantity: 2, splittable: true, status: "active", gateKtp: false, ai: ok(5) },
  { id: "ls-22", eventId: "ev-men-i-trust", tierId: "t-mit-fest", sellerName: "Bayu A.", askPrice: 690_000, faceValue: 618_000, quantity: 1, splittable: false, status: "active", gateKtp: false, ai: ok(8) },
  { id: "ls-23", eventId: "ev-simple-plan", tierId: "t-sp-cat2", sellerName: "Rani K.", askPrice: 1_050_000, faceValue: 950_000, quantity: 2, splittable: true, status: "active", gateKtp: false, ai: ok(6) },
  { id: "ls-24", eventId: "ev-simple-plan", tierId: "t-sp-cat4", sellerName: "Tegar M.", askPrice: 1_600_000, faceValue: 1_450_000, quantity: 1, splittable: false, status: "active", gateKtp: false, ai: ok(9) },
  { id: "ls-25", eventId: "ev-dwp-2026", tierId: "t-dwp-ga", sellerName: "Kevin H.", askPrice: 2_300_000, faceValue: 2_100_000, quantity: 2, splittable: true, status: "active", gateKtp: false, ai: ok(7) },
  { id: "ls-26", eventId: "ev-dwp-2026", tierId: "t-dwp-vip", sellerName: "Sinta R.", askPrice: 4_600_000, faceValue: 4_200_000, quantity: 1, splittable: false, status: "active", gateKtp: false, ai: ok(10) },
  // Held for a person to check: the PDF's structure looked edited, so it is shown "under review" and
  // cannot be bought until staff clear it, as a real account's flagged listing is.
  { id: "ls-29", eventId: "ev-dwp-2026", tierId: "t-dwp-ga", sellerName: "Dinda K.", askPrice: 2_250_000, faceValue: 2_100_000, quantity: 2, splittable: true, status: "active", gateKtp: false, ai: { autofilled: true, forgeryScore: 74, barcodeDuplicate: false, pdfSuspicious: true } },
  // Shows abroad, in micro-USDC. The cheapest sits at half its face value, so one faucet top-up buys it.
  { id: "ls-bbw-1", eventId: "ev-bbw-2026", tierId: "t-bbw-early", sellerName: "Arif T.", askPrice: 9_500_000, faceValue: 19_000_000, quantity: 1, splittable: false, status: "active", gateKtp: false, ai: ok(4) },
  { id: "ls-bbw-2", eventId: "ev-bbw-2026", tierId: "t-bbw-early", sellerName: "Mei L.", askPrice: 24_000_000, faceValue: 19_000_000, quantity: 2, splittable: true, status: "active", gateKtp: false, ai: ok(6) },
  { id: "ls-bbw-3", eventId: "ev-bbw-2026", tierId: "t-bbw-full", sellerName: "Daniel K.", askPrice: 139_000_000, faceValue: 129_000_000, quantity: 1, splittable: false, status: "active", gateKtp: false, ai: ok(8) },
  { id: "ls-devcon-1", eventId: "ev-devcon-8", tierId: "t-devcon-ga", sellerName: "Priya S.", askPrice: 520_000_000, faceValue: 499_000_000, quantity: 1, splittable: false, status: "active", gateKtp: false, ai: ok(5) },
  { id: "ls-sbw-1", eventId: "ev-sbw-2026", tierId: "t-sbw-general", sellerName: "Wei Jie T.", askPrice: 75_000_000, faceValue: 88_000_000, quantity: 1, splittable: false, status: "active", gateKtp: false, ai: ok(5) },
  { id: "ls-sbw-2", eventId: "ev-sbw-2026", tierId: "t-sbw-corporate", sellerName: "Nur A.", askPrice: 420_000_000, faceValue: 388_000_000, quantity: 1, splittable: false, status: "active", gateKtp: false, ai: ok(8) },
  { id: "ls-devcon-2", eventId: "ev-devcon-8", tierId: "t-devcon-early", sellerName: "Kenji M.", askPrice: 399_000_000, faceValue: 349_000_000, quantity: 1, splittable: false, status: "active", gateKtp: false, ai: ok(7) },
];
// No seed listing carries a duplicate barcode: the server refuses one at publish, so a real show
// never lists it. The duplicate is shown where it happens, on the Sell page's sample ticket.

/**
 * A buyer can pay for it: never a known duplicate, and either nothing flagged it or a person
 * reviewed the flag and cleared it. The same rule as claim_listing and catalogue_events.
 */
export const isBuyable = (l: Listing) =>
  !l.ai.barcodeDuplicate && (!!l.cleared || (!l.ai.pdfSuspicious && l.ai.forgeryScore < 60));

/** Flagged by the checks, then cleared by a person: worth saying so rather than just "Checked". */
export const clearedByStaff = (l: Listing) => !!l.cleared && (l.ai.pdfSuspicious || l.ai.forgeryScore >= 60);

// The card, the price filter and the event page all read price and count from here,
// so they cannot drift apart from what is actually on sale.
const withPrices = (e: SeedEvent): EventItem => {
  const live = SEED_LISTINGS.filter((l) => l.eventId === e.id && l.status === "active" && isBuyable(l));
  return { ...e, listingCount: live.length, fromPrice: live.length ? Math.min(...live.map((l) => l.askPrice)) : 0 };
};

// Built once: every show has a fixed date, so the objects stay the same and are stable as React
// memo dependencies. Which of them are still on is decided per call, below.
let built: EventItem[] | null = null;
function catalogue(): EventItem[] {
  built ??= seedEvents().map(withPrices);
  return built;
}

/** True once the show has run its course. Past shows are not for sale. */
export const isEventOver = (e: EventItem, now: number = Date.now()) =>
  now >= new Date(e.dateISO).getTime() + EVENT_DURATION_H * H;

/**
 * True once the show has started: nothing is bought or listed from then on, since a ticket bought
 * after the doors open could not be handed over in time (uji manual 25 Oct 2026). The server routes
 * apply the same rule (lib/orders/create, api/listings).
 */
export const isSaleClosed = (e: Pick<EventItem, "dateISO">, now: number = Date.now()) => now >= new Date(e.dateISO).getTime();

// --- selectors ---
/** The catalogue: shows that have not ended yet. */
export const getEvents = (now: number = Date.now()) => catalogue().filter((e) => !isEventOver(e, now));
export const getFeaturedEvents = (now: number = Date.now()) => getEvents(now).filter((e) => e.featured);
/** Any show in the catalogue, the ones that have happened included. */
export const getEventById = (id: string) => catalogue().find((e) => e.id === id);
export const getListingsByEvent = (eventId: string) =>
  SEED_LISTINGS.filter((l) => l.eventId === eventId);
export const getTier = (event: EventItem, tierId: string) =>
  event.tiers.find((t) => t.id === tierId);
