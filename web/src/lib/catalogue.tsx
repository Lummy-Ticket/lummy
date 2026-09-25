"use client";

// One place every page reads the catalogue from. The root layout hands in what the server
// loaded from Supabase; without it (no env, or the read failed) this falls back to the
// sample seed, so the app never breaks on a missing database.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { SEED_LISTINGS, getEventById, getEvents, getListingsByEvent, isEventOver } from "@/lib/mock/seed";
import type { EventItem, Listing } from "@/lib/mock/types";

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
