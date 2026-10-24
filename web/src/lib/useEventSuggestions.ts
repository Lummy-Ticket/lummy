"use client";

import { useMemo } from "react";
import { matchesSearch, popularEvents, useCatalogue } from "@/lib/catalogue";

/**
 * What a search box offers as you type: trending events when empty, otherwise matches on
 * title, city, venue, category or a show's short name (lib/catalogue). Shared by the hero search
 * and the navbar search.
 */
export function useEventSuggestions(q: string, limit = 6) {
  const { events: all } = useCatalogue();
  const query = q.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!query) return popularEvents(all, 5);
    return all
      .filter((e) => matchesSearch(e, query))
      .slice(0, limit);
  }, [query, all, limit]);
  return { query, suggestions };
}
