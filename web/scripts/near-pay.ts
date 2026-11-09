/**
 * One real payment through NEAR Intents, end to end, with no app and no database: the proof behind
 * gate B in tasks/near-hackathon.md. Money from another chain goes through 1Click to a new order's
 * receiver on Arbitrum One, into LummyEscrow, and back out as a refund to the refund address. Real money,
 * small amounts, and it all comes back but the fees. Needs ~/.lummy/mainnet.env (docs/config/08-near.md)
 * and the deployed contracts.
 *
 *   npx tsx scripts/near-pay.ts                                   # the quote only; spends nothing
 *   npx tsx scripts/near-pay.ts --from-my-wallet --refund-to 0x...
 *       prints an address and an amount: send it from any wallet you hold, and the refund comes back
 *       to --refund-to on Arbitrum One. Nothing needs to be in the buyer key.
 *   npx tsx scripts/near-pay.ts --pay                              # sends from the buyer key instead
 *
 *   --asset base:USDC   what to pay with, as chain:symbol (base:USDC, sol:USDC, sol:SOL, arb:ETH, base:ETH, ...)
 *   --usdc 1            how much arrives at the escrow
 *   --origin-refund X   on a chain that is not EVM, your address there, for a deposit 1Click cannot swap
 *   --keep              leaves the money locked in the escrow instead of refunding it
 *
 * Keys are read from the file and never printed. Prints every transaction.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createPublicClient, createWalletClient, erc20Abi, formatUnits, getAddress, http, isAddress, keccak256, parseUnits, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, base } from "viem/chains";
import { INTENTS } from "../src/lib/chain/deployments";
import { escrowAs, getListing, intentReceiverOf, intentsAs, pendingOf, publicClient, type IntentOrder } from "../src/lib/chain/escrow";
import { payOptions, readSwapStatus, requestQuote, swapExplorerUrl } from "../src/lib/near/oneclick";

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const ARB_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as Address;
const ARB_RPC = "https://arb1.arbitrum.io/rpc";

const env: Record<string, string> = {};
for (const line of readFileSync(`${homedir()}/.lummy/mainnet.env`, "utf8").split("\n")) {
  const eq = line.indexOf("=");
  if (eq > 0 && !line.startsWith("#")) env[line.slice(0, eq)] = line.slice(eq + 1).trim();
}
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const usdc = (n: bigint) => `${formatUnits(n, 6)} USDC`;

async function main() {
  const dep = INTENTS[arbitrum.id];
  if (!dep) throw new Error("The contracts are not deployed: no deployments/intents-42161.json copied in by npm run chain:abi");
  const operator = privateKeyToAccount(env.OPERATOR_PRIVATE_KEY as Hex);
  const buyer = privateKeyToAccount(env.BUYER_PRIVATE_KEY as Hex);
  const seller = env.SELLER_ADDRESS as Address;
  const arb = publicClient(arbitrum, ARB_RPC);

  const manual = flag("from-my-wallet");
  const fromKey = flag("pay");
  const want = (arg("asset") ?? "base:USDC").toLowerCase();
  const option = (await payOptions()).find((o) => `${o.chain}:${o.symbol}`.toLowerCase() === want);
  if (!option) throw new Error(`No asset ${want}. Try base:USDC, sol:USDC, sol:SOL, arb:ETH or base:ETH`);
  if (fromKey && want !== "base:usdc") throw new Error("--pay sends USDC on Base from the buyer key only");
  const price = parseUnits(arg("usdc") ?? "1", 6);

  const refundArg = arg("refund-to");
  if (manual && !refundArg) throw new Error("--from-my-wallet needs --refund-to with your own EVM address, where the money comes back");
  if (refundArg && !isAddress(refundArg)) throw new Error("--refund-to must be an EVM address");
  const refundTo = refundArg ? getAddress(refundArg) : buyer.address;
  const originRefund = arg("origin-refund") ?? (option.evm ? refundTo : undefined);
  if (!originRefund && (manual || fromKey)) throw new Error(`Paying from ${option.chainLabel} needs --origin-refund with your address there`);

  const tag = `near-pay-${Date.now()}`;
  const now = Math.floor(Date.now() / 1000);
  const order: IntentOrder = {
    listingId: keccak256(toHex(`lummy:listing:${tag}`)),
    seller,
    price,
    eventEndsAt: now + 14 * 86_400,
    refundTo,
    refundAfter: now + 3 * 3600,
  };
  const receiver = await intentReceiverOf(arb, dep.factory, order);
  console.log(`order ${tag}: ${usdc(price)} into the escrow, refunds to ${refundTo}`);
  console.log(`receiver: ${receiver} (no code yet: ${!(await arb.getCode({ address: receiver }))})`);

  const pay = manual || fromKey;
  const quote = await requestQuote({
    dry: !pay,
    originAsset: option.assetId,
    chain: option.chain,
    amountOut: price,
    recipient: receiver,
    ...(originRefund ? { refundTo: originRefund } : {}),
    deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
  });
  console.log(`quote: send ${quote.amountInFormatted} ${option.symbol} on ${option.chainLabel}, ${quote.amountOutFormatted} USDC arrives, about ${quote.timeEstimate}s`);
  if (!pay) return;
  if (!quote.depositAddress) throw new Error("1Click gave no address to pay");

  if (manual) {
    console.log("\nSend, from any wallet you hold:");
    console.log(`  ${quote.amountInFormatted} ${option.symbol} on ${option.chainLabel}`);
    console.log(`  to ${quote.depositAddress}${quote.depositMemo ? ` with memo ${quote.depositMemo}` : ""}`);
    console.log("  within 30 minutes. A deposit that is short, late or too large comes back to you.\n");
  } else {
    const baseRead = createPublicClient({ chain: base, transport: http() });
    const baseWallet = createWalletClient({ account: buyer, chain: base, transport: http() });
    const have = await baseRead.readContract({ address: BASE_USDC, abi: erc20Abi, functionName: "balanceOf", args: [buyer.address] });
    const need = BigInt(quote.amountIn);
    if (have < need) throw new Error(`The buyer key holds ${usdc(have)} on Base and needs ${usdc(need)}`);
    const sent = await baseWallet.writeContract({ address: BASE_USDC, abi: erc20Abi, functionName: "transfer", args: [quote.depositAddress as Address, need] });
    await baseRead.waitForTransactionReceipt({ hash: sent });
    console.log(`paid on Base: https://basescan.org/tx/${sent}`);
  }
  console.log(`swap: ${swapExplorerUrl(quote.depositAddress)}`);

  const started = Date.now();
  for (;;) {
    const s = await readSwapStatus(quote.depositAddress, quote.depositMemo).catch(() => null);
    const arrived = await arb.readContract({ address: ARB_USDC, abi: erc20Abi, functionName: "balanceOf", args: [receiver] });
    console.log(`  ${Math.round((Date.now() - started) / 1000)}s: ${s?.status ?? "no answer"}, ${usdc(arrived)} at the receiver`);
    if (arrived >= price) break;
    if (s?.status === "REFUNDED" || s?.status === "FAILED") throw new Error(`The swap ended as ${s.status}`);
    if (Date.now() - started > 30 * 60_000) throw new Error("Nothing arrived in 30 minutes");
    await sleep(10_000);
  }
  console.log(`arrived in ${Math.round((Date.now() - started) / 1000)}s`);

  const as = escrowAs(arb, operator, arbitrum, ARB_RPC, dep.escrow);
  const rail = intentsAs(arb, operator, arbitrum, ARB_RPC, dep.factory);
  const create = await as.createListingFor(seller, order.listingId, price, keccak256(toHex(`lummy:barcode:${tag}`)), order.eventEndsAt);
  console.log(`listing: https://arbiscan.io/tx/${create.hash}`);
  const fund = await rail.deployAndFund(order);
  console.log(`locked in the escrow: https://arbiscan.io/tx/${fund.hash}`);
  const locked = await getListing(arb, dep.escrow, order.listingId);
  console.log(`on chain: ${locked.status}, buyer ${locked.buyer}`);
  if (locked.status !== "Funded" || locked.buyer.toLowerCase() !== receiver.toLowerCase()) throw new Error("The escrow does not hold this order as expected");

  if (flag("keep")) {
    console.log(`left in the escrow: listing ${order.listingId}`);
    return;
  }

  const before = await arb.readContract({ address: ARB_USDC, abi: erc20Abi, functionName: "balanceOf", args: [refundTo] });
  const refund = await as.refund(order.listingId);
  console.log(`refunded in the escrow: https://arbiscan.io/tx/${refund.hash}`);
  console.log(`owed to the receiver: ${usdc(await pendingOf(arb, dep.escrow, receiver))}`);
  const sweep = await rail.sweep(receiver);
  console.log(`sent to the refund address: https://arbiscan.io/tx/${sweep.hash}`);
  const after = await arb.readContract({ address: ARB_USDC, abi: erc20Abi, functionName: "balanceOf", args: [refundTo] });
  console.log(`the refund address gained ${usdc(after - before)} on Arbitrum One`);
  if (after - before < price) throw new Error("The refund did not arrive in full");
  console.log(`done: from ${option.chainLabel}, through NEAR Intents, into the escrow on Arbitrum One, and back to the refund address`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
