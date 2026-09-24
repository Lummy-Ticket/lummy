// Checkout on-chain (Model A): operator membuat listing, mengunci dana pembeli simulasi, dan mencatat
// serah terima. Butuh kunci operator di server dan, kalau diset, header x-demo-key.
import { chainError, openOrder, operatorSetup, writeAllowed } from "@/lib/chain/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_UINT40 = 2 ** 40 - 1;

export async function POST(req: Request) {
  const op = operatorSetup();
  if (!op) return Response.json({ error: "mode chain mati: kunci operator belum diset" }, { status: 503 });
  if (!writeAllowed(req, op)) return Response.json({ error: "demo key salah atau belum diisi" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { eventEndsAt?: unknown } | null;
  const eventEndsAt = Number(body?.eventEndsAt);
  if (!Number.isInteger(eventEndsAt) || eventEndsAt <= 0 || eventEndsAt > MAX_UINT40) {
    return Response.json({ error: "eventEndsAt harus detik unix" }, { status: 400 });
  }
  try {
    return Response.json(await openOrder(op, eventEndsAt));
  } catch (e) {
    return Response.json({ error: chainError(e) }, { status: 502 });
  }
}
