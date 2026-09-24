// Operator Model A di sisi server. Kunci cuma dibaca di sini, tidak pernah dikirim ke browser, dan
// modul ini cuma diimpor route handler di src/app/api/chain/. Tanpa kunci, mode chain mati dan app
// tetap berjalan dengan data contoh.
import { timingSafeEqual } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { formatUnits, keccak256, parseUnits, toHex, type Address, type Chain, type Hex, type LocalAccount } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { escrowAbi, tokenAbi } from "./abi";
import { signFund } from "./buyer";
import { CHAINS, RPC_URLS, USDC_DECIMALS } from "./config";
import { DEPLOYMENTS } from "./deployments";
import { disputeDeadline, escrowAs, getListing, pendingOf, publicClient, type Listing } from "./escrow";

if (typeof window !== "undefined") throw new Error("lib/chain/server hanya boleh dipakai di server");

/** Kontrak yang dibaca app. Cukup alamat publik, tanpa kunci. */
export type ChainTarget = { chain: Chain; rpcUrl: string; escrow: Address; token: Address };

export type Operator = ChainTarget & {
  operator: LocalAccount;
  /** Alamat simulasi pembeli (Model A): backend menandatangani atas namanya, tanpa gas. */
  buyer: LocalAccount;
  seller: Address;
  /** Nominal USDC testnet per pesanan demo, terpisah dari harga rupiah di app. */
  price: bigint;
  demoKey?: string;
};

/**
 * Status yang dikirim ke browser. `price` jadi string karena JSON tidak kenal bigint. `now` = waktu
 * blok terbaru: jam kontrak, bukan jam perangkat, yang menentukan kapan window lewat.
 */
export type OnchainListing = Omit<Listing, "price"> & { price: string; disputeWindow: number; deadline: number; now: number };

export type SettleAction = "dispute" | "resolve" | "release" | "refund";

export function chainTarget(): ChainTarget | null {
  const chainId = Number(process.env.LUMMY_CHAIN_ID ?? 421614);
  const chain = CHAINS[chainId];
  const dep = DEPLOYMENTS[chainId];
  const escrow = (process.env.LUMMY_ESCROW ?? dep?.escrow) as Address | undefined;
  const token = (process.env.LUMMY_TOKEN ?? dep?.token) as Address | undefined;
  if (!chain || !escrow || !token) return null;
  return { chain, rpcUrl: process.env.LUMMY_RPC_URL ?? RPC_URLS[chainId], escrow, token };
}

/** Kunci dari env. Di mesin dev tanpa env, dari ~/.lummy/testnet.env (khusus Arbitrum Sepolia). */
function loadKeys(chainId: number) {
  let operator = process.env.LUMMY_OPERATOR_KEY;
  let buyer = process.env.LUMMY_BUYER_KEY;
  let seller = process.env.LUMMY_SELLER_ADDRESS;
  const file = path.join(os.homedir(), ".lummy", "testnet.env");
  if ((!operator || !buyer || !seller) && process.env.NODE_ENV !== "production" && chainId === 421614 && fs.existsSync(file)) {
    const env: Record<string, string> = {};
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const eq = line.indexOf("=");
      if (eq > 0 && !line.startsWith("#")) env[line.slice(0, eq)] = line.slice(eq + 1).trim();
    }
    operator ??= env.OPERATOR_PRIVATE_KEY;
    buyer ??= env.BUYER_PRIVATE_KEY;
    seller ??= env.SELLER_ADDRESS;
  }
  return operator && buyer && seller ? { operator, buyer, seller } : null;
}

export function operatorSetup(): Operator | null {
  const target = chainTarget();
  const keys = target && loadKeys(target.chain.id);
  if (!target || !keys) return null;
  return {
    ...target,
    operator: privateKeyToAccount(keys.operator as Hex),
    buyer: privateKeyToAccount(keys.buyer as Hex),
    seller: keys.seller as Address,
    price: parseUnits(process.env.LUMMY_DEMO_PRICE_USDC ?? "1", USDC_DECIMALS),
    demoKey: process.env.LUMMY_DEMO_KEY || undefined,
  };
}

/**
 * Siapa boleh memicu transaksi. "key": wajib header x-demo-key. "open": tanpa kunci, cuma di mesin dev.
 * "off": tidak ada kunci operator, atau produksi tanpa demo key.
 */
export function writeMode(op: Operator | null): "off" | "open" | "key" {
  if (!op) return "off";
  if (op.demoKey) return "key";
  return process.env.NODE_ENV === "production" ? "off" : "open";
}

export function writeAllowed(req: Request, op: Operator): boolean {
  const mode = writeMode(op);
  if (mode === "open") return true;
  if (mode !== "key" || !op.demoKey) return false;
  const given = Buffer.from(req.headers.get("x-demo-key") ?? "");
  const want = Buffer.from(op.demoKey);
  return given.length === want.length && timingSafeEqual(given, want);
}

// Satu antrean per instance server: dua checkout bersamaan tidak berebut nonce operator.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

const windowCache = new Map<string, number>();
export async function readWindow(t: ChainTarget): Promise<number> {
  const cached = windowCache.get(t.escrow);
  if (cached !== undefined) return cached;
  const pc = publicClient(t.chain, t.rpcUrl);
  const value = Number(await pc.readContract({ address: t.escrow, abi: escrowAbi, functionName: "disputeWindow" }));
  windowCache.set(t.escrow, value);
  return value;
}

export async function readListing(t: ChainTarget, id: Hex): Promise<OnchainListing> {
  const pc = publicClient(t.chain, t.rpcUrl);
  const [L, window, block] = await Promise.all([getListing(pc, t.escrow, id), readWindow(t), pc.getBlock()]);
  return {
    ...L,
    price: L.price.toString(),
    disputeWindow: window,
    deadline: disputeDeadline(L, window),
    now: Number(block.timestamp),
  };
}

/**
 * Checkout on-chain: listing atas nama seller, dana pembeli dikunci, lalu serah terima dicatat,
 * karena pembeli langsung menerima surat kuasa setelah bayar. Window berakhir `disputeWindow`
 * setelah yang terakhir dari serah terima dan `eventEndsAt`.
 */
export async function openOrder(op: Operator, eventEndsAt: number) {
  return serial(async () => {
    const pc = publicClient(op.chain, op.rpcUrl);
    const balance = await pc.readContract({ address: op.token, abi: tokenAbi, functionName: "balanceOf", args: [op.buyer.address] });
    if (balance < op.price) {
      throw new Error(`USDC pembeli testnet tinggal ${formatUnits(balance, USDC_DECIMALS)}, butuh ${formatUnits(op.price, USDC_DECIMALS)}`);
    }
    const as = escrowAs(pc, op.operator, op.chain, op.rpcUrl, op.escrow);
    const tag = crypto.randomUUID();
    const id = keccak256(toHex(`lummy:listing:${tag}`));
    // Demo: di produksi komitmen ini HMAC dari barcode yang di-decode (docs/09, keputusan A).
    const commit = keccak256(toHex(`lummy:barcode:${tag}`));
    const create = await as.createListingFor(op.seller, id, op.price, commit, eventEndsAt);
    const sig = await signFund({ pc, buyer: op.buyer, escrow: op.escrow, token: op.token, listingId: id, value: op.price });
    const fund = await as.fund(id, sig);
    const handover = await as.markHandover(id, keccak256(toHex(`lummy:surat-kuasa:${id}`)));
    return { listingId: id, price: op.price.toString(), txs: { create: create.hash, fund: fund.hash, handover: handover.hash } };
  });
}

/** Satu aksi penyelesaian, lalu dana yang teralokasi langsung dikirim ke pemiliknya (withdrawFor). */
export async function settle(op: Operator, id: Hex, action: SettleAction, toBuyer = BigInt(0)) {
  return serial(async () => {
    const pc = publicClient(op.chain, op.rpcUrl);
    const as = escrowAs(pc, op.operator, op.chain, op.rpcUrl, op.escrow);
    const r =
      action === "dispute" ? await as.raiseDispute(id)
      : action === "resolve" ? await as.resolveDispute(id, toBuyer)
      : action === "release" ? await as.release(id)
      : await as.refund(id);
    const withdrawals: Hex[] = [];
    if (action !== "dispute") {
      const L = await getListing(pc, op.escrow, id);
      for (const who of [L.seller, L.buyer]) {
        if ((await pendingOf(pc, op.escrow, who)) > BigInt(0)) withdrawals.push((await as.withdrawFor(who)).hash);
      }
    }
    return { tx: r.hash, withdrawals };
  });
}

/** Nama error kontrak kalau ada (mis. "WindowClosed"), selain itu pesan singkat viem. */
export function chainError(e: unknown): string {
  type Err = { shortMessage?: string; message?: string; walk?: (fn: (x: unknown) => boolean) => unknown };
  const err = e as Err;
  const named = err.walk?.((x) => typeof (x as { data?: { errorName?: unknown } })?.data?.errorName === "string") as
    | { data?: { errorName?: string } }
    | undefined;
  return named?.data?.errorName ?? err.shortMessage ?? err.message ?? String(e);
}
