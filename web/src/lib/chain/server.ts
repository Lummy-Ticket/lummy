// Operator Model A di sisi server. Kunci cuma dibaca di sini, tidak pernah dikirim ke browser, dan
// modul ini cuma diimpor route handler di src/app/api/chain/. Tanpa kunci, mode chain mati dan app
// tetap berjalan dengan data contoh.
import fs from "fs";
import os from "os";
import path from "path";
import { formatUnits, keccak256, parseUnits, toHex, type Address, type Chain, type Hex, type LocalAccount } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { escrowAbi, tokenAbi } from "./abi";
import { signFund, type FundSignature } from "./buyer";
import { CHAINS, USDC_DECIMALS } from "./config";
import { DEPLOYMENTS, INTENTS } from "./deployments";
import { demoKeyAllowed, demoMode, type DemoMode } from "@/lib/demo-key";
import { disputeDeadline, escrowAs, getListing, intentsAs, pendingOf, publicClient, type BlockRef, type IntentOrder, type Listing } from "./escrow";
import { rpcUrls } from "./rpc";

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
  /** The factory of the NEAR Intents rail: this operator works on Arbitrum One, where the buyer is a receiver contract. */
  factory?: Address;
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
  return { chain, rpcUrl: rpcUrls(chainId)[0], escrow, token };
}

export const ARBITRUM_ONE = 42161;

/** The contract an order on this chain lives in: mainnet for the NEAR Intents rail, else the app's chain. */
export function targetFor(chainId?: number | null): ChainTarget | null {
  if (chainId !== ARBITRUM_ONE) return chainTarget();
  const dep = DEPLOYMENTS[ARBITRUM_ONE];
  return dep ? { chain: CHAINS[ARBITRUM_ONE], rpcUrl: rpcUrls(ARBITRUM_ONE)[0], escrow: dep.escrow, token: dep.token } : null;
}

/** Nilai env pertama yang terisi, tanpa spasi atau newline yang ikut ter-paste. */
const envOf = (...names: string[]) => names.map((n) => process.env[n]?.trim()).find(Boolean);

/** ~/.lummy/mainnet.env, on a dev machine only. Production reads its env and never this file. */
function mainnetFile(): Record<string, string> {
  const file = path.join(os.homedir(), ".lummy", "mainnet.env");
  if (process.env.NODE_ENV === "production" || !fs.existsSync(file)) return {};
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0 && !line.startsWith("#")) env[line.slice(0, eq)] = line.slice(eq + 1).trim();
  }
  return env;
}

/**
 * The operator on Arbitrum One, for payments through NEAR Intents: real USDC, the team's own for now.
 * Its key is separate from the testnet ones. Null until the contracts are deployed and its env is set.
 */
export function intentsOperator(): Operator | null {
  const target = targetFor(ARBITRUM_ONE);
  const factory = INTENTS[ARBITRUM_ONE]?.factory;
  const file = mainnetFile();
  const key = envOf("LUMMY_INTENTS_OPERATOR_KEY") ?? file.OPERATOR_PRIVATE_KEY;
  const seller = envOf("LUMMY_INTENTS_SELLER") ?? file.SELLER_ADDRESS;
  if (!target || !factory || !key || !seller) return null;
  const operator = privateKeyToAccount(key as Hex);
  return { ...target, operator, buyer: operator, seller: seller as Address, price: BigInt(0), factory };
}

/** Who acts for an order on this chain. */
export const operatorFor = (chainId?: number | null): Operator | null => (chainId === ARBITRUM_ONE ? intentsOperator() : operatorSetup());

/** ~/.lummy/testnet.env, khusus mesin dev di Arbitrum Sepolia. Produksi tidak pernah membacanya. */
function testnetFile(chainId: number): Record<string, string> {
  const file = path.join(os.homedir(), ".lummy", "testnet.env");
  if (process.env.NODE_ENV === "production" || chainId !== 421614 || !fs.existsSync(file)) return {};
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0 && !line.startsWith("#")) env[line.slice(0, eq)] = line.slice(eq + 1).trim();
  }
  return env;
}

/**
 * Kunci dari env. Nama `LUMMY_*`, atau nama yang sama dengan ~/.lummy/testnet.env supaya file itu bisa
 * diimpor langsung ke Vercel (tanpa DEPLOYER_PRIVATE_KEY dan SELLER_PRIVATE_KEY, yang tidak dibutuhkan
 * server). Di mesin dev tanpa env, dibaca dari file itu (khusus Arbitrum Sepolia).
 */
function loadKeys(chainId: number) {
  let operator = envOf("LUMMY_OPERATOR_KEY", "OPERATOR_PRIVATE_KEY");
  let buyer = envOf("LUMMY_BUYER_KEY", "BUYER_PRIVATE_KEY");
  let seller = envOf("LUMMY_SELLER_ADDRESS", "SELLER_ADDRESS");
  if (!operator || !buyer || !seller) {
    const env = testnetFile(chainId);
    operator ??= env.OPERATOR_PRIVATE_KEY;
    buyer ??= env.BUYER_PRIVATE_KEY;
    seller ??= env.SELLER_ADDRESS;
  }
  return operator && buyer && seller ? { operator, buyer, seller } : null;
}

/**
 * Akun yang menulis ke buku besar (lib/chain/ledger.ts): kunci khusus kalau ada, supaya nonce-nya tidak
 * pernah berebut dengan checkout escrow di instance server lain; kalau tidak ada, kunci operator escrow,
 * yang punya OPERATOR_ROLE di kedua kontrak.
 */
export function ledgerAccount(chainId: number): LocalAccount | null {
  const file = testnetFile(chainId);
  const key =
    envOf("LUMMY_LEDGER_KEY", "LEDGER_OPERATOR_PRIVATE_KEY") ??
    file.LEDGER_OPERATOR_PRIVATE_KEY ??
    envOf("LUMMY_OPERATOR_KEY", "OPERATOR_PRIVATE_KEY") ??
    file.OPERATOR_PRIVATE_KEY;
  return key ? privateKeyToAccount(key as Hex) : null;
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
    price: parseUnits(envOf("LUMMY_DEMO_PRICE_USDC") ?? "1", USDC_DECIMALS),
  };
}

/**
 * Siapa boleh memicu transaksi. "key": wajib header x-demo-key. "open": tanpa kunci, cuma di mesin dev.
 * "off": tidak ada kunci operator, atau produksi tanpa demo key. Gerbangnya sama dengan akun demo
 * (lib/demo-key.ts).
 */
export function writeMode(op: Operator | null): DemoMode {
  return op ? demoMode() : "off";
}

export function writeAllowed(req: Request, op: Operator): boolean {
  return writeMode(op) !== "off" && demoKeyAllowed(req);
}

// Satu antrean per kunci penandatangan per instance server: dua transaksi dari kunci yang sama tidak
// berebut nonce-nya. Buku besar dengan kunci khususnya punya antrean sendiri, jadi tidak menunggu di
// belakang checkout escrow (atau sebaliknya); tanpa kunci khusus ia ikut antrean operator.
const queues = new Map<string, Promise<unknown>>();
export function serial<T>(signer: Address, fn: () => Promise<T>): Promise<T> {
  const key = signer.toLowerCase();
  const run = (queues.get(key) ?? Promise.resolve()).then(fn, fn);
  queues.set(key, run.catch(() => undefined));
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

/** `at`: status di blok itu (riwayat membaca status dan log di blok yang sama). Tanpa itu, blok terbaru. */
export async function readListing(t: ChainTarget, id: Hex, at?: BlockRef): Promise<OnchainListing> {
  const pc = publicClient(t.chain, t.rpcUrl);
  const [L, window, block] = await Promise.all([getListing(pc, t.escrow, id, at?.number), readWindow(t), at ?? pc.getBlock()]);
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
/** ID listing di chain untuk satu pembelian. Bisa dihitung sebelum ada transaksi apa pun. */
export const onchainListingId = (tag: string) => keccak256(toHex(`lummy:listing:${tag}`));

/**
 * `signed`: pembeli dengan wallet sendiri (jalur USDC). Tanda tangannya sudah ada, untuk ID listing dan
 * nilai yang disepakati saat penahanan; tanpa itu, pembeli simulasi menandatangani `op.price`.
 */
export async function openOrder(
  op: Operator,
  eventEndsAt: number,
  ticket?: { barcodeKey: string | null; sha256: string | null },
  signed?: { tag: string; sig: FundSignature }
) {
  return serial(op.operator.address, async () => {
    const pc = publicClient(op.chain, op.rpcUrl);
    const price = signed ? signed.sig.value : op.price;
    if (!signed) {
      const balance = await pc.readContract({ address: op.token, abi: tokenAbi, functionName: "balanceOf", args: [op.buyer.address] });
      if (balance < op.price) {
        throw new Error(`USDC pembeli testnet tinggal ${formatUnits(balance, USDC_DECIMALS)}, butuh ${formatUnits(op.price, USDC_DECIMALS)}`);
      }
    }
    const as = escrowAs(pc, op.operator, op.chain, op.rpcUrl, op.escrow);
    const tag = signed?.tag ?? crypto.randomUUID();
    const id = onchainListingId(tag);
    // Tiket dari PDF asli: komitmennya diturunkan dari kunci set barcode (HMAC ber-pepper, di-hash
    // lagi supaya kunci di DB tidak terbit apa adanya), jadi kontrak sendiri yang menolak tiket yang
    // sama untuk kedua kalinya (keputusan A). Tiket contoh tidak punya barcode, jadi tetap acak.
    const commit = keccak256(toHex(ticket?.barcodeKey ? `lummy:barcode:${ticket.barcodeKey}` : `lummy:barcode:${tag}`));
    const create = await as.createListingFor(op.seller, id, price, commit, eventEndsAt);
    let fund: Awaited<ReturnType<typeof as.fund>>;
    try {
      const sig = signed?.sig ?? (await signFund({ pc, buyer: op.buyer, escrow: op.escrow, token: op.token, listingId: id, value: op.price }));
      fund = await as.fund(id, sig);
    } catch (e) {
      // Belum ada pembeli, jadi listing di chain dibatalkan supaya komitmennya lepas lagi; tanpa ini
      // tiket asli itu tidak akan pernah bisa dibeli lewat kontrak.
      await as.cancelListing(id).catch(() => undefined);
      throw e;
    }
    // Paket serah terima: surat kuasa, plus file tiketnya kalau ada, lewat sha256-nya. Siapa pun yang
    // memegang file bisa membuktikan file mana yang diserahkan (keputusan H).
    const handover = await as.markHandover(
      id,
      keccak256(toHex(ticket?.sha256 ? `lummy:serah-terima:${id}:${ticket.sha256}` : `lummy:surat-kuasa:${id}`))
    );
    return { listingId: id, price: price.toString(), txs: { create: create.hash, fund: fund.hash, handover: handover.hash } };
  });
}

/**
 * The payment reached this order's receiver: the operator creates the listing on the agreed terms, the
 * money goes into the escrow, and the handover is recorded. Each step is skipped when the chain says it
 * already happened, so a run cut off half way is finished by the next. The commitment is per order:
 * a refund keeps a commitment used, and shows abroad do not sell real barcodes yet (lib/payments/usdc).
 */
export async function openIntentOrder(op: Operator, order: IntentOrder, tag: string, ticketSha256: string | null, done: { create?: string; fund?: string; handover?: string }) {
  return serial(op.operator.address, async () => {
    const pc = publicClient(op.chain, op.rpcUrl);
    const as = escrowAs(pc, op.operator, op.chain, op.rpcUrl, op.escrow);
    const rail = intentsAs(pc, op.operator, op.chain, op.rpcUrl, op.factory!);
    const id = order.listingId;
    const txs = { ...done };
    let live = await getListing(pc, op.escrow, id);
    if (live.status === "None") {
      txs.create = (await as.createListingFor(order.seller, id, order.price, keccak256(toHex(`lummy:barcode:${tag}`)), order.eventEndsAt)).hash;
      live = await getListing(pc, op.escrow, id);
    }
    if (live.status === "Listed") {
      txs.fund = (await rail.deployAndFund(order)).hash;
      live = await getListing(pc, op.escrow, id);
    }
    if (live.status === "Funded") {
      txs.handover = (await as.markHandover(id, keccak256(toHex(ticketSha256 ? `lummy:serah-terima:${id}:${ticketSha256}` : `lummy:surat-kuasa:${id}`)))).hash;
    }
    return { listingId: id, price: order.price.toString(), txs };
  });
}

/** Money waiting in a receiver goes back to its refund address, deploying the receiver if need be. */
export async function sweepIntentReceiver(op: Operator, order: IntentOrder, receiver: Address) {
  return serial(op.operator.address, async () => {
    const pc = publicClient(op.chain, op.rpcUrl);
    const rail = intentsAs(pc, op.operator, op.chain, op.rpcUrl, op.factory!);
    if (!(await pc.getCode({ address: receiver }))) await rail.deploy(order);
    return (await rail.sweep(receiver)).hash;
  });
}

/** Listing yang dibuat tapi belum didanai dibatalkan, supaya komitmen barcode-nya lepas lagi. */
export async function cancelOnchainListing(op: Operator, id: Hex) {
  return serial(op.operator.address, async () => {
    const pc = publicClient(op.chain, op.rpcUrl);
    return (await escrowAs(pc, op.operator, op.chain, op.rpcUrl, op.escrow).cancelListing(id)).hash;
  });
}

/**
 * Dana yang teralokasi untuk penjual dan pembeli listing ini dikirim ke pemiliknya. Dipanggil di dalam
 * antrean operator. On the NEAR Intents rail the buyer is a receiver contract, so its share is swept:
 * the receiver collects it and passes it on to the refund address in one transaction.
 */
async function sendPending(op: Operator, pc: ReturnType<typeof publicClient>, as: ReturnType<typeof escrowAs>, id: Hex) {
  const L = await getListing(pc, op.escrow, id);
  const withdrawals: Hex[] = [];
  for (const who of [L.seller, L.buyer]) {
    if ((await pendingOf(pc, op.escrow, who)) <= BigInt(0)) continue;
    const sweep = op.factory && who === L.buyer;
    withdrawals.push(sweep ? (await intentsAs(pc, op.operator, op.chain, op.rpcUrl, op.factory!).sweep(who)).hash : (await as.withdrawFor(who)).hash);
  }
  return withdrawals;
}

/** Satu aksi penyelesaian, lalu dana yang teralokasi langsung dikirim ke pemiliknya (withdrawFor). */
export async function settle(op: Operator, id: Hex, action: SettleAction, toBuyer = BigInt(0)) {
  return serial(op.operator.address, async () => {
    const pc = publicClient(op.chain, op.rpcUrl);
    const as = escrowAs(pc, op.operator, op.chain, op.rpcUrl, op.escrow);
    const r =
      action === "dispute" ? await as.raiseDispute(id)
      : action === "resolve" ? await as.resolveDispute(id, toBuyer)
      : action === "release" ? await as.release(id)
      : await as.refund(id);
    const withdrawals = action === "dispute" ? [] : await sendPending(op, pc, as, id);
    return { tx: r.hash, withdrawals };
  });
}

/**
 * Dana yang masih tertahan untuk penjual dan pembeli listing ini dikirim ke pemiliknya, untuk
 * penyelesaian yang sudah dijalankan kontrak tapi pengirimannya gagal atau balasannya hilang.
 */
export async function payOut(op: Operator, id: Hex) {
  return serial(op.operator.address, async () => {
    const pc = publicClient(op.chain, op.rpcUrl);
    return sendPending(op, pc, escrowAs(pc, op.operator, op.chain, op.rpcUrl, op.escrow), id);
  });
}

/**
 * Acara diundur: jadwal selesai listing di chain dimundurkan. Kontrak menolak memajukan dan menolak
 * setelah window tutup (keputusan G). Jadwal yang sudah sejauh itu tidak dikirim lagi, jadi menekan
 * ulang aman. Hasilnya batas window baru menurut kontrak.
 */
export async function postpone(op: Operator, id: Hex, newEventEndsAt: number) {
  return serial(op.operator.address, async () => {
    const pc = publicClient(op.chain, op.rpcUrl);
    const L = await getListing(pc, op.escrow, id);
    let tx: Hex | null = null;
    if (L.eventEndsAt < newEventEndsAt) {
      tx = (await escrowAs(pc, op.operator, op.chain, op.rpcUrl, op.escrow).postponeEvent(id, newEventEndsAt)).hash;
    }
    const live = await readListing(op, id);
    return { tx, deadline: live.deadline };
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
