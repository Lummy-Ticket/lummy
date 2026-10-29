import type { Metadata } from "next";
import { getEventById } from "@/lib/mock/seed";
import { loadCatalogue } from "@/lib/supabase/catalogue";

// The show's own name in the tab and in a shared link, from the same cached catalogue the page reads.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await loadCatalogue();
  const event = data ? data.events.find((e) => e.id === id) : getEventById(id);
  if (!event) return { title: "Show not found" };
  return {
    title: `${event.title} tickets`,
    description: `Resale tickets for ${event.title}, ${event.venue}, ${event.city}: escrow-backed, every ticket checked before it goes on sale.`,
  };
}

export default function EventLayout({ children }: { children: React.ReactNode }) {
  return children;
}
