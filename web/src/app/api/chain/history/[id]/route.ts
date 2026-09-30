// Riwayat satu escrow, disusun dari event kontrak. Publik: siapa pun boleh mengecek, dan isinya cuma
// data yang memang publik di chain.
import type { Hex } from "viem";
import { chainError, chainTarget } from "@/lib/chain/server";
import { readHistoryCached } from "@/lib/chain/history";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) return Response.json({ error: "id listing harus bytes32" }, { status: 400 });
  const target = chainTarget();
  if (!target) return Response.json({ error: "belum ada kontrak untuk chain ini" }, { status: 503 });
  try {
    const history = await readHistoryCached(target, id as Hex);
    if (history.live.status === "None" && history.events.length === 0) {
      return Response.json({ error: "escrow tidak ditemukan di kontrak" }, { status: 404 });
    }
    return Response.json(history);
  } catch (e) {
    return Response.json({ error: chainError(e) }, { status: 502 });
  }
}
