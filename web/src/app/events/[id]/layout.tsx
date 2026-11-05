import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEventById } from "@/lib/mock/seed";
import { loadCatalogue } from "@/lib/supabase/catalogue";

/** The show as the page will find it: the same cached catalogue, or the sample seed without a database. */
async function findShow(id: string) {
  const data = await loadCatalogue();
  return data ? data.events.find((e) => e.id === id) : getEventById(id);
}

// The show's own name in the tab and in a shared link, from the same cached catalogue the page reads.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const event = await findShow(id);
  if (!event) return { title: "Show not found" };
  return {
    title: `${event.title} tickets`,
    description: `Resale tickets for ${event.title}, ${event.venue}, ${event.city}: escrow-backed, every ticket checked before it goes on sale.`,
  };
}

/**
 * A show the catalogue does not have gets the not-found page of events/not-found.tsx, which says why
 * (a wrong or old link, or a cancelled show, whose buyers are refunded), and a noindex, so a search
 * engine drops the link. Before, it was a one-line "Event not found" with no heading, indexable. A
 * cancelled show leaves the catalogue (lib/supabase/catalogue.ts); ended shows stay and keep their
 * page. The HTTP status stays 200: the root loading.tsx has already streamed the page's shell by
 * the time this runs, and Next answers a late notFound() with the noindex instead.
 */
export default async function EventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await findShow(id))) notFound();
  return children;
}
