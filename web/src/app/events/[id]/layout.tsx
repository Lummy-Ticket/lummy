import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CancelledShow } from "@/components/events/CancelledShow";
import { getEventById } from "@/lib/mock/seed";
import { loadCancelledShow, loadCatalogue } from "@/lib/supabase/catalogue";

/** The show as the page will find it: the same cached catalogue, or the sample seed without a database. */
async function findShow(id: string) {
  const data = await loadCatalogue();
  return data ? data.events.find((e) => e.id === id) : getEventById(id);
}

// The show's own name in the tab and in a shared link, from the same cached catalogue the page reads.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const event = await findShow(id);
  if (event) {
    return {
      title: `${event.title} tickets`,
      description: `Resale tickets for ${event.title}, ${event.venue}, ${event.city}: escrow-backed, every ticket checked before it goes on sale.`,
    };
  }
  const cancelled = await loadCancelledShow(id);
  if (cancelled) return { title: `${cancelled.title}: cancelled`, robots: { index: false, follow: false } };
  return { title: "Show not found" };
}

/**
 * A show the catalogue does not have gets one of two pages, both with a noindex so a search engine
 * drops the link. A show staff cancelled says so, with when and that its buyers are refunded
 * (components/events/CancelledShow.tsx; UX review 5 Nov 2026, decision 5): it is read on its own,
 * only for an id the catalogue lacks, and never goes back on sale. Any other id gets the not-found
 * page of events/not-found.tsx (a wrong or old link). Ended shows stay in the catalogue and keep
 * their page. The HTTP status stays 200: the root loading.tsx has already streamed the page's shell
 * by the time this runs, and Next answers a late notFound() with the noindex instead.
 */
export default async function EventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (await findShow(id)) return children;
  const cancelled = await loadCancelledShow(id);
  if (cancelled) return <CancelledShow show={cancelled} />;
  notFound();
}
