import type { Metadata } from "next";

// The tab title for this page (its own words; the root layout adds "| Lummy"). A demo page for the
// hackathon's judges, not part of the product, so it stays out of search results.
const description =
  "Built at NEAR HACKATHON: pay for a resale ticket from any chain through NEAR Intents, into an escrow that holds the money until the show is over, and a ticket check in NEAR AI's TEE with a receipt anyone can verify.";
const image = { url: "/assets/og/near.png", width: 1200, height: 630, alt: "Lummy on NEAR: pay from any chain, and a ticket check you can verify" };

export const metadata: Metadata = {
  title: "Lummy on NEAR",
  description,
  robots: { index: false, follow: false },
  // Its own link preview: the site's default one is in Indonesian and says nothing of NEAR.
  openGraph: { title: "Lummy on NEAR", description, url: "/near", siteName: "Lummy", type: "website", images: [image] },
  twitter: { card: "summary_large_image", title: "Lummy on NEAR", description, images: [image] },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
