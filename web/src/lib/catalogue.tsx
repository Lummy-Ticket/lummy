"use client";

// One place every page reads the catalogue from. The root layout hands in what the server
// loaded from Supabase; without it (no env, or the read failed) this falls back to the
// sample seed, so the app never breaks on a missing database.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { SEARCH_KEYWORDS, SEED_LISTINGS, getEventById, getEvents, getListingsByEvent, isEventOver, isSampleEvent } from "@/lib/mock/seed";
import type { EventItem, Listing } from "@/lib/mock/types";
import { useActiveLang } from "@/lib/i18n";

// The words a category answers to in either language, so "konser" finds the concerts.
const CATEGORY_WORDS: Record<string, string> = {
  Music: "musik concert konser gig",
  Sports: "olahraga",
  Theater: "teater",
  Arts: "seni",
  Technology: "teknologi tech conference konferensi crypto kripto blockchain web3",
  Education: "edukasi",
  Food: "kuliner",
  Movies: "film",
};
// Lower case, accents and apostrophes off, so "guns n roses" finds "Guns N' Roses".
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "");

/** Whether a show answers a search: every word in its title, venue, city, category or short names. */
export function matchesSearch(e: EventItem, q: string): boolean {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold([e.title, e.venue, e.city, e.category, CATEGORY_WORDS[e.category] ?? "", SEARCH_KEYWORDS[e.id] ?? ""].join(" "));
  return words.every((w) => hay.includes(w));
}

/**
 * "Popular right now": the featured shows still to come, topped up with the soonest real shows
 * (those with tickets on sale first), so the row stays full when a featured show is over, as Ye
 * was on 24 Oct 2026. Done here, not in the data, since the live catalogue comes from the database.
 * The sample show never fills a gap: it is there for the demo, not as a show to recommend.
 */
export function popularEvents(events: EventItem[], n = 3): EventItem[] {
  const fill = events
    .filter((e) => !e.featured && !isSampleEvent(e.id))
    .sort((a, b) => Number(b.listingCount > 0) - Number(a.listingCount > 0) || a.dateISO.localeCompare(b.dateISO));
  return [...events.filter((e) => e.featured), ...fill].slice(0, n);
}

// The sample show's art with its tag in Indonesian ("Acara contoh"), from the same brand kit.
const ART_ID: Record<string, string> = { "/assets/events/ev-demo-fest.jpg": "/assets/events/ev-demo-fest-id.jpg" };

/** A photo credit as the licence asks for it, in Indonesian: "Foto: ..., lewat Wikimedia Commons". */
const creditId = (c: string) =>
  c
    .replace(/^Photo of the convention centre:/, "Foto gedung konvensinya:")
    .replace(/^Photo of (the )?/, "Foto ")
    .replace(/^Photo:/, "Foto:")
    .replace(" at English Wikipedia", " di Wikipedia bahasa Inggris")
    .replace(", via Wikimedia Commons", ", lewat Wikimedia Commons");

/**
 * How a show reads on the Indonesian page. Titles and photo credits are stored in English (the
 * database feeds the live site), so the sample show's label, its art and the credit lines are
 * turned here, for display only: search, orders and forms keep the stored English.
 */
export function useEventText() {
  const lang = useActiveLang();
  return useMemo(() => {
    const id = lang === "id";
    return {
      title: (e: Pick<EventItem, "title">) => (id ? e.title.replace("(sample event)", "(acara contoh)") : e.title),
      image: (e: Pick<EventItem, "image">) => (id ? (ART_ID[e.image] ?? e.image) : e.image),
      credit: (c: string) => (id ? creditId(c) : c),
    };
  }, [lang]);
}

/** Soonest first, with the sample show after the real ones. */
export const realShowsFirst = (a: EventItem, b: EventItem) =>
  Number(isSampleEvent(a.id)) - Number(isSampleEvent(b.id)) || a.dateISO.localeCompare(b.dateISO);

export type Catalogue = {
  source: "database" | "sample";
  /** On sale now: shows that have not ended yet. */
  events: EventItem[];
  /** Any known show, ended ones included, so old links still resolve. */
  eventById: (id: string) => EventItem | undefined;
  listingsByEvent: (eventId: string) => Listing[];
  listingById: (id: string) => Listing | undefined;
};

function fromSeed(): Catalogue {
  return {
    source: "sample",
    events: getEvents(),
    eventById: (id) => getEventById(id),
    listingsByEvent: (eventId) => getListingsByEvent(eventId),
    listingById: (id) => SEED_LISTINGS.find((l) => l.id === id),
  };
}

function fromData(data: { events: EventItem[]; listings: Listing[] }): Catalogue {
  return {
    source: "database",
    events: data.events.filter((e) => !isEventOver(e)),
    eventById: (id) => data.events.find((e) => e.id === id),
    listingsByEvent: (eventId) => data.listings.filter((l) => l.eventId === eventId),
    listingById: (id) => data.listings.find((l) => l.id === id),
  };
}

const CatalogueContext = createContext<Catalogue | null>(null);

export function CatalogueProvider({ data, children }: { data: { events: EventItem[]; listings: Listing[] } | null; children: ReactNode }) {
  const value = useMemo(() => (data ? fromData(data) : fromSeed()), [data]);
  return <CatalogueContext.Provider value={value}>{children}</CatalogueContext.Provider>;
}

export function useCatalogue(): Catalogue {
  const ctx = useContext(CatalogueContext);
  // Outside the provider (never in the app itself) the sample seed still answers.
  return ctx ?? fromSeed();
}
