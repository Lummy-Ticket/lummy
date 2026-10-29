import type { Metadata } from "next";

// The tab title for this page (its own words; the root layout adds "| Lummy").
export const metadata: Metadata = {
  title: "Profile",
  // An account's own page, not for search results.
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
