// Riwayat satu escrow, disusun dari event kontrak di chain, bukan dari database. Dipakai halaman tiket
// dan halaman bukti publik. Isinya cuma yang memang publik di chain, tanpa data pribadi. Dua sumber:
// LummyEscrow (dana USDC dikunci di kontrak) dan LummyLedger (pesanan QRIS: uangnya di Xendit, kontrak
// mencatat tiap langkah, docs/09 §7). Bentuk hasilnya sama, dibedakan `source`.
import { decodeEventLog, encodeEventTopics, toHex, zeroAddress, zeroHash, type Address, type Hex, type PublicClient, type RpcLog } from "viem";
import { escrowAbi, ledgerAbi } from "./abi";
import { DEPLOYMENTS } from "./deployments";
import { publicClient } from "./escrow";
import { ledgerTarget, readRecord, REFUND_REASONS, type LedgerRecord, type LedgerTarget, type RefundReason } from "./ledger";
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
  /**
   * Status live sudah melewati langkah yang event-nya belum terbaca dari RPC. Event yang ada tetap benar,
   * cuma belum semuanya; `live` yang menentukan status. Tidak ada = lengkap.
   */
  incomplete?: boolean;
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

/** Topik event pembuka tiap kontrak (Listed, Opened): tidak ada event satu id sebelum itu. */
const LISTED = encodeEventTopics({ abi: escrowAbi, eventName: "Listed" })[0];
const OPENED = encodeEventTopics({ abi: ledgerAbi, eventName: "Opened" })[0];

/** Permintaan eth_getLogs paling banyak untuk satu pembacaan yang harus dipotong-potong. */
const LOG_REQUESTS = 24;

/**
 * Penolakan karena rentang blok atau banyaknya hasil (bunyinya beda tiap penyedia), bukan karena node mati.
 * Dicek di pesan node sendiri (`details`), bukan pesan viem yang ikut memuat URL dan isi permintaan.
 */
function rangeRefused(e: unknown): boolean {
  const err = e as { details?: string; shortMessage?: string; message?: string } | null;
  const text = err?.details ?? err?.shortMessage ?? err?.message ?? String(e);
  return /range|too many (results|logs|blocks)|more than \d|response size|limited to/i.test(text);
}

/**
 * Log satu id dari satu kontrak, urut sesuai kejadian. Disaring lewat topik kedua (id-nya) saja: RPC
 * publik Arbitrum membatasi filter dengan beberapa nilai di satu posisi ke 100.000 blok (sekitar tujuh
 * jam), sedangkan satu nilai per posisi boleh menjangkau sejak deploy. Event lain di kontrak tidak
 * pernah punya id ini di topik kedua, dan yang bukan riwayat dibuang saat di-decode. Satu permintaan
 * untuk seluruh rentang dulu; kalau rentangnya ditolak, dibaca berpotongan (newestFirst).
 */
async function logsOf(pc: PublicClient, address: Address, id: Hex, from: bigint, latest: bigint, opening: Hex) {
  const get = async (a: bigint, b: bigint): Promise<RpcLog[]> =>
    pc.request({
      method: "eth_getLogs",
      params: [{ address, fromBlock: toHex(a), toBlock: toHex(b), topics: [null, id] }],
    });
  let logs: RpcLog[];
  try {
    logs = await get(from, latest);
  } catch (e) {
    if (!rangeRefused(e)) throw e;
    logs = await newestFirst(get, from, latest, opening, e);
  }
  const key = (l: RpcLog) => [BigInt(l.blockNumber ?? "0x0"), BigInt(l.logIndex ?? "0x0")] as const;
  return [...logs].sort((a, b) => {
    const [ab, ai] = key(a);
    const [bb, bi] = key(b);
    return ab === bb ? (ai < bi ? -1 : ai > bi ? 1 : 0) : ab < bb ? -1 : 1;
  });
}

/**
 * Untuk RPC yang membatasi rentang blok: dibaca per potongan dari blok terbaru mundur, potongannya dibelah
 * dua tiap kali ditolak, dan berhenti begitu event pembuka id ini ketemu. Pesanan baru (yang dipantau
 * halaman) biasanya selesai di potongan pertama.
 */
async function newestFirst(
  get: (a: bigint, b: bigint) => Promise<RpcLog[]>,
  from: bigint,
  to: bigint,
  opening: Hex,
  refused: unknown
): Promise<RpcLog[]> {
  const one = BigInt(1);
  const logs: RpcLog[] = [];
  let span = (to - from + one) / BigInt(2);
  let hi = to;
  let last = refused;
  for (let left = LOG_REQUESTS; hi >= from; left--) {
    if (left === 0 || span < one) throw last;
    const lo = hi - span + one > from ? hi - span + one : from;
    try {
      const got = await get(lo, hi);
      logs.push(...got);
      if (got.some((l) => l.topics[0]?.toLowerCase() === opening.toLowerCase())) break;
      hi = lo - one;
    } catch (e) {
      if (!rangeRefused(e)) throw e;
      last = e;
      span /= BigInt(2);
    }
  }
  return logs;
}

/**
 * Apakah event yang terbaca sudah menjelaskan status live di blok yang sama: tiap status punya event yang
 * pasti mendahuluinya. RPC yang tertinggal mengembalikan log kosong tanpa galat (yang baru selesai
 * diputus bisa tampil Refunded tanpa event Resolved), jadi kekurangannya cuma terlihat dari sini.
 */
function complete(h: EscrowHistory): boolean {
  const { events, live } = h;
  if (live.status === "None") return true;
  const escrow = h.source === "escrow";
  const has = (...kinds: HistoryKind[]) => events.some((e) => kinds.includes(e.kind));
  if (!has(escrow ? "Listed" : "Paid")) return false;
  if (live.disputed && !has("DisputeRaised")) return false;
  // Jadwal terakhir yang tercatat (Listed, Paid, atau EventPostponed terakhir) harus jadwal live.
  if ([...events].reverse().find((e) => e.eventEndsAt !== undefined)?.eventEndsAt !== live.eventEndsAt) return false;
  if (escrow && live.status !== "Listed" && live.status !== "Cancelled" && !has("Funded")) return false;
  switch (live.status) {
    case "DisputeWindow":
      return !escrow || has("HandoverMarked");
    case "Released":
      return has("Released", "Resolved");
    case "Refunded":
      return has("Refunded", "Resolved");
    case "Cancelled":
      return has("ListingCancelled");
    default:
      return true;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Dibaca ulang kalau gagal atau belum lengkap, paling banyak tiga kali dalam sekitar 12 detik. Yang tetap
 * belum lengkap dikirim dengan `incomplete`: status live-nya benar, dan event yang kurang tidak dikarang.
 */
async function untilComplete(read: () => Promise<EscrowHistory>): Promise<EscrowHistory> {
  const started = Date.now();
  for (let i = 1; ; i++) {
    let h: EscrowHistory | null = null;
    let failure: unknown;
    try {
      h = await read();
    } catch (e) {
      failure = e;
    }
    if (h && complete(h)) return h;
    if (i >= 3 || Date.now() - started > 12_000) {
      if (h) return { ...h, incomplete: true };
      throw failure;
    }
    await sleep(800 * i);
  }
}

/**
 * Semua event listing ini, urut sesuai kejadian, plus status live dari kontrak. Status dan log dibaca di
 * blok yang sama, supaya transaksi yang masuk di antara dua bacaan tidak membuat status mendahului
 * riwayatnya. Listing yang tidak ada (None) tidak punya log, jadi log-nya tidak dibaca.
 */
export function readHistory(t: ChainTarget, id: Hex): Promise<EscrowHistory> {
  return untilComplete(async () => {
    const pc = publicClient(t.chain, t.rpcUrl);
    const head = await pc.getBlock();
    const live = await readListing(t, id, head);
    const ordered =
      live.status === "None" ? [] : await logsOf(pc, t.escrow, id, scanFrom(t.chain.id, escrowDeployBlock(t), head.number), head.number, LISTED);
    const events = (await Promise.all(ordered.map((l) => toEvent(pc, l)))).filter((e): e is HistoryEvent => e !== null);
    return { source: "escrow", listingId: id, chainId: t.chain.id, escrow: t.escrow, events, live };
  });
}

/**
 * Riwayat satu catatan buku besar dalam bentuk yang sama dengan escrow, dibaca dengan cara yang sama.
 * Catatan yang terbuka tampil sebagai "DisputeWindow": serah terima sudah terjadi saat pembayaran masuk.
 * Tidak ada alamat pihak.
 */
export function readLedgerHistory(t: LedgerTarget, id: Hex): Promise<EscrowHistory> {
  return untilComplete(async () => {
    const pc = publicClient(t.chain, t.rpcUrl);
    const head = await pc.getBlock();
    const rec = await readRecord(t, id, head);
    const ordered =
      rec.status === "None" ? [] : await logsOf(pc, t.ledger, id, scanFrom(t.chain.id, t.deployBlock, head.number), head.number, OPENED);
    const events = (await Promise.all(ordered.map((l) => toLedgerEvent(pc, l)))).filter((e): e is HistoryEvent => e !== null);
    return { source: "ledger", listingId: id, chainId: t.chain.id, escrow: t.ledger, events, live: ledgerLive(rec) };
  });
}

/** Catatan buku besar dalam bentuk status escrow. */
function ledgerLive(rec: LedgerRecord): OnchainListing {
  return {
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
}

const TERMINAL = new Set(["Released", "Refunded", "Cancelled"]);
const cache = new Map<string, { at: number; value: EscrowHistory }>();

/**
 * Riwayat yang sudah selesai dan lengkap tidak berubah lagi, jadi disimpan 10 menit. Yang masih berjalan,
 * atau yang event-nya belum semua terbaca, cuma 5 detik, supaya halaman yang polling tidak membebani RPC
 * publik tapi kekurangannya tidak tertahan lama.
 */
async function cached(key: string, load: () => Promise<EscrowHistory>): Promise<EscrowHistory> {
  const hit = cache.get(key);
  const final = hit && TERMINAL.has(hit.value.live.status) && !hit.value.incomplete;
  if (hit && Date.now() - hit.at < (final ? 600_000 : 5_000)) return hit.value;
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
