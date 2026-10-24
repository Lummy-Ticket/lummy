"use client";

// One place every page reads the catalogue from. The root layout hands in what the server
// loaded from Supabase; without it (no env, or the read failed) this falls back to the
// sample seed, so the app never breaks on a missing database.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { SEED_LISTINGS, getEventById, getEvents, getListingsByEvent, isEventOver, isSampleEvent } from "@/lib/mock/seed";
import type { EventItem, Listing } from "@/lib/mock/types";

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
