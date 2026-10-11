// Riwayat satu escrow, disusun dari event kontrak di chain, bukan dari database. Dipakai halaman tiket
// dan halaman bukti publik. Isinya cuma yang memang publik di chain, tanpa data pribadi. Dua sumber:
// LummyEscrow (dana USDC dikunci di kontrak) dan LummyLedger (pesanan QRIS: uangnya di Xendit, kontrak
// mencatat tiap langkah, docs/09 §7). Bentuk hasilnya sama, dibedakan `source`.
import { decodeEventLog, toHex, zeroAddress, zeroHash, type Address, type Hex, type PublicClient, type RpcLog } from "viem";
import { escrowAbi, ledgerAbi } from "./abi";
import { DEPLOYMENTS } from "./deployments";
import { publicClient } from "./escrow";
import { ledgerTarget, readRecord, REFUND_REASONS, type LedgerTarget, type RefundReason } from "./ledger";
import { chainTarget, readListing, type ChainTarget, type OnchainListing } from "./server";

if (typeof window !== "undefined") throw new Error("lib/chain/history hanya boleh dipakai di server");

/**
 * Event escrow yang topik pertamanya id listing (Withdrawn dan PriceCapSet tidak terikat ke satu
 * listing), plus "Paid": event Opened di buku besar.
 */
export type HistoryKind =
  | "Listed" | "ListingCancelled" | "Funded" | "HandoverMarked" | "EventPostponed" | "DisputeRaised" | "Resolved" | "Released" | "Refunded"
  | "Paid";

export type HistoryEvent = {
  kind: HistoryKind;
  tx: Hex;
  block: number;
  /** Waktu blok, unix detik. */
  at: number;
  /**
   * Nominal sebagai teks: harga di Listed dan Funded, jumlah di Released dan Refunded. Escrow dalam unit
   * token (6 desimal), buku besar dalam rupiah.
   */
  amount?: string;
  toBuyer?: string;
  toSeller?: string;
  /** Batas masa klaim saat langkah ini dicatat, unix detik. */
  deadline?: number;
  /** Jadwal selesai acara (Listed, Paid, EventPostponed), unix detik. */
  eventEndsAt?: number;
  /** Alasan refund tanpa sengketa (buku besar). */
  reason?: RefundReason;
};

export type HistorySource = "escrow" | "ledger";

/** `escrow` = alamat kontrak yang dibaca, escrow atau buku besar sesuai `source`. */
export type EscrowHistory = {
  source: HistorySource;
  listingId: Hex;
  chainId: number;
  escrow: Address;
  events: HistoryEvent[];
  live: OnchainListing;
};

/** Blok awal pencarian log: blok deploy kalau tercatat. Tanpa itu, Anvil dari 0, chain publik mundur sekitar 3 hari. */
function scanFrom(chainId: number, deployBlock: number | undefined, latest: bigint): bigint {
  if (deployBlock) return BigInt(deployBlock);
  const back = BigInt(1_000_000);
  return chainId === 31337 || latest < back ? BigInt(0) : latest - back;
}

function escrowDeployBlock(t: ChainTarget): number | undefined {
  const dep = DEPLOYMENTS[t.chain.id];
  return dep?.deployBlock && dep.escrow.toLowerCase() === t.escrow.toLowerCase() ? dep.deployBlock : undefined;
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

/** Decode dengan ABI kontraknya. Log yang tidak dikenal ABI (tidak pernah terjadi di kontrak ini) dilewati. */
function decodeOr<T>(decode: () => T): T | null {
  try {
    return decode();
  } catch {
    return null;
  }
}

async function toEvent(pc: PublicClient, log: RpcLog): Promise<HistoryEvent | null> {
  if (!log.blockNumber || !log.transactionHash) return null; // log pending belum punya blok
  const block = BigInt(log.blockNumber);
  const decoded = decodeOr(() => decodeEventLog({ abi: escrowAbi, data: log.data, topics: log.topics }));
  if (!decoded) return null;
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

async function toLedgerEvent(pc: PublicClient, log: RpcLog): Promise<HistoryEvent | null> {
  if (!log.blockNumber || !log.transactionHash) return null;
  const block = BigInt(log.blockNumber);
  const decoded = decodeOr(() => decodeEventLog({ abi: ledgerAbi, data: log.data, topics: log.topics }));
  if (!decoded) return null;
  const base = { tx: log.transactionHash, block: Number(block), at: await blockTime(pc, block) };
  switch (decoded.eventName) {
    case "Opened":
      return {
        ...base,
        kind: "Paid",
        amount: decoded.args.amount.toString(),
        eventEndsAt: Number(decoded.args.eventEndsAt),
        deadline: Number(decoded.args.disputeDeadline),
      };
    case "EventPostponed":
      return { ...base, kind: "EventPostponed", eventEndsAt: Number(decoded.args.eventEndsAt), deadline: Number(decoded.args.disputeDeadline) };
    case "DisputeRaised":
      return { ...base, kind: "DisputeRaised" };
    case "Resolved":
      return { ...base, kind: "Resolved", toBuyer: decoded.args.toBuyer.toString(), toSeller: decoded.args.toSeller.toString() };
    case "Released":
      return { ...base, kind: "Released", amount: decoded.args.amount.toString() };
    case "Refunded":
      return { ...base, kind: "Refunded", amount: decoded.args.amount.toString(), reason: REFUND_REASONS[decoded.args.reason] ?? "Other" };
    default:
      return null;
  }
}

/**
 * Log satu id dari satu kontrak, urut sesuai kejadian. Disaring lewat topik kedua (id-nya) saja: RPC
 * publik Arbitrum membatasi filter dengan beberapa nilai di satu posisi ke 100.000 blok (sekitar tujuh
 * jam), sedangkan satu nilai per posisi boleh menjangkau sejak deploy. Event lain di kontrak tidak
 * pernah punya id ini di topik kedua, dan yang bukan riwayat dibuang saat di-decode.
 */
async function logsOf(pc: PublicClient, address: Address, id: Hex, from: bigint, latest: bigint) {
  const logs = await pc.request({
    method: "eth_getLogs",
    params: [{ address, fromBlock: toHex(from), toBlock: toHex(latest), topics: [null, id] }],
  });
  const key = (l: RpcLog) => [BigInt(l.blockNumber ?? "0x0"), BigInt(l.logIndex ?? "0x0")] as const;
  return [...logs].sort((a, b) => {
    const [ab, ai] = key(a);
    const [bb, bi] = key(b);
    return ab === bb ? (ai < bi ? -1 : ai > bi ? 1 : 0) : ab < bb ? -1 : 1;
  });
}

/** Semua event listing ini, urut sesuai kejadian, plus status live dari kontrak. */
export async function readHistory(t: ChainTarget, id: Hex): Promise<EscrowHistory> {
  const pc = publicClient(t.chain, t.rpcUrl);
  const latest = await pc.getBlockNumber();
  const [ordered, live] = await Promise.all([
    logsOf(pc, t.escrow, id, scanFrom(t.chain.id, escrowDeployBlock(t), latest), latest),
    readListing(t, id),
  ]);
  const events = (await Promise.all(ordered.map((l) => toEvent(pc, l)))).filter((e): e is HistoryEvent => e !== null);
  return { source: "escrow", listingId: id, chainId: t.chain.id, escrow: t.escrow, events, live };
}

/**
 * Riwayat satu catatan buku besar dalam bentuk yang sama dengan escrow. Catatan yang terbuka tampil
 * sebagai "DisputeWindow": serah terima sudah terjadi saat pembayaran masuk. Tidak ada alamat pihak.
 */
export async function readLedgerHistory(t: LedgerTarget, id: Hex): Promise<EscrowHistory> {
  const pc = publicClient(t.chain, t.rpcUrl);
  const latest = await pc.getBlockNumber();
  const [ordered, rec] = await Promise.all([
    logsOf(pc, t.ledger, id, scanFrom(t.chain.id, t.deployBlock, latest), latest),
    readRecord(t, id),
  ]);
  const events = (await Promise.all(ordered.map((l) => toLedgerEvent(pc, l)))).filter((e): e is HistoryEvent => e !== null);
  const live: OnchainListing = {
    seller: zeroAddress,
    buyer: zeroAddress,
    price: rec.amount.toString(),
    handoverAt: rec.openedAt,
    eventEndsAt: rec.eventEndsAt,
    status: rec.status === "Open" ? "DisputeWindow" : rec.status,
    disputed: rec.disputed,
    barcodeCommit: zeroHash,
    disputeWindow: rec.disputeWindow,
    deadline: rec.deadline,
    now: rec.now,
  };
  return { source: "ledger", listingId: id, chainId: t.chain.id, escrow: t.ledger, events, live };
}

const TERMINAL = new Set(["Released", "Refunded", "Cancelled"]);
const cache = new Map<string, { at: number; value: EscrowHistory }>();

/**
 * Riwayat yang sudah selesai tidak berubah lagi, jadi disimpan 10 menit. Yang masih berjalan cukup 5 detik,
 * supaya halaman yang polling tidak membebani RPC publik.
 */
async function cached(key: string, load: () => Promise<EscrowHistory>): Promise<EscrowHistory> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (TERMINAL.has(hit.value.live.status) ? 600_000 : 5_000)) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  return value;
}

export function readHistoryCached(t: ChainTarget, id: Hex): Promise<EscrowHistory> {
  return cached(`${t.chain.id}:${t.escrow}:${id}`.toLowerCase(), () => readHistory(t, id));
}

const found = (h: EscrowHistory) => h.live.status !== "None" || h.events.length > 0;

/**
 * Riwayat untuk satu id: dari escrow, dari buku besar, atau dari keduanya sekaligus kalau sumbernya tidak
 * disebut (halaman bukti publik). Id keduanya hash dengan awalan berbeda (`lummy:listing:` dan
 * `lummy:order:`), jadi tidak pernah bertabrakan. Keduanya dibaca bersamaan, dan yang satu gagal tidak
 * menjatuhkan yang lain: catatan QRIS tetap terbaca walau RPC escrow sedang menolak. Null kalau tidak ada
 * di mana pun; galat cuma kalau tidak ketemu dan ada yang gagal dibaca.
 */
export async function readAnyHistory(id: Hex, source?: HistorySource): Promise<EscrowHistory | null> {
  const escrow = source === "ledger" ? null : chainTarget();
  const ledger = source === "escrow" ? null : ledgerTarget();
  const reads = await Promise.allSettled([
    escrow ? readHistoryCached(escrow, id) : Promise.resolve(null),
    ledger ? cached(`${ledger.chain.id}:${ledger.ledger}:${id}`.toLowerCase(), () => readLedgerHistory(ledger, id)) : Promise.resolve(null),
  ]);
  for (const r of reads) if (r.status === "fulfilled" && r.value && found(r.value)) return r.value;
  const failed = reads.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) throw failed.reason;
  return null;
}
