import type { EventItem, Listing, User, Role } from "./types";

// Harga ceiling resale = 150% face value (docs: price cap).
export const CAP_PCT = 150;
export const FLOOR_PCT = 50;

export const DEMO_USERS: Record<Role, User> = {
  BUYER: { id: "u-buyer", name: "Luthfi Hadi", email: "luthfi@demo.id", role: "BUYER" },
  SELLER: { id: "u-seller", name: "Zahra Amelia", email: "zahra@demo.id", role: "SELLER" },
  ADMIN: { id: "u-admin", name: "Admin OperTix", email: "admin@opertix.id", role: "ADMIN" },
};

const img = (seed: string) => `https://picsum.photos/seed/${seed}/600/440`;

export const SEED_EVENTS: EventItem[] = [
  {
    id: "ev-coldplay", title: "Coldplay: Music of the Spheres", category: "Music",
    dateISO: "2026-11-14T19:00:00+07:00", venue: "Stadion Utama GBK", city: "Jakarta",
    image: img("coldplay"), featured: true, fromPrice: 2_400_000, listingCount: 8,
    tiers: [
      { id: "t-cp-fest", name: "Festival", faceValue: 3_500_000 },
      { id: "t-cp-cat1", name: "CAT 1", faceValue: 2_250_000 },
      { id: "t-cp-cat3", name: "CAT 3", faceValue: 1_250_000 },
    ],
  },
  {
    id: "ev-newjeans", title: "NewJeans Fan Meeting: Bunnies Jakarta", category: "Music",
    dateISO: "2026-09-27T18:00:00+07:00", venue: "ICE BSD Hall 10", city: "Tangerang",
    image: img("newjeans"), featured: true, fromPrice: 1_650_000, listingCount: 5,
    tiers: [
      { id: "t-nj-vip", name: "VIP Soundcheck", faceValue: 2_800_000 },
      { id: "t-nj-cat1", name: "CAT 1", faceValue: 1_500_000 },
    ],
  },
  {
    id: "ev-wtf", title: "We The Fest 2026", category: "Music",
    dateISO: "2026-08-21T14:00:00+07:00", venue: "JIExpo Kemayoran", city: "Jakarta",
    image: img("wtf"), featured: true, fromPrice: 950_000, listingCount: 12,
    tiers: [
      { id: "t-wtf-3day", name: "3-Day Pass", faceValue: 1_850_000 },
      { id: "t-wtf-1day", name: "1-Day Pass", faceValue: 850_000 },
    ],
  },
  {
    id: "ev-tulus", title: "Tulus: Manusia Tour", category: "Music",
    dateISO: "2026-10-04T20:00:00+07:00", venue: "Sentul International Convention Center", city: "Bogor",
    image: img("tulus"), fromPrice: 700_000, listingCount: 6,
    tiers: [
      { id: "t-tl-vip", name: "VIP", faceValue: 1_200_000 },
      { id: "t-tl-reg", name: "Reguler", faceValue: 650_000 },
    ],
  },
  {
    id: "ev-sos", title: "Sheila on 7: Tunggu Aku di Jakarta", category: "Music",
    dateISO: "2026-12-13T19:30:00+07:00", venue: "Stadion Madya GBK", city: "Jakarta",
    image: img("sheila"), fromPrice: 550_000, listingCount: 9, soldOut: false,
    tiers: [
      { id: "t-sos-fest", name: "Festival", faceValue: 750_000 },
      { id: "t-sos-tribun", name: "Tribun", faceValue: 500_000 },
    ],
  },
  {
    id: "ev-pandji", title: "Pandji Pragiwaksono: Menyala", category: "Theater",
    dateISO: "2026-09-06T19:00:00+07:00", venue: "Ciputra Artpreneur", city: "Jakarta",
    image: img("pandji"), fromPrice: 350_000, listingCount: 4,
    tiers: [
      { id: "t-pj-gold", name: "Gold", faceValue: 500_000 },
      { id: "t-pj-silver", name: "Silver", faceValue: 350_000 },
    ],
  },
  {
    id: "ev-timnas", title: "Timnas Indonesia vs Jepang", category: "Sports",
    dateISO: "2026-11-19T19:00:00+07:00", venue: "Stadion Utama GBK", city: "Jakarta",
    image: img("timnas"), fromPrice: 400_000, listingCount: 15,
    tiers: [
      { id: "t-tn-vip", name: "VIP", faceValue: 900_000 },
      { id: "t-tn-cat1", name: "Kategori 1", faceValue: 500_000 },
      { id: "t-tn-cat2", name: "Kategori 2", faceValue: 300_000 },
    ],
  },
];

// Beberapa listing resale. Termasuk 1 skor forgery tinggi + 1 barcode duplikat
// buat mendemokan AI trust layer nanti.
export const SEED_LISTINGS: Listing[] = [
  // Coldplay: variasi qty biar filter "jumlah tiket" kelihatan
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
  // NewJeans: satu kena flag (buat demo badge "Dalam review", gak bisa dibeli)
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
];

// --- selectors ---
export const getEvents = () => SEED_EVENTS;
export const getFeaturedEvents = () => SEED_EVENTS.filter((e) => e.featured);
export const getEventById = (id: string) => SEED_EVENTS.find((e) => e.id === id);
export const getListingsByEvent = (eventId: string) =>
  SEED_LISTINGS.filter((l) => l.eventId === eventId);
export const getTier = (event: EventItem, tierId: string) =>
  event.tiers.find((t) => t.id === tierId);
