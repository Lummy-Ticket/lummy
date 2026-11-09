import type { Metadata } from "next";

// The tab title for this page (its own words; the root layout adds "| Lummy"). A demo page for the
// hackathon's judges, not part of the product, so it stays out of search results.
export const metadata: Metadata = {
  title: "Lummy on NEAR",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
