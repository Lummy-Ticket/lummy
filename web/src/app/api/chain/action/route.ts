// Aksi penyelesaian on-chain lewat operator: sengketa atas nama pembeli, putusan, rilis, refund.
// Aturan waktu dan hak akses tetap dijaga kontrak; route ini cuma meneruskan.
import type { Hex } from "viem";
import { chainError, operatorSetup, settle, writeAllowed, type SettleAction } from "@/lib/chain/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const ACTIONS: SettleAction[] = ["dispute", "resolve", "release", "refund"];

export async function POST(req: Request) {
  const op = operatorSetup();
  if (!op) return Response.json({ error: "mode chain mati: kunci operator belum diset" }, { status: 503 });
  if (!writeAllowed(req, op)) return Response.json({ error: "demo key salah atau belum diisi" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { listingId?: unknown; action?: unknown; toBuyer?: unknown } | null;
  const listingId = String(body?.listingId ?? "");
  const action = body?.action as SettleAction;
  if (!/^0x[0-9a-fA-F]{64}$/.test(listingId)) return Response.json({ error: "listingId harus bytes32" }, { status: 400 });
  if (!ACTIONS.includes(action)) return Response.json({ error: `action harus salah satu dari ${ACTIONS.join(", ")}` }, { status: 400 });
  const toBuyerRaw = String(body?.toBuyer ?? "0");
  if (!/^\d{1,30}$/.test(toBuyerRaw)) return Response.json({ error: "toBuyer harus bilangan bulat unit USDC" }, { status: 400 });

  try {
    return Response.json(await settle(op, listingId as Hex, action, BigInt(toBuyerRaw)));
  } catch (e) {
    return Response.json({ error: chainError(e) }, { status: 502 });
  }
}
