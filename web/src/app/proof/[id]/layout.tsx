import type { Metadata } from "next";

// A proof page is for checking one escrow, not for search results.
export const metadata: Metadata = {
  title: "Escrow proof",
  description: "Every step of one Lummy escrow, read straight from the contract on Arbitrum.",
  robots: { index: false, follow: false },
};

export default function ProofLayout({ children }: { children: React.ReactNode }) {
  return children;
}
