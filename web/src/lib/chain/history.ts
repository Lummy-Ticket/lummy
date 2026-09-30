// Riwayat satu escrow, disusun dari event kontrak di chain, bukan dari database. Dipakai halaman tiket
// dan halaman bukti publik. Isinya cuma yang memang publik di chain, tanpa data pribadi.
import { decodeEventLog, toEventSelector, toHex, type Address, type Hex, type PublicClient, type RpcLog } from "viem";
import { escrowAbi } from "./abi";
import { DEPLOYMENTS } from "./deployments";
import { publicClient } from "./escrow";
import { readListing, type ChainTarget, type OnchainListing } from "./server";

if (typeof window !== "undefined") throw new Error("lib/chain/history hanya boleh dipakai di server");

/** Event yang topik pertamanya id listing. Withdrawn dan PriceCapSet tidak terikat ke satu listing. */
const KINDS = [
  "Listed", "ListingCancelled", "Funded", "HandoverMarked", "EventPostponed", "DisputeRaised", "Resolved", "Released", "Refunded",
] as const;
export type HistoryKind = (typeof KINDS)[number];

export type HistoryEvent = {
  kind: HistoryKind;
  tx: Hex;
  block: number;
  /** Waktu blok, unix detik. */
  at: number;
  /** Nominal token (6 desimal) sebagai teks: harga di Listed dan Funded, jumlah di Released dan Refunded. */
  amount?: string;
  toBuyer?: string;
  toSeller?: string;
  /** Batas masa klaim saat serah terima dicatat, unix detik. */
  deadline?: number;
  /** Jadwal selesai acara (Listed, EventPostponed), unix detik. */
  eventEndsAt?: number;
};

export type EscrowHistory = { listingId: Hex; chainId: number; escrow: Address; events: HistoryEvent[]; live: OnchainListing };

type AbiItem = (typeof escrowAbi)[number];
const isHistoryEvent = (item: AbiItem): item is Extract<AbiItem, { type: "event" }> =>
  item.type === "event" && (KINDS as readonly string[]).includes(item.name);
const SELECTORS = escrowAbi.filter(isHistoryEvent).map((e) => toEventSelector(e));

/** Blok awal pencarian log: blok deploy kalau tercatat. Tanpa itu, Anvil dari 0, chain publik mundur sekitar 3 hari. */
function scanFrom(t: ChainTarget, latest: bigint): bigint {
  const dep = DEPLOYMENTS[t.chain.id];
  if (dep?.deployBlock && dep.escrow.toLowerCase() === t.escrow.toLowerCase()) return BigInt(dep.deployBlock);
  const back = BigInt(1_000_000);
  return t.chain.id === 31337 || latest < back ? BigInt(0) : latest - back;
}

// Waktu blok tidak pernah berubah, jadi cukup dibaca sekali per blok.
const blockTimes = new Map<bigint, number>();
async function blockTime(pc: PublicClient, n: bigint): Promise<number> {
  const hit = blockTimes.get(n);
  if (hit !== undefined) return hit;
  const at = Number((await pc.getBlock({ blockNumber: n })).timestamp);
  blockTimes.set(n, at);
  if (blockTimes.size > 2000) {
    const oldest = blockTimes.keys().next();
    if (!oldest.done) blockTimes.delete(oldest.value);
  }
  return at;
}

async function toEvent(pc: PublicClient, log: RpcLog): Promise<HistoryEvent | null> {
  if (!log.blockNumber || !log.transactionHash) return null; // log pending belum punya blok
  const block = BigInt(log.blockNumber);
  const decoded = decodeEventLog({ abi: escrowAbi, data: log.data, topics: log.topics });
  const base = { tx: log.transactionHash, block: Number(block), at: await blockTime(pc, block) };
  switch (decoded.eventName) {
    case "Listed":
      return { ...base, kind: "Listed", amount: decoded.args.price.toString(), eventEndsAt: Number(decoded.args.eventEndsAt) };
    case "ListingCancelled":
      return { ...base, kind: "ListingCancelled" };
    case "Funded":
      return { ...base, kind: "Funded", amount: decoded.args.price.toString() };
    case "HandoverMarked":
      return { ...base, kind: "HandoverMarked", deadline: Number(decoded.args.disputeDeadline) };
    case "EventPostponed":
      return { ...base, kind: "EventPostponed", eventEndsAt: Number(decoded.args.eventEndsAt) };
    case "DisputeRaised":
      return { ...base, kind: "DisputeRaised" };
    case "Resolved":
      return { ...base, kind: "Resolved", toBuyer: decoded.args.toBuyer.toString(), toSeller: decoded.args.toSeller.toString() };
    case "Released":
      return { ...base, kind: "Released", amount: decoded.args.amount.toString() };
    case "Refunded":
      return { ...base, kind: "Refunded", amount: decoded.args.amount.toString() };
    default:
      return null;
  }
}

/** Semua event listing ini, urut sesuai kejadian, plus status live dari kontrak. */
export async function readHistory(t: ChainTarget, id: Hex): Promise<EscrowHistory> {
  const pc = publicClient(t.chain, t.rpcUrl);
  const latest = await pc.getBlockNumber();
  const [logs, live] = await Promise.all([
    pc.request({
      method: "eth_getLogs",
      params: [{ address: t.escrow, fromBlock: toHex(scanFrom(t, latest)), toBlock: toHex(latest), topics: [SELECTORS, id] }],
    }),
    readListing(t, id),
  ]);
  const key = (l: RpcLog) => [BigInt(l.blockNumber ?? "0x0"), BigInt(l.logIndex ?? "0x0")] as const;
  const ordered = [...logs].sort((a, b) => {
    const [ab, ai] = key(a);
    const [bb, bi] = key(b);
    return ab === bb ? (ai < bi ? -1 : ai > bi ? 1 : 0) : ab < bb ? -1 : 1;
  });
  const events = (await Promise.all(ordered.map((l) => toEvent(pc, l)))).filter((e): e is HistoryEvent => e !== null);
  return { listingId: id, chainId: t.chain.id, escrow: t.escrow, events, live };
}

const TERMINAL = new Set(["Released", "Refunded", "Cancelled"]);
const cache = new Map<string, { at: number; value: EscrowHistory }>();

/**
 * Escrow yang sudah selesai tidak berubah lagi, jadi disimpan 10 menit. Yang masih berjalan cukup 5 detik,
 * supaya halaman yang polling tidak membebani RPC publik.
 */
export async function readHistoryCached(t: ChainTarget, id: Hex): Promise<EscrowHistory> {
  const key = `${t.chain.id}:${t.escrow}:${id}`.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (TERMINAL.has(hit.value.live.status) ? 600_000 : 5_000)) return hit.value;
  const value = await readHistory(t, id);
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  return value;
}
