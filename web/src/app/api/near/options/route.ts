// What the NEAR HACKATHON demo can do here, for /near and the checkout: the assets 1Click takes, the
// contracts on Arbitrum One, and whether this visitor may pay for real. Public: nothing in it is secret.
import { NextResponse } from "next/server";
import { INTENTS } from "@/lib/chain/deployments";
import { ARBITRUM_ONE, intentsOperator } from "@/lib/chain/server";
import { payOptions } from "@/lib/near/oneclick";
import { nearTeam } from "@/lib/near/team";
import { currentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const op = intentsOperator();
  const [assets, user] = await Promise.all([payOptions().catch(() => []), currentUser().catch(() => null)]);
  return NextResponse.json(
    {
      assets,
      rail: !!op,
      team: !!op && nearTeam(user),
      ticketAi: !!process.env.NEAR_AI_API_KEY,
      chainId: ARBITRUM_ONE,
      escrow: op?.escrow ?? INTENTS[ARBITRUM_ONE]?.escrow ?? null,
      factory: op?.factory ?? INTENTS[ARBITRUM_ONE]?.factory ?? null,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
