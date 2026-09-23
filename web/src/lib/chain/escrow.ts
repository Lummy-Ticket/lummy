// Baca dan tulis LummyEscrow lewat viem. Dipakai skrip operator sekarang, dan route backend
// (Model A) nanti. Kunci tidak pernah disimpan di sini: akun dioper oleh pemanggil.
import {
  createPublicClient,
  createWalletClient,
  getContract,
  http,
  type Address,
  type Chain,
  type Hash,
  type Hex,
  type LocalAccount,
  type PublicClient,
} from "viem";
import { escrowAbi } from "./abi";
import type { FundSignature } from "./buyer";
import { STATUS, type Status } from "./config";

export type Listing = {
  seller: Address;
  buyer: Address;
  price: bigint;
  handoverAt: number;
  eventEndsAt: number;
  status: Status;
  disputed: boolean;
  barcodeCommit: Hex;
};

export type Receipt = { hash: Hash; blockNumber: bigint; gasUsed: bigint };

export function publicClient(chain: Chain, rpcUrl: string): PublicClient {
  return createPublicClient({ chain, transport: http(rpcUrl) });
}

export async function getListing(pc: PublicClient, escrow: Address, id: Hex): Promise<Listing> {
  const [seller, buyer, price, handoverAt, eventEndsAt, status, disputed, barcodeCommit] = await pc.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "listings",
    args: [id],
  });
  return { seller, buyer, price, handoverAt, eventEndsAt, status: STATUS[status], disputed, barcodeCommit };
}

/** Batas window sengketa (unix detik): `disputeWindow` setelah yang terakhir dari serah terima dan acara selesai. */
export function disputeDeadline(L: Listing, disputeWindow: number): number {
  return Math.max(L.handoverAt, L.eventEndsAt) + disputeWindow;
}

/** Dana yang sudah dialokasikan ke `who` dan siap dikirim lewat `withdraw` atau `withdrawFor`. */
export function pendingOf(pc: PublicClient, escrow: Address, who: Address): Promise<bigint> {
  return pc.readContract({ address: escrow, abi: escrowAbi, functionName: "pending", args: [who] });
}

/**
 * Semua aksi tulis atas nama satu akun. Tiap aksi menunggu receipt dan gagal kalau revert.
 * Di Model A akun ini operator: aksi `...For` dan aksi seller/pembeli dikirim atas nama pengguna,
 * jadi cuma operator yang butuh ETH untuk gas.
 */
export function escrowAs(pc: PublicClient, account: LocalAccount, chain: Chain, rpcUrl: string, escrow: Address) {
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const c = getContract({ address: escrow, abi: escrowAbi, client: { public: pc, wallet } });

  const done = async (hash: Hash): Promise<Receipt> => {
    const r = await pc.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`tx ${hash} revert`);
    return { hash, blockNumber: r.blockNumber, gasUsed: r.gasUsed };
  };

  return {
    address: account.address,
    createListing: async (id: Hex, price: bigint, commit: Hex, eventEndsAt: number) =>
      done(await c.write.createListing([id, price, commit, eventEndsAt])),
    createListingFor: async (seller: Address, id: Hex, price: bigint, commit: Hex, eventEndsAt: number) =>
      done(await c.write.createListingFor([seller, id, price, commit, eventEndsAt])),
    cancelListing: async (id: Hex) => done(await c.write.cancelListing([id])),
    fund: async (id: Hex, f: FundSignature) =>
      done(
        await c.write.fund([id, f.from, f.value, f.validAfter, f.validBefore, f.authNonce, f.authSig, f.deadline, f.fundSig]),
      ),
    markHandover: async (id: Hex, handoverHash: Hex) => done(await c.write.markHandover([id, handoverHash])),
    postponeEvent: async (id: Hex, newEventEndsAt: number) => done(await c.write.postponeEvent([id, newEventEndsAt])),
    raiseDispute: async (id: Hex) => done(await c.write.raiseDispute([id])),
    release: async (id: Hex) => done(await c.write.release([id])),
    refund: async (id: Hex) => done(await c.write.refund([id])),
    resolveDispute: async (id: Hex, toBuyer: bigint) => done(await c.write.resolveDispute([id, toBuyer])),
    withdraw: async () => done(await c.write.withdraw()),
    withdrawFor: async (payee: Address) => done(await c.write.withdrawFor([payee])),
  };
}
