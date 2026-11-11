// What a wallet holds that could pay this much through NEAR Intents, on the EVM chains the checkout
// offers. Public, like the quote: balances are public on every chain, and this holds nothing. The
// address is not stored or logged. The limit is per server instance, a soft brake and not a wall.
import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { INTENTS } from "@/lib/chain/deployments";
import { ARBITRUM_ONE } from "@/lib/chain/server";
import { readHeld } from "@/lib/near/balances";
import { DRY_RECIPIENT } from "@/lib/near/oneclick";
import { errorBody } from "@/lib/route-errors";
import { allowed } from "@/lib/near/throttle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 35;

const noStore = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json(errorBody(error), { status, headers: noStore });
/** Up to 1,000 USDC, in micro-USDC. */
const MAX_AMOUNT = BigInt(1_000_000_000);

export async function POST(req: Request) {
  if (!allowed(req, "held", 12, 60_000)) return fail(429, "terlalu banyak permintaan; coba lagi sebentar lagi");
  const body = (await req.json().catch(() => null)) as { address?: unknown; amount?: unknown } | null;
  const address = typeof body?.address === "string" ? body.address : "";
  const amount = typeof body?.amount === "string" && /^\d{1,12}$/.test(body.amount) ? BigInt(body.amount) : BigInt(0);
  if (!isAddress(address)) return fail(400, "alamat wallet tidak valid");
  if (amount <= BigInt(0) || amount > MAX_AMOUNT) return fail(400, "jumlah tidak valid");
  try {
    const held = await readHeld(address, amount, INTENTS[ARBITRUM_ONE]?.escrow ?? DRY_RECIPIENT);
    return NextResponse.json({ held }, { headers: noStore });
  } catch {
    return fail(502, "saldo wallet gagal dibaca");
  }
}
