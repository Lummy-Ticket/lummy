// Buku besar publik untuk pesanan yang dibayar lewat QRIS (docs/09 §7), sisi server. Uangnya dipegang
// Xendit dan database yang memutuskan; kontrak LummyLedger mencatat tiap langkahnya supaya siapa pun bisa
// memeriksa. Tidak ada data pribadi yang dikirim: pesanan, pembayaran, dan tiket cuma sebagai hash.
import {
  createWalletClient,
  getContract,
  keccak256,
  toHex,
  zeroHash,
  type Address,
  type Chain,
  type Hash,
  type Hex,
  type LocalAccount,
} from "viem";
import { ledgerAbi } from "./abi";
import { CHAINS } from "./config";
import { LEDGERS } from "./deployments";
import { publicClient, type BlockRef } from "./escrow";
import { rpcUrls, writeTransport } from "./rpc";

if (typeof window !== "undefined") throw new Error("lib/chain/ledger hanya boleh dipakai di server");

/** Urutan wajib sama dengan enum Status di LummyLedger. */
export const LEDGER_STATUS = ["None", "Open", "Released", "Refunded"] as const;
export type LedgerStatus = (typeof LEDGER_STATUS)[number];

/** Urutan wajib sama dengan enum RefundReason di LummyLedger. */
export const REFUND_REASONS = ["Other", "EventCancelled", "EventPostponed"] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export type LedgerTarget = { chain: Chain; rpcUrl: string; ledger: Address; deployBlock?: number };

export type LedgerRecord = {
  /** Rupiah yang ditahan untuk penjual. */
  amount: bigint;
  openedAt: number;
  eventEndsAt: number;
  status: LedgerStatus;
  disputed: boolean;
  disputeWindow: number;
  /** Batas window sengketa menurut kontrak, unix detik. */
  deadline: number;
  /** Waktu blok terbaru: jam kontrak, yang menentukan kapan window lewat. */
  now: number;
};

/**
 * Buku besar untuk pesanan baru, atau yang tercatat di pesanan lama (`at`), supaya pesanan yang sudah
 * tercatat tetap disusulkan ke kontrak yang sama walau nanti ada deployment baru.
 */
export function ledgerTarget(at?: { chainId: number | null; address: string | null }): LedgerTarget | null {
  const chainId = at?.chainId ?? Number(process.env.LUMMY_CHAIN_ID ?? 421614);
  const chain = CHAINS[chainId];
  const dep = LEDGERS[chainId];
  const ledger = (at?.address ?? process.env.LUMMY_LEDGER ?? dep?.ledger) as Address | undefined;
  if (!chain || !ledger) return null;
  const deployed = dep?.ledger.toLowerCase() === ledger.toLowerCase();
  return { chain, rpcUrl: rpcUrls(chainId)[0], ledger, deployBlock: deployed ? dep?.deployBlock : undefined };
}

/**
 * Id catatan satu pesanan. Turunan dari id pesanan (acak, `or-` + 12 hex), jadi kiriman ulang setelah
 * gagal selalu mengenai catatan yang sama dan kontrak menolak catatan kedua.
 */
export const ledgerOrderId = (orderId: string): Hex => keccak256(toHex(`lummy:order:${orderId}`));

/** Hash nomor permintaan pembayaran di Xendit: satu pembayaran tidak bisa menjadi dua pesanan. */
export const paymentRefOf = (providerRef: string): Hex => keccak256(toHex(`lummy:xendit:${providerRef}`));

/**
 * Komitmen set barcode, dengan turunan yang sama dengan escrow (lib/chain/server.ts), jadi satu tiket
 * punya komitmen yang sama di kedua kontrak. Tiket contoh tanpa file: nol, tidak ada yang dijaga.
 */
export const ticketCommitOf = (barcodeKey: string | null): Hex =>
  barcodeKey ? keccak256(toHex(`lummy:barcode:${barcodeKey}`)) : zeroHash;

/** Paket serah terima: file tiketnya lewat sha256 kalau ada, selain itu surat kuasa (keputusan H). */
export const handoverHashOf = (id: Hex, sha256: string | null): Hex =>
  keccak256(toHex(sha256 ? `lummy:serah-terima:${id}:${sha256}` : `lummy:surat-kuasa:${id}`));

const windowCache = new Map<string, number>();
async function ledgerWindow(t: LedgerTarget): Promise<number> {
  const cached = windowCache.get(t.ledger);
  if (cached !== undefined) return cached;
  const pc = publicClient(t.chain, t.rpcUrl);
  const value = Number(await pc.readContract({ address: t.ledger, abi: ledgerAbi, functionName: "disputeWindow" }));
  windowCache.set(t.ledger, value);
  return value;
}

/** `at`: catatan di blok itu (riwayat membaca catatan dan log di blok yang sama). Tanpa itu, blok terbaru. */
export async function readRecord(t: LedgerTarget, id: Hex, at?: BlockRef): Promise<LedgerRecord> {
  const pc = publicClient(t.chain, t.rpcUrl);
  const [[amount, openedAt, eventEndsAt, status, disputed], disputeWindow, block] = await Promise.all([
    pc.readContract({ address: t.ledger, abi: ledgerAbi, functionName: "orders", args: [id], blockNumber: at?.number }),
    ledgerWindow(t),
    at ?? pc.getBlock(),
  ]);
  return {
    amount,
    openedAt,
    eventEndsAt,
    status: LEDGER_STATUS[status],
    disputed,
    disputeWindow,
    deadline: eventEndsAt + disputeWindow,
    now: Number(block.timestamp),
  };
}

/**
 * Semua aksi tulis sebagai operator. Tiap aksi menunggu receipt dan gagal kalau revert. Ulangan di transport
 * tidak pernah mengirim transaksi kedua (writeTransport di lib/chain/rpc.ts).
 */
export function ledgerAs(t: LedgerTarget, account: LocalAccount) {
  const pc = publicClient(t.chain, t.rpcUrl);
  const wallet = createWalletClient({ account, chain: t.chain, transport: writeTransport(t.chain, t.rpcUrl) });
  const c = getContract({ address: t.ledger, abi: ledgerAbi, client: { public: pc, wallet } });

  // Dibatasi waktunya: antreannya dipakai bersama checkout escrow, jadi satu transaksi yang macet tidak
  // boleh menahan yang lain. Yang terkirim tapi belum terbaca disusulkan sinkron berikutnya.
  const done = async (hash: Hash): Promise<Hash> => {
    const r = await pc.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (r.status !== "success") throw new Error(`tx ${hash} revert`);
    return hash;
  };

  return {
    open: async (id: Hex, amount: bigint, paymentRef: Hex, ticketCommit: Hex, handoverHash: Hex, eventEndsAt: number) =>
      done(await c.write.open([id, amount, paymentRef, ticketCommit, handoverHash, eventEndsAt])),
    postponeEvent: async (id: Hex, newEventEndsAt: number) => done(await c.write.postponeEvent([id, newEventEndsAt])),
    raiseDispute: async (id: Hex) => done(await c.write.raiseDispute([id])),
    release: async (id: Hex) => done(await c.write.release([id])),
    refund: async (id: Hex, reason: RefundReason) => done(await c.write.refund([id, REFUND_REASONS.indexOf(reason)])),
    resolveDispute: async (id: Hex, toBuyer: bigint) => done(await c.write.resolveDispute([id, toBuyer])),
  };
}
