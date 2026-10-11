// Riwayat satu escrow atau satu catatan buku besar (pesanan QRIS), disusun dari event kontrak. Publik:
// siapa pun boleh mengecek, dan isinya cuma data yang memang publik di chain.
import type { Hex } from "viem";
import { chainError, chainTarget } from "@/lib/chain/server";
import { readAnyHistory } from "@/lib/chain/history";
import { ledgerTarget } from "@/lib/chain/ledger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) return Response.json({ error: "id harus bytes32" }, { status: 400 });
  if (!chainTarget() && !ledgerTarget()) return Response.json({ error: "belum ada kontrak untuk chain ini" }, { status: 503 });
  // A page that knows which contract holds the id says so (?source=escrow|ledger), saving the other read.
  const asked = new URL(req.url).searchParams.get("source");
  const source = asked === "escrow" || asked === "ledger" ? asked : undefined;
  try {
    const history = await readAnyHistory(id.toLowerCase() as Hex, source);
    if (!history) return Response.json({ error: "tidak ditemukan di kontrak" }, { status: 404 });
    return Response.json(history);
  } catch (e) {
    return Response.json({ error: chainError(e) }, { status: 502 });
  }
}
