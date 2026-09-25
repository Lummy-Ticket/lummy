"use client";

import { useMemo } from "react";
import { useCatalogue } from "@/lib/catalogue";

/**
 * What a search box offers as you type: trending events when empty, otherwise matches on
 * title, city or venue. Shared by the hero search and the navbar search.
 */
export function useEventSuggestions(q: string, limit = 6) {
  const { events: all } = useCatalogue();
  const query = q.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!query) return all.filter((e) => e.featured).slice(0, 5);
    return all
      .filter((e) => e.title.toLowerCase().includes(query) || e.city.toLowerCase().includes(query) || e.venue.toLowerCase().includes(query))
      .slice(0, limit);
  }, [query, all, limit]);
  return { query, suggestions };
}
