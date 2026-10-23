// Typed data as JSON carries it (bigints as decimal strings), back to what viem signs and checks.
// Shared by the checkout page, which hands it to the buyer's wallet, and by scripts/usdc-check.ts.
import type { Address, TypedDataDomain } from "viem";
import type { TypedMessage } from "@/lib/payments/types";

export function reviveTyped(t: TypedMessage) {
  const fields = t.types[t.primaryType] ?? [];
  const message: Record<string, unknown> = { ...t.message };
  for (const f of fields) if (/^u?int\d*$/.test(f.type)) message[f.name] = BigInt(t.message[f.name]);
  const domain: TypedDataDomain = {
    name: t.domain.name,
    version: t.domain.version,
    chainId: Number(t.domain.chainId),
    verifyingContract: t.domain.verifyingContract as Address,
  };
  return { domain, types: t.types, primaryType: t.primaryType, message };
}
