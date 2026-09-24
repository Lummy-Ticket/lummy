// Info mode chain untuk browser: kontrak mana yang dibaca, dan apakah checkout bisa on-chain.
import { formatUnits } from "viem";
import { USDC_DECIMALS } from "@/lib/chain/config";
import { chainTarget, operatorSetup, readWindow, writeMode } from "@/lib/chain/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const target = chainTarget();
  if (!target) return Response.json({ readable: false, writeMode: "off" });
  const op = operatorSetup();
  const disputeWindow = await readWindow(target).catch(() => null);
  return Response.json({
    readable: true,
    writeMode: writeMode(op),
    chainId: target.chain.id,
    escrow: target.escrow,
    token: target.token,
    disputeWindow,
    priceUsdc: op ? formatUnits(op.price, USDC_DECIMALS) : null,
  });
}
