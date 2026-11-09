// Status satu listing, dibaca langsung dari kontrak. Publik: siapa pun boleh mengecek.
import type { Hex } from "viem";
import { ARBITRUM_ONE, chainError, chainTarget, readListing, targetFor } from "@/lib/chain/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) return Response.json({ error: "id listing harus bytes32" }, { status: 400 });
  const target = chainTarget();
  if (!target) return Response.json({ error: "belum ada kontrak untuk chain ini" }, { status: 503 });
  try {
    const live = await readListing(target, id as Hex);
    // Not on the app's chain: an order paid through NEAR Intents lives on Arbitrum One.
    const mainnet = live.status === "None" ? targetFor(ARBITRUM_ONE) : null;
    const there = mainnet ? await readListing(mainnet, id as Hex).catch(() => null) : null;
    return Response.json(there && there.status !== "None" ? there : live);
  } catch (e) {
    return Response.json({ error: chainError(e) }, { status: 502 });
  }
}
