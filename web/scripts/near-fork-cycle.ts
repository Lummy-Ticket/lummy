/**
 * The NEAR Intents rail's chain side, through the app's own code (lib/chain/server.ts), on a fork of
 * Arbitrum One with Circle's real USDC. Run by scripts/near-fork.sh, which starts the fork, deploys, and
 * passes everything in the environment. 1Click cannot deliver on a fork, so its delivery is stood in for
 * by minting USDC to the receiver's address: on chain that is all a delivery is.
 *
 *   A. Paid with a little extra: locked in the escrow, the extra back at once, released to the seller
 *      after the show and the window.
 *   B. A claim upheld in full: the refund goes through the receiver to the refund address.
 *   C. Money with no order: back to the refund address once the order's deadline has passed.
 *   D. Opening an order again after it went through changes nothing, as a retry after a cut-off run must.
 */
import { erc20Abi, keccak256, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum } from "viem/chains";
import { getListing, intentReceiverOf, publicClient, type IntentOrder } from "../src/lib/chain/escrow";
import { openIntentOrder, settle, sweepIntentReceiver, type Operator } from "../src/lib/chain/server";

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set: run scripts/near-fork.sh`);
  return v;
};
const RPC = need("FORK_RPC");
const USDC = need("FORK_USDC") as Address;
const ESCROW = need("FORK_ESCROW") as Address;
const FACTORY = need("FORK_FACTORY") as Address;
const MINTER_KEY = need("FORK_MINTER_KEY") as Hex;
const operator = privateKeyToAccount(need("FORK_OPERATOR_KEY") as Hex);
const SELLER = need("FORK_SELLER") as Address;
const REFUND_TO = need("FORK_REFUND_TO") as Address;
const WINDOW = 48 * 3600;
const PRICE = BigInt(9_500_000);

const pc = publicClient(arbitrum, RPC);
const op: Operator = { chain: arbitrum, rpcUrl: RPC, escrow: ESCROW, token: USDC, operator, buyer: operator, seller: SELLER, price: BigInt(0), factory: FACTORY };

const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note: ok ? undefined : note });

const balance = (who: Address) => pc.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [who] });
const rpc = (method: string, params: unknown[]) =>
  fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then((r) => r.json());
const now = async () => Number((await pc.getBlock()).timestamp);
const warpTo = async (t: number) => {
  await rpc("evm_setNextBlockTimestamp", [t]);
  await rpc("evm_mine", []);
};

/** What 1Click's delivery amounts to on chain: USDC arriving at an address. */
async function deliver(to: Address, amount: bigint) {
  const { createWalletClient, http } = await import("viem");
  const minter = createWalletClient({ account: privateKeyToAccount(MINTER_KEY), chain: arbitrum, transport: http(RPC) });
  const hash = await minter.writeContract({
    address: USDC,
    abi: [{ type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }] as const,
    functionName: "mint",
    args: [to, amount],
  });
  await pc.waitForTransactionReceipt({ hash });
}

async function newOrder(tag: string, refundAfterIn = 3600): Promise<IntentOrder> {
  const t = await now();
  return { listingId: keccak256(toHex(`lummy:listing:${tag}`)), seller: SELLER, price: PRICE, eventEndsAt: t + 7 * 86_400, refundTo: REFUND_TO, refundAfter: t + refundAfterIn };
}

async function main() {
  // --- A. Paid with a little extra, released to the seller
  const a = await newOrder("fork-a");
  const ra = await intentReceiverOf(pc, FACTORY, a);
  check("A: the receiver's address is known before it exists", !(await pc.getCode({ address: ra })));
  const extra = BigInt(370_000);
  const refundBefore = await balance(REFUND_TO);
  await deliver(ra, PRICE + extra);
  const opened = await openIntentOrder(op, a, "fork-a", null, {});
  const la = await getListing(pc, ESCROW, a.listingId);
  check("A: listing, funding and handover all went through", !!opened.txs.create && !!opened.txs.fund && !!opened.txs.handover, JSON.stringify(opened.txs));
  check("A: the escrow holds it, in its window, with the receiver as the buyer", la.status === "DisputeWindow" && la.buyer.toLowerCase() === ra.toLowerCase() && la.price === PRICE, `${la.status} ${la.buyer}`);
  check("A: the extra went back to the refund address at once", (await balance(REFUND_TO)) - refundBefore === extra);
  check("A: nothing is left at the receiver", (await balance(ra)) === BigInt(0));

  const again = await openIntentOrder(op, a, "fork-a", null, opened.txs);
  check("D: opening it again sends nothing new", JSON.stringify(again.txs) === JSON.stringify(opened.txs), JSON.stringify(again.txs));

  await warpTo(a.eventEndsAt + WINDOW + 60);
  const sellerBefore = await balance(SELLER);
  const released = await settle(op, a.listingId, "release");
  check("A: after the show and the window, released and paid to the seller", (await balance(SELLER)) - sellerBefore === PRICE && released.withdrawals.length === 1, JSON.stringify(released));

  // --- B. A claim upheld in full: the refund reaches the refund address through the receiver
  const b = await newOrder("fork-b");
  const rb = await intentReceiverOf(pc, FACTORY, b);
  await deliver(rb, PRICE);
  await openIntentOrder(op, b, "fork-b", null, {});
  await settle(op, b.listingId, "dispute");
  const before = await balance(REFUND_TO);
  const ruled = await settle(op, b.listingId, "resolve", PRICE);
  const lb = await getListing(pc, ESCROW, b.listingId);
  check("B: the claim upheld in full refunds the order", lb.status === "Refunded", lb.status);
  check("B: the refund reached the refund address, swept through the receiver", (await balance(REFUND_TO)) - before === PRICE, JSON.stringify(ruled));
  check("B: nothing left in the escrow for this order, or at the receiver", (await balance(rb)) === BigInt(0));

  // --- C. Money with no order: back to the refund address after the deadline
  const c = await newOrder("fork-c", 600);
  const rc = await intentReceiverOf(pc, FACTORY, c);
  await deliver(rc, PRICE);
  let early = false;
  try {
    await sweepIntentReceiver(op, c, rc);
  } catch {
    early = true;
  }
  check("C: before its deadline the money waits for its order", early && (await balance(rc)) === PRICE);
  await warpTo(c.refundAfter + 1);
  const beforeC = await balance(REFUND_TO);
  await sweepIntentReceiver(op, c, rc);
  check("C: after the deadline it goes back to the refund address", (await balance(REFUND_TO)) - beforeC === PRICE);

  check("the escrow holds nothing it does not owe", (await balance(ESCROW)) === BigInt(0), String(await balance(ESCROW)));
}

main()
  .catch((e) => check("the cycle ran to the end", false, e instanceof Error ? e.message.split("\n")[0] : String(e)))
  .finally(() => {
    for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  (${r.note})` : ""}`);
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks pass`);
    process.exit(failed ? 1 : 0);
  });
