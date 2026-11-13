// Public proof for one escrow or one ledger record. The server reads the order's history from the chain
// first (lib/chain/history, cached), so the page holds it without JavaScript; components/proof/ProofView
// shows it and keeps it fresh in the browser. Never more than a few seconds of waiting: past that the
// view loads it itself, as it always did.
import type { Hex } from "viem";
import { ProofView } from "@/components/proof/ProofView";
import type { ChainHistory } from "@/lib/chain/client";
import { readAnyHistory } from "@/lib/chain/history";

export const dynamic = "force-dynamic";

const BYTES32 = /^0x[0-9a-fA-F]{64}$/;

async function firstRead(id: string): Promise<ChainHistory | null> {
  if (!BYTES32.test(id)) return null;
  const read = readAnyHistory(id.toLowerCase() as Hex)
    .then((h) => (h ? (JSON.parse(JSON.stringify(h)) as ChainHistory) : null))
    .catch(() => null);
  const late = new Promise<null>((res) => setTimeout(() => res(null), 6000));
  return Promise.race([read, late]);
}

export default async function ProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProofView initial={await firstRead(id)} />;
}
