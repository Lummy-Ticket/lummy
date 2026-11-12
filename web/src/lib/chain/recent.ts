// Every order paid into the escrow on Arbitrum One, newest first, read from the contract's own events
// and its live state. Nothing comes from our database, so there is nothing personal in it: an id, an
// amount, a time and a status, all of which anyone can already read on the chain. The public list at
// /proof uses it, so a reader needs no id to start from.
import { decodeEventLog, encodeEventTopics, toHex, type Hex, type RpcLog } from "viem";
import { escrowAbi } from "./abi";
import { DEPLOYMENTS } from "./deployments";
import { publicClient } from "./escrow";
import { ARBITRUM_ONE, readListing, targetFor } from "./server";

if (typeof window !== "undefined") throw new Error("lib/chain/recent is for the server only");

export type RecentOrder = {
  id: Hex;
  /** The amount locked, in the token's smallest unit, as text. */
  price: string;
  /** Block time of the payment, unix seconds. */
  at: number;
  tx: Hex;
  /** The contract's status now: Funded, Released, Refunded and so on. */
  status: string;
  disputed: boolean;
};

export type Recent = { chainId: number; escrow: string; total: number; orders: RecentOrder[]; readAt: number };

const FUNDED = encodeEventTopics({ abi: escrowAbi, eventName: "Funded" })[0];
/** How many pieces the block range is cut into when a node refuses it whole. */
const PIECES = 16;
const KEEP_MS = 60_000;
let kept: { at: number; limit: number; value: Recent } | null = null;

/** Null when this deploy knows no escrow on Arbitrum One. Throws when the chain cannot be read. */
export async function readRecent(limit = 25): Promise<Recent | null> {
  if (kept && kept.limit >= limit && Date.now() - kept.at < KEEP_MS) return kept.value;
  const t = targetFor(ARBITRUM_ONE);
  const dep = DEPLOYMENTS[ARBITRUM_ONE];
  if (!t || !dep?.deployBlock || dep.escrow.toLowerCase() !== t.escrow.toLowerCase()) return null;
  const pc = publicClient(t.chain, t.rpcUrl);
  const head = await pc.getBlock();
  const first = BigInt(dep.deployBlock);
  const get = (a: bigint, b: bigint): Promise<RpcLog[]> =>
    pc.request({ method: "eth_getLogs", params: [{ address: t.escrow, fromBlock: toHex(a), toBlock: toHex(b), topics: [FUNDED] }] });

  let logs: RpcLog[];
  try {
    logs = await get(first, head.number);
  } catch {
    // Some nodes refuse a wide range: ask again in pieces, in order.
    const step = (head.number - first) / BigInt(PIECES) + BigInt(1);
    logs = [];
    for (let a = first; a <= head.number; a += step) {
      const b = a + step - BigInt(1) < head.number ? a + step - BigInt(1) : head.number;
      logs.push(...(await get(a, b)));
    }
  }

  const paid = logs
    .filter((l) => l.blockNumber && l.transactionHash && l.topics[1])
    .sort((x, y) => Number(BigInt(y.blockNumber!) - BigInt(x.blockNumber!)));
  const orders = await Promise.all(
    paid.slice(0, limit).map(async (l): Promise<RecentOrder> => {
      const id = l.topics[1] as Hex;
      const decoded = decodeEventLog({ abi: escrowAbi, eventName: "Funded", data: l.data, topics: l.topics });
      const [block, live] = await Promise.all([pc.getBlock({ blockNumber: BigInt(l.blockNumber!) }), readListing(t, id, head)]);
      return { id, price: decoded.args.price.toString(), at: Number(block.timestamp), tx: l.transactionHash as Hex, status: live.status, disputed: live.disputed };
    }),
  );
  const value: Recent = { chainId: ARBITRUM_ONE, escrow: t.escrow, total: paid.length, orders, readAt: Math.floor(Date.now() / 1000) };
  kept = { at: Date.now(), limit, value };
  return value;
}
