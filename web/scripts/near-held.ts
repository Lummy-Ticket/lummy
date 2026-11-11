// What one wallet holds that could pay a ticket through NEAR Intents: the read behind "Connect a
// wallet to see what can pay" (lib/near/balances.ts), run by hand. Public RPCs and dry quotes only:
// nothing is held, sent or stored.
//
//   npm run near:held -- 0xYourAddress [price in USDC, default 9.50]
import { isAddress, parseUnits } from "viem";
import { readHeld } from "../src/lib/near/balances";
import { pickHeld, shortAmount } from "../src/lib/near/held";
import { DRY_RECIPIENT, payOptions } from "../src/lib/near/oneclick";

async function main() {
  const [address, price = "9.50"] = process.argv.slice(2);
  if (!address || !isAddress(address)) throw new Error("usage: npm run near:held -- 0xYourAddress [price in USDC]");
  const options = (await payOptions()).filter((o) => o.chainId !== null);
  const began = Date.now();
  const held = await readHeld(address, parseUnits(price, 6), DRY_RECIPIENT, options);
  for (const o of options) {
    const h = held.find((x) => x.assetId === o.assetId);
    const state = !h || h.balance === null ? "not read" : h.balance === "0" ? "none" : h.enough && h.gas ? "ENOUGH" : !h.enough ? (h.needs ? `needs ${shortAmount(h.needs)}` : "no quote") : "no gas on this chain";
    console.log(`${`${o.symbol} on ${o.chainLabel}`.padEnd(18)} ${(h?.balance ? shortAmount(h.balance) : "-").padStart(14)}  ${state}`);
  }
  const pick = pickHeld(options, held);
  const picked = options.find((o) => o.assetId === pick);
  console.log(`\noffered first for ${price} USDC: ${picked ? `${picked.symbol} on ${picked.chainLabel}` : "nothing in this wallet"}  (${((Date.now() - began) / 1000).toFixed(1)} s)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
