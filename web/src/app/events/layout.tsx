import type { Metadata } from "next";

// Same reason as the home page: which shows are on sale depends on today's date.
export const dynamic = "force-dynamic";

// A show's own page sets its own title (events/[id]/layout.tsx).
export const metadata: Metadata = { title: "Browse shows" };

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
