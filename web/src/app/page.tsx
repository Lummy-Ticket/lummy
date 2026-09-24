import HomePage from "@/components/home/HomePage";

// The catalogue depends on today's date (one show is always tomorrow, past shows drop
// out), so the page renders per request instead of once at build time. Otherwise the
// build-day HTML and the visitor's browser would disagree.
export const dynamic = "force-dynamic";

export default function Page() {
  return <HomePage />;
}
