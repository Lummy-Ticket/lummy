// The orders paid into the escrow on Arbitrum One, newest first, read from the contract. Public: it
// holds only what anyone can already read on the chain. The list at /proof shows it.
import { readRecent } from "@/lib/chain/recent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const recent = await readRecent();
    if (!recent) return Response.json({ error: "belum ada escrow di Arbitrum One untuk deploy ini", error_en: "This deploy knows no escrow on Arbitrum One." }, { status: 503 });
    return Response.json(recent, { headers: { "cache-control": "public, max-age=30" } });
  } catch {
    return Response.json({ error: "chain belum bisa dibaca, coba lagi sebentar", error_en: "The chain could not be read just now. Try again in a moment." }, { status: 502 });
  }
}
