// A live quote from NEAR Intents: what it takes, on the chain and asset chosen, for exactly this much
// USDC to arrive on Arbitrum. Public, and it holds nothing: a dry quote gives no address to pay. The
// limit is per server instance, a soft brake and not a wall: a quote costs nobody anything.
import { NextResponse } from "next/server";
import { INTENTS } from "@/lib/chain/deployments";
import { ARBITRUM_ONE } from "@/lib/chain/server";
import { DRY_RECIPIENT, OneClickError, payOptions, requestQuote } from "@/lib/near/oneclick";
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
  if (!allowed(req, "quote", 30, 60_000)) return fail(429, "terlalu banyak permintaan; coba lagi sebentar lagi");
  const body = (await req.json().catch(() => null)) as { originAsset?: unknown; amount?: unknown } | null;
  const originAsset = typeof body?.originAsset === "string" ? body.originAsset : "";
  const amount = typeof body?.amount === "string" && /^\d{1,12}$/.test(body.amount) ? BigInt(body.amount) : BigInt(0);
  if (amount <= BigInt(0) || amount > MAX_AMOUNT) return fail(400, "jumlah tidak valid");
  try {
    const option = (await payOptions()).find((o) => o.assetId === originAsset);
    if (!option) return fail(400, "aset ini tidak ditawarkan");
    const quote = await requestQuote({
      dry: true,
      originAsset,
      chain: option.chain,
      amountOut: amount,
      recipient: INTENTS[ARBITRUM_ONE]?.escrow ?? DRY_RECIPIENT,
      deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
    });
    return NextResponse.json(
      {
        symbol: option.symbol,
        chainLabel: option.chainLabel,
        amountIn: quote.amountInFormatted,
        amountInUsd: quote.amountInUsd ?? null,
        amountOut: quote.amountOutFormatted,
        etaSeconds: quote.timeEstimate ?? null,
      },
      { headers: noStore }
    );
  } catch (e) {
    return fail(e instanceof OneClickError && e.status < 500 ? 400 : 502, e instanceof OneClickError ? `1Click: ${e.message}` : "quote gagal dibaca");
  }
}
