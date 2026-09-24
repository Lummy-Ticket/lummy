// Satu siklus escrow nyata, semua tx hash dicetak. Jalan di Anvil lokal atau Arbitrum Sepolia.
//   npm run chain:cycle -- --chain anvil|sepolia --path release|refund|dispute [--price 5] [--event-in 0] [--fork]
// Model A: operator mengirim semua transaksi atas nama seller dan pembeli, jadi cuma operator yang
// butuh ETH. Pembeli cuma menandatangani (tanpa gas), seller cuma punya alamat.
// Anvil memakai akun bawaan (mnemonic test publik). Sepolia membaca ~/.lummy/testnet.env.
// --fork: Anvil yang mem-fork chain itu (npm run chain:fork), jadi lompat waktu tetap dipakai.
// Kunci bisa dioper lewat env CYCLE_OPERATOR_KEY, CYCLE_BUYER_KEY, dan CYCLE_SELLER (dipakai chain:fork).
import fs from "fs";
import os from "os";
import path from "path";
import {
  createTestClient,
  createWalletClient,
  formatUnits,
  http,
  keccak256,
  parseEther,
  parseUnits,
  toHex,
  type Address,
  type Hex,
  type LocalAccount,
} from "viem";
import { generatePrivateKey, mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia, foundry } from "viem/chains";
import { escrowAbi, tokenAbi } from "../src/lib/chain/abi";
import { signFund } from "../src/lib/chain/buyer";
import { explorerTx, RPC_URLS, USDC_DECIMALS } from "../src/lib/chain/config";
import { disputeDeadline, escrowAs, getListing, pendingOf, publicClient, type Receipt } from "../src/lib/chain/escrow";

type PathName = "release" | "refund" | "dispute";
type Roles = { operator: LocalAccount; buyer: LocalAccount; seller: Address };
type Deployment = { escrow: Address; token: Address; mockToken: boolean; disputeWindow: number };

const ANVIL_MNEMONIC = "test test test test test test test test test test test junk";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const chain = arg("chain", "anvil") === "sepolia" ? arbitrumSepolia : foundry;
const fork = process.argv.includes("--fork");
const local = chain.id === foundry.id || fork; // node Anvil: akun bawaan, waktu bisa dilompati
const pathName = arg("path", "release") as PathName;
const rpcUrl = process.env.RPC_URL ?? (fork ? "http://127.0.0.1:8546" : RPC_URLS[chain.id]);
const price = parseUnits(arg("price", "5"), USDC_DECIMALS);
const eventIn = Number(arg("event-in", "0")); // detik dari sekarang sampai acara selesai
const usdc = (v: bigint) => formatUnits(v, USDC_DECIMALS);
const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

function loadRoles(): Roles {
  const { CYCLE_OPERATOR_KEY, CYCLE_BUYER_KEY, CYCLE_SELLER } = process.env;
  if (CYCLE_OPERATOR_KEY && CYCLE_BUYER_KEY && CYCLE_SELLER) {
    return {
      operator: privateKeyToAccount(CYCLE_OPERATOR_KEY as Hex),
      buyer: privateKeyToAccount(CYCLE_BUYER_KEY as Hex),
      seller: CYCLE_SELLER as Address,
    };
  }
  if (local) {
    const at = (i: number) => mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: i });
    return { operator: at(1), seller: at(2).address, buyer: at(3) };
  }
  const file = path.join(os.homedir(), ".lummy", "testnet.env");
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0 && !line.startsWith("#")) env[line.slice(0, eq)] = line.slice(eq + 1).trim();
  }
  const key = (role: string) => privateKeyToAccount(env[`${role}_PRIVATE_KEY`] as Hex);
  const seller = (env.SELLER_ADDRESS as Address | undefined) ?? key("SELLER").address;
  return { operator: key("OPERATOR"), seller, buyer: key("BUYER") };
}

async function main() {
  const pc = publicClient(chain, rpcUrl);
  const actual = await pc.getChainId();
  if (actual !== chain.id) throw new Error(`RPC ${rpcUrl} ada di chain ${actual}, bukan ${chain.id}`);

  const deployName = fork ? `fork-${chain.id}` : String(chain.id);
  const deployFile = path.resolve(__dirname, "../../contracts/deployments", `${deployName}.json`);
  if (!fs.existsSync(deployFile)) throw new Error(`belum ada deployment ${deployName}: ${deployFile}`);
  const dep = JSON.parse(fs.readFileSync(deployFile, "utf8")) as Deployment;
  const roles = loadRoles();
  const op = escrowAs(pc, roles.operator, chain, rpcUrl, dep.escrow);

  const role = await pc.readContract({ address: dep.escrow, abi: escrowAbi, functionName: "OPERATOR_ROLE" });
  const isOperator = await pc.readContract({
    address: dep.escrow,
    abi: escrowAbi,
    functionName: "hasRole",
    args: [role, roles.operator.address],
  });
  if (!isOperator) throw new Error(`${roles.operator.address} bukan operator di escrow ${dep.escrow}`);

  const balanceOf = (a: Address) =>
    pc.readContract({ address: dep.token, abi: tokenAbi, functionName: "balanceOf", args: [a] });

  if (!local && (await pc.getBalance({ address: roles.operator.address })) === BigInt(0)) {
    throw new Error(`operator ${roles.operator.address} belum punya ETH testnet untuk gas`);
  }
  if (!dep.mockToken && (await balanceOf(roles.buyer.address)) < price) {
    throw new Error(`pembeli ${roles.buyer.address} kurang USDC, ambil di https://faucet.circle.com`);
  }

  const rows: string[] = [];
  let gasTotal = BigInt(0);
  const explorer = (r: Receipt) => explorerTx(chain.id, r.hash);
  function step(no: number, label: string, who: string, r?: Receipt, note = "") {
    if (r) gasTotal += r.gasUsed;
    const tx = r ? `${short(r.hash)}  gas ${r.gasUsed.toLocaleString("id-ID")}` : "(off-chain, tanpa gas)";
    const line = `${String(no).padStart(2)}  ${label.padEnd(20)}${who.padEnd(28)}${tx}${note ? `  ${note}` : ""}`;
    rows.push(line + (r && explorer(r) ? `\n      ${explorer(r)}` : ""));
    console.log(line);
  }

  // Sisa alokasi dari siklus lama bikin selisih saldo menyesatkan, jadi dikirim dulu ke pemiliknya.
  for (const who of [roles.seller, roles.buyer.address]) {
    if ((await pendingOf(pc, dep.escrow, who)) > BigInt(0)) await op.withdrawFor(who);
  }

  if (dep.mockToken && (await balanceOf(roles.buyer.address)) < price) {
    const minter = createWalletClient({ account: roles.operator, chain, transport: http(rpcUrl) });
    const hash = await minter.writeContract({
      address: dep.token,
      abi: tokenAbi,
      functionName: "mint",
      args: [roles.buyer.address, price * BigInt(10)],
    });
    await pc.waitForTransactionReceipt({ hash });
  }

  const sellerBefore = await balanceOf(roles.seller);
  const buyerBefore = await balanceOf(roles.buyer.address);
  const tag = crypto.randomUUID();
  const id = keccak256(toHex(`listing:${tag}`));
  const commit = keccak256(toHex(`barcode-demo:${tag}`));
  const handoverHash = keccak256(toHex(`surat-kuasa:${tag}`));
  const eventEndsAt = Number((await pc.getBlock()).timestamp) + eventIn;

  console.log(`\nSiklus "${pathName}" di ${chain.name} (${chain.id})${fork ? " versi fork lokal" : ""}, harga ${usdc(price)} USDC`);
  console.log(`escrow ${dep.escrow}  window ${dep.disputeWindow} detik  acara selesai +${eventIn} detik\n`);

  let n = 1;
  step(n++, "createListingFor", "operator (atas nama seller)", await op.createListingFor(roles.seller, id, price, commit, eventEndsAt));
  const sig = await signFund({ pc, buyer: roles.buyer, escrow: dep.escrow, token: dep.token, listingId: id, value: price });
  step(n++, "tanda tangan", "pembeli");
  step(n++, "fund", "operator (relayer)", await op.fund(id, sig), `terkunci ${usdc(price)} USDC`);

  let expectSeller = BigInt(0);
  let expectBuyer = -price;

  if (pathName === "refund") {
    step(n++, "refund", "operator", await op.refund(id));
    step(n++, "withdrawFor", "operator -> pembeli", await op.withdrawFor(roles.buyer.address));
    expectBuyer = BigInt(0);
  } else {
    step(n++, "markHandover", "operator (atas nama seller)", await op.markHandover(id, handoverHash), "hash surat kuasa tercatat");
    if (pathName === "dispute") {
      const back = price / BigInt(2);
      step(n++, "raiseDispute", "operator (atas nama pembeli)", await op.raiseDispute(id));
      step(n++, "resolveDispute", "operator", await op.resolveDispute(id, back), `pembeli ${usdc(back)}, seller ${usdc(price - back)}`);
      step(n++, "withdrawFor", "operator -> pembeli", await op.withdrawFor(roles.buyer.address));
      step(n++, "withdrawFor", "operator -> seller", await op.withdrawFor(roles.seller));
      expectSeller = price - back;
      expectBuyer = -price + back;
    } else {
      const waited = await skipWindow(pc, id, dep);
      step(n++, "lompat window", local ? "anvil" : "tunggu", undefined, `${waited} detik`);
      const caller = await releaseCaller(roles);
      step(n++, "release", caller.label, await escrowAs(pc, caller.account, chain, rpcUrl, dep.escrow).release(id), "siapa pun boleh memanggil");
      step(n++, "withdrawFor", "operator -> seller", await op.withdrawFor(roles.seller));
      expectSeller = price;
    }
  }

  const L = await getListing(pc, dep.escrow, id);
  const sellerDelta = (await balanceOf(roles.seller)) - sellerBefore;
  const buyerDelta = (await balanceOf(roles.buyer.address)) - buyerBefore;
  const ok = sellerDelta === expectSeller && buyerDelta === expectBuyer;
  console.log(`\nStatus akhir: ${L.status}${L.disputed ? " (disengketakan)" : ""}`);
  console.log(`Seller ${sellerDelta >= BigInt(0) ? "+" : ""}${usdc(sellerDelta)} USDC, pembeli ${buyerDelta >= BigInt(0) ? "+" : ""}${usdc(buyerDelta)} USDC -> ${ok ? "COCOK" : "TIDAK COCOK"} dengan yang diharapkan`);
  console.log(`Total gas siklus ini: ${gasTotal.toLocaleString("id-ID")}`);
  if (!local) console.log("\n" + rows.join("\n"));
  if (!ok) process.exit(1);
}

/** Tunggu sampai window lewat. Di Anvil waktunya dilompati, di testnet ditunggu betulan. */
async function skipWindow(pc: ReturnType<typeof publicClient>, id: Hex, dep: Deployment): Promise<number> {
  const deadline = BigInt(disputeDeadline(await getListing(pc, dep.escrow, id), dep.disputeWindow));
  const start = (await pc.getBlock()).timestamp;
  if (local) {
    const test = createTestClient({ mode: "anvil", chain, transport: http(rpcUrl) });
    const seconds = Number(deadline - start + BigInt(1));
    await test.increaseTime({ seconds });
    await test.mine({ blocks: 1 });
    return seconds;
  }
  for (;;) {
    // RPC publik kadang timeout. Selama menunggu, satu bacaan gagal cukup diulang, bukan alasan berhenti.
    const now = await pc
      .getBlock()
      .then((b) => b.timestamp)
      .catch(() => null);
    if (now === null) {
      console.log("    RPC gagal membaca blok, coba lagi");
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    if (now > deadline) return Number(now - start);
    console.log(`    menunggu window: ${deadline - now + BigInt(1)} detik lagi`);
    await new Promise((r) => setTimeout(r, Math.min(30, Number(deadline - now) + 2) * 1000));
  }
}

/** Di Anvil pakai alamat acak supaya terbukti siapa pun bisa. Di testnet pakai operator, yang punya gas. */
async function releaseCaller(roles: Roles): Promise<{ account: LocalAccount; label: string }> {
  if (!local) return { account: roles.operator, label: "operator" };
  const account = privateKeyToAccount(generatePrivateKey());
  const test = createTestClient({ mode: "anvil", chain, transport: http(rpcUrl) });
  await test.setBalance({ address: account.address, value: parseEther("1") });
  return { account, label: "alamat acak" };
}

main().catch((e: unknown) => {
  const err = e as { shortMessage?: string; message?: string };
  console.error("\nGAGAL: " + (err.shortMessage ?? err.message ?? String(e)));
  process.exit(1);
});
