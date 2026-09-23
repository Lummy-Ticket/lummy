// Satu siklus escrow nyata, semua tx hash dicetak. Jalan di Anvil lokal atau Arbitrum Sepolia.
//   npm run chain:cycle -- --chain anvil|sepolia --path release|refund|dispute [--price 5]
// Anvil memakai akun bawaan (mnemonic test publik). Sepolia membaca ~/.lummy/testnet.env.
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
import { tokenAbi } from "../src/lib/chain/abi";
import { signFund } from "../src/lib/chain/buyer";
import { explorerTx, RPC_URLS, USDC_DECIMALS } from "../src/lib/chain/config";
import { escrowAs, getListing, pendingOf, publicClient, type Receipt } from "../src/lib/chain/escrow";

type PathName = "release" | "refund" | "dispute";
type Roles = { operator: LocalAccount; seller: LocalAccount; buyer: LocalAccount };
type Deployment = { escrow: Address; token: Address; mockToken: boolean; disputeWindow: number };

const ANVIL_MNEMONIC = "test test test test test test test test test test test junk";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const chain = arg("chain", "anvil") === "sepolia" ? arbitrumSepolia : foundry;
const pathName = arg("path", "release") as PathName;
const rpcUrl = process.env.RPC_URL ?? RPC_URLS[chain.id];
const price = parseUnits(arg("price", "5"), USDC_DECIMALS);
const usdc = (v: bigint) => formatUnits(v, USDC_DECIMALS);
const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

function loadRoles(): Roles {
  if (chain.id === foundry.id) {
    const at = (i: number) => mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: i });
    return { operator: at(1), seller: at(2), buyer: at(3) };
  }
  const file = path.join(os.homedir(), ".lummy", "testnet.env");
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0 && !line.startsWith("#")) env[line.slice(0, eq)] = line.slice(eq + 1).trim();
  }
  const key = (role: string) => privateKeyToAccount(env[`${role}_PRIVATE_KEY`] as Hex);
  return { operator: key("OPERATOR"), seller: key("SELLER"), buyer: key("BUYER") };
}

async function main() {
  const pc = publicClient(chain, rpcUrl);
  const actual = await pc.getChainId();
  if (actual !== chain.id) throw new Error(`RPC ${rpcUrl} ada di chain ${actual}, bukan ${chain.id}`);

  const deployFile = path.resolve(__dirname, "../../contracts/deployments", `${chain.id}.json`);
  if (!fs.existsSync(deployFile)) throw new Error(`belum ada deployment untuk chain ${chain.id}: ${deployFile}`);
  const dep = JSON.parse(fs.readFileSync(deployFile, "utf8")) as Deployment;
  const roles = loadRoles();
  const as = (a: LocalAccount) => escrowAs(pc, a, chain, rpcUrl, dep.escrow);
  const seller = as(roles.seller);
  const operator = as(roles.operator);
  const buyer = as(roles.buyer);

  if (chain.id !== foundry.id) {
    for (const [role, a] of Object.entries(roles)) {
      if ((await pc.getBalance({ address: a.address })) === BigInt(0)) {
        throw new Error(`${role} ${a.address} belum punya ETH testnet untuk gas`);
      }
    }
  }

  const balanceOf = (a: Address) =>
    pc.readContract({ address: dep.token, abi: tokenAbi, functionName: "balanceOf", args: [a] });

  const rows: string[] = [];
  const explorer = (r: Receipt) => explorerTx(chain.id, r.hash);
  function step(no: number, label: string, who: string, r?: Receipt, note = "") {
    const tx = r ? `${short(r.hash)}  gas ${r.gasUsed.toLocaleString("id-ID")}` : "(off-chain, tanpa gas)";
    const line = `${String(no).padStart(2)}  ${label.padEnd(22)}${who.padEnd(20)}${tx}${note ? `  ${note}` : ""}`;
    rows.push(line + (r && explorer(r) ? `\n      ${explorer(r)}` : ""));
    console.log(line);
  }

  // Sisa alokasi dari siklus lama bikin selisih saldo menyesatkan, jadi ditarik dulu.
  for (const w of [seller, buyer]) {
    if ((await pendingOf(pc, dep.escrow, w.address)) > BigInt(0)) await w.withdraw();
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

  const sellerBefore = await balanceOf(roles.seller.address);
  const buyerBefore = await balanceOf(roles.buyer.address);
  const tag = crypto.randomUUID();
  const id = keccak256(toHex(`listing:${tag}`));
  const commit = keccak256(toHex(`barcode-demo:${tag}`));

  console.log(`\nSiklus "${pathName}" di ${chain.name} (${chain.id}), harga ${usdc(price)} USDC`);
  console.log(`escrow ${dep.escrow}  window ${dep.disputeWindow} detik\n`);

  let n = 1;
  step(n++, "createListing", "seller", await seller.createListing(id, price, commit));
  const sig = await signFund({ pc, buyer: roles.buyer, escrow: dep.escrow, token: dep.token, listingId: id, value: price });
  step(n++, "tanda tangan pembeli", "pembeli");
  step(n++, "fund", "operator (relayer)", await operator.fund(id, sig), `terkunci ${usdc(price)} USDC`);

  let expectSeller = BigInt(0);
  let expectBuyer = -price;

  if (pathName === "refund") {
    step(n++, "refund", "operator", await operator.refund(id));
    step(n++, "withdraw", "pembeli", await buyer.withdraw());
    expectBuyer = BigInt(0);
  } else {
    step(n++, "markHandover", "seller", await seller.markHandover(id));
    if (pathName === "dispute") {
      const back = price / BigInt(2);
      step(n++, "raiseDispute", "pembeli", await buyer.raiseDispute(id));
      step(n++, "resolveDispute", "operator", await operator.resolveDispute(id, back), `pembeli ${usdc(back)}, seller ${usdc(price - back)}`);
      step(n++, "withdraw", "pembeli", await buyer.withdraw());
      step(n++, "withdraw", "seller", await seller.withdraw());
      expectSeller = price - back;
      expectBuyer = -price + back;
    } else {
      await skipWindow(pc, id, dep);
      step(n++, "lompat window", chain.id === foundry.id ? "anvil" : "tunggu", undefined, `${dep.disputeWindow + 1} detik`);
      const caller = await releaseCaller(roles);
      step(n++, "release", caller.label, await as(caller.account).release(id), "siapa pun boleh memanggil");
      step(n++, "withdraw", "seller", await seller.withdraw());
      expectSeller = price;
    }
  }

  const L = await getListing(pc, dep.escrow, id);
  const sellerDelta = (await balanceOf(roles.seller.address)) - sellerBefore;
  const buyerDelta = (await balanceOf(roles.buyer.address)) - buyerBefore;
  const ok = sellerDelta === expectSeller && buyerDelta === expectBuyer;
  console.log(`\nStatus akhir: ${L.status}${L.disputed ? " (disengketakan)" : ""}`);
  console.log(`Seller ${sellerDelta >= BigInt(0) ? "+" : ""}${usdc(sellerDelta)} USDC, pembeli ${buyerDelta >= BigInt(0) ? "+" : ""}${usdc(buyerDelta)} USDC -> ${ok ? "COCOK" : "TIDAK COCOK"} dengan yang diharapkan`);
  if (chain.id !== foundry.id) console.log("\n" + rows.join("\n"));
  if (!ok) process.exit(1);
}

async function skipWindow(pc: ReturnType<typeof publicClient>, id: Hex, dep: Deployment) {
  const { handoverAt } = await getListing(pc, dep.escrow, id);
  const deadline = BigInt(handoverAt + dep.disputeWindow);
  if (chain.id === foundry.id) {
    const test = createTestClient({ mode: "anvil", chain: foundry, transport: http(rpcUrl) });
    await test.increaseTime({ seconds: dep.disputeWindow + 1 });
    await test.mine({ blocks: 1 });
    return;
  }
  for (;;) {
    const now = (await pc.getBlock()).timestamp;
    if (now > deadline) return;
    console.log(`    menunggu window: ${deadline - now + BigInt(1)} detik lagi`);
    await new Promise((r) => setTimeout(r, Math.min(30, Number(deadline - now) + 2) * 1000));
  }
}

/** Di Anvil pakai alamat acak supaya terbukti siapa pun bisa. Di testnet pakai operator, yang punya gas. */
async function releaseCaller(roles: Roles): Promise<{ account: LocalAccount; label: string }> {
  if (chain.id !== foundry.id) return { account: roles.operator, label: "operator" };
  const account = privateKeyToAccount(generatePrivateKey());
  const test = createTestClient({ mode: "anvil", chain: foundry, transport: http(rpcUrl) });
  await test.setBalance({ address: account.address, value: parseEther("1") });
  return { account, label: "alamat acak" };
}

main().catch((e: unknown) => {
  const err = e as { shortMessage?: string; message?: string };
  console.error("\nGAGAL: " + (err.shortMessage ?? err.message ?? String(e)));
  process.exit(1);
});
