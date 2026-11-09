/**
 * One real payment through NEAR Intents, end to end, with no app and no database: the proof behind
 * gate B in tasks/near-hackathon.md. USDC on Base goes through 1Click to a new order's receiver on
 * Arbitrum One, into LummyEscrow, and then back out as a refund to the refund address. Real money, small
 * amounts. It needs ~/.lummy/mainnet.env (docs/config/08-near.md) and the deployed contracts.
 *
 *   npx tsx scripts/near-pay.ts --quote           # asks for the quote and stops; spends nothing
 *   npx tsx scripts/near-pay.ts --pay             # pays 1 USDC and carries it all the way through
 *   npx tsx scripts/near-pay.ts --pay --keep      # leaves the money locked in the escrow
 *
 * Keys are read from the file and never printed. Prints every transaction.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createPublicClient, createWalletClient, erc20Abi, formatUnits, http, keccak256, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, base } from "viem/chains";
import { INTENTS } from "../src/lib/chain/deployments";
import { escrowAs, getListing, intentReceiverOf, intentsAs, pendingOf, publicClient, type IntentOrder } from "../src/lib/chain/escrow";
import { readSwapStatus, requestQuote, swapExplorerUrl } from "../src/lib/near/oneclick";

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const ARB_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as Address;
const BASE_USDC_ASSET = "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near";
const PRICE = BigInt(1_000_000);
const ARB_RPC = "https://arb1.arbitrum.io/rpc";

const env: Record<string, string> = {};
for (const line of readFileSync(`${homedir()}/.lummy/mainnet.env`, "utf8").split("\n")) {
  const eq = line.indexOf("=");
  if (eq > 0 && !line.startsWith("#")) env[line.slice(0, eq)] = line.slice(eq + 1).trim();
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const usdc = (n: bigint) => `${formatUnits(n, 6)} USDC`;

async function main() {
  const dep = INTENTS[arbitrum.id];
  if (!dep) throw new Error("The contracts are not deployed: no deployments/intents-42161.json copied in by npm run chain:abi");
  const operator = privateKeyToAccount(env.OPERATOR_PRIVATE_KEY as Hex);
  const buyer = privateKeyToAccount(env.BUYER_PRIVATE_KEY as Hex);
  const seller = env.SELLER_ADDRESS as Address;
  const arb = publicClient(arbitrum, ARB_RPC);
  const baseRead = createPublicClient({ chain: base, transport: http() });
  const baseWallet = createWalletClient({ account: buyer, chain: base, transport: http() });

  const tag = `near-pay-${Date.now()}`;
  const now = Math.floor(Date.now() / 1000);
  const order: IntentOrder = {
    listingId: keccak256(toHex(`lummy:listing:${tag}`)),
    seller,
    price: PRICE,
    eventEndsAt: now + 14 * 86_400,
    refundTo: buyer.address,
    refundAfter: now + 3 * 3600,
  };
  const receiver = await intentReceiverOf(arb, dep.factory, order);
  console.log(`order ${tag}: ${usdc(PRICE)}, refunds to ${buyer.address}`);
  console.log(`receiver: ${receiver} (no code yet: ${!(await arb.getCode({ address: receiver }))})`);

  const pay = process.argv.includes("--pay");
  const quote = await requestQuote({
    dry: !pay,
    originAsset: BASE_USDC_ASSET,
    chain: "base",
    amountOut: PRICE,
    recipient: receiver,
    refundTo: buyer.address,
    deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
  });
  console.log(`quote: send ${quote.amountInFormatted} USDC on Base, ${quote.amountOutFormatted} USDC arrives, about ${quote.timeEstimate}s`);
  if (!pay) return;

  const have = await baseRead.readContract({ address: BASE_USDC, abi: erc20Abi, functionName: "balanceOf", args: [buyer.address] });
  const need = BigInt(quote.amountIn);
  if (have < need) throw new Error(`The buyer holds ${usdc(have)} on Base and needs ${usdc(need)}`);
  if (!quote.depositAddress) throw new Error("1Click gave no address to pay");

  const sent = await baseWallet.writeContract({ address: BASE_USDC, abi: erc20Abi, functionName: "transfer", args: [quote.depositAddress as Address, need] });
  await baseRead.waitForTransactionReceipt({ hash: sent });
  console.log(`paid on Base: https://basescan.org/tx/${sent}`);
  console.log(`swap: ${swapExplorerUrl(quote.depositAddress)}`);

  const started = Date.now();
  for (;;) {
    const s = await readSwapStatus(quote.depositAddress).catch(() => null);
    const arrived = await arb.readContract({ address: ARB_USDC, abi: erc20Abi, functionName: "balanceOf", args: [receiver] });
    console.log(`  ${Math.round((Date.now() - started) / 1000)}s: ${s?.status ?? "no answer"}, ${usdc(arrived)} at the receiver`);
    if (arrived >= PRICE) break;
    if (s?.status === "REFUNDED" || s?.status === "FAILED") throw new Error(`The swap ended as ${s.status}`);
    if (Date.now() - started > 20 * 60_000) throw new Error("Nothing arrived in 20 minutes");
    await sleep(5_000);
  }
  console.log(`arrived in ${Math.round((Date.now() - started) / 1000)}s`);

  const as = escrowAs(arb, operator, arbitrum, ARB_RPC, dep.escrow);
  const rail = intentsAs(arb, operator, arbitrum, ARB_RPC, dep.factory);
  const create = await as.createListingFor(seller, order.listingId, PRICE, keccak256(toHex(`lummy:barcode:${tag}`)), order.eventEndsAt);
  console.log(`listing: https://arbiscan.io/tx/${create.hash}`);
  const fund = await rail.deployAndFund(order);
  console.log(`locked in the escrow: https://arbiscan.io/tx/${fund.hash}`);
  const locked = await getListing(arb, dep.escrow, order.listingId);
  console.log(`on chain: ${locked.status}, buyer ${locked.buyer}`);
  if (locked.status !== "Funded" || locked.buyer.toLowerCase() !== receiver.toLowerCase()) throw new Error("The escrow does not hold this order as expected");

  if (process.argv.includes("--keep")) {
    console.log(`left in the escrow: listing ${order.listingId}`);
    return;
  }

  const before = await arb.readContract({ address: ARB_USDC, abi: erc20Abi, functionName: "balanceOf", args: [buyer.address] });
  const refund = await as.refund(order.listingId);
  console.log(`refunded in the escrow: https://arbiscan.io/tx/${refund.hash}`);
  console.log(`owed to the receiver: ${usdc(await pendingOf(arb, dep.escrow, receiver))}`);
  const sweep = await rail.sweep(receiver);
  console.log(`sent to the refund address: https://arbiscan.io/tx/${sweep.hash}`);
  const after = await arb.readContract({ address: ARB_USDC, abi: erc20Abi, functionName: "balanceOf", args: [buyer.address] });
  console.log(`the refund address gained ${usdc(after - before)}`);
  if (after - before < PRICE) throw new Error("The refund did not arrive in full");
  console.log("done: from Base, through NEAR Intents, into the escrow on Arbitrum One, and back to the refund address");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
