// Asks Lummy's receipt registry on NEAR about one receipt: which address the contract itself recovers
// from the signature, and whether the receipt is recorded there (lib/near/registry.ts). Public and
// read-only: a view call through NEAR's public RPC, no key, nothing stored.
import { NextResponse } from "next/server";
import { askRegistry } from "@/lib/near/registry";
import { allowed } from "@/lib/near/throttle";
import { errorBody } from "@/lib/route-errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const noStore = { "cache-control": "no-store" };
const fail = (status: number, error: string) => NextResponse.json(errorBody(error), { status, headers: noStore });
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { signedText?: unknown; signature?: unknown; signer?: unknown } | null;
  if (!body || !text(body.signedText, 400) || !text(body.signature, 140) || !text(body.signer, 42)) return fail(400, "bukti tidak lengkap");
  if (!allowed(req, "registry", 60, 60_000)) return fail(429, "terlalu banyak permintaan; coba lagi sebentar lagi");
  try {
    return NextResponse.json(await askRegistry(body.signedText, body.signature, body.signer), { headers: noStore });
  } catch {
    return fail(502, "kontrak di NEAR belum bisa dibaca");
  }
}
