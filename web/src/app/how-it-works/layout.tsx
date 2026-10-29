import type { Metadata } from "next";

// The tab title for this page (its own words; the root layout adds "| Lummy").
export const metadata: Metadata = {
  title: "How it works",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
