// Status satu listing, dibaca langsung dari kontrak. Publik: siapa pun boleh mengecek.
import type { Hex } from "viem";
import { chainError, chainTarget, readListing } from "@/lib/chain/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) return Response.json({ error: "id listing harus bytes32" }, { status: 400 });
  const target = chainTarget();
  if (!target) return Response.json({ error: "belum ada kontrak untuk chain ini" }, { status: 503 });
  try {
    return Response.json(await readListing(target, id as Hex));
  } catch (e) {
    return Response.json({ error: chainError(e) }, { status: 502 });
  }
}
