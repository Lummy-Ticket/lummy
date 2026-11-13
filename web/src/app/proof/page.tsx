// The public list of orders in the escrow on Arbitrum One, read from the contract on the server so the page
// holds them without JavaScript (lib/chain/recent.ts, cached for a minute). The view is components/proof/ProofList.
import type { Metadata } from "next";
import { ProofList } from "@/components/proof/ProofList";
import { readRecent } from "@/lib/chain/recent";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Public proof: orders in escrow on Arbitrum One",
  description: "Every order paid into Lummy's escrow on Arbitrum One, read from the contract and not from our database.",
};

export default async function ProofListPage() {
  const initial = await readRecent().catch(() => null);
  return <ProofList initial={initial} />;
}
