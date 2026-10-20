// Saldo ETH dan USDC testnet tiap alamat di ~/.lummy/testnet.env (cuma baris *_ADDRESS yang dibaca,
// tidak ada kunci), plus alamat lain yang diberikan, misalnya wallet demo tim. Dicek sebelum demo:
// operator yang gasnya di bawah 0,002 ETH berhenti mencatat buku besar (lib/orders/ledger.ts),
// dan pembeli simulasi butuh USDC untuk checkout testnet. Khusus Arbitrum Sepolia, baca saja.
//   npm run chain:balances [-- 0xAlamatLain ...]
import fs from "fs";
import os from "os";
import path from "path";
import { formatEther, formatUnits, isAddress, parseAbi, parseEther, type Address } from "viem";
import { arbitrumSepolia } from "viem/chains";
import { RPC_URLS, USDC_DECIMALS } from "../src/lib/chain/config";
import { DEPLOYMENTS } from "../src/lib/chain/deployments";
import { publicClient } from "../src/lib/chain/escrow";

const GAS_FLOOR = parseEther("0.002");
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);

function addresses(): [string, Address][] {
  const file = path.join(os.homedir(), ".lummy", "testnet.env");
  const out: [string, Address][] = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Z_]*ADDRESS[A-Z_]*)=(0x[0-9a-fA-F]{40})\s*$/.exec(line.trim());
    if (m) out.push([m[1].replace(/_ADDRESS$/, "").toLowerCase(), m[2] as Address]);
  }
  for (const a of process.argv.slice(2)) {
    if (!isAddress(a)) throw new Error(`bukan alamat: ${a}`);
    out.push(["lain", a]);
  }
  return out;
}

async function main() {
  const chain = arbitrumSepolia;
  const token = DEPLOYMENTS[chain.id]?.token;
  if (!token) throw new Error("belum ada deployment Arbitrum Sepolia di deployments.ts");
  const pc = publicClient(chain, process.env.RPC_URL ?? RPC_URLS[chain.id]);
  const warnings: string[] = [];
  for (const [name, a] of addresses()) {
    const [eth, usdc] = await Promise.all([pc.getBalance({ address: a }), pc.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [a] })]);
    console.log(`${name.padEnd(16)} ${a.slice(0, 6)}…${a.slice(-4)}  ${formatEther(eth).slice(0, 8).padStart(8)} ETH  ${formatUnits(usdc, USDC_DECIMALS).padStart(10)} USDC`);
    if (/operator/.test(name) && eth < GAS_FLOOR) warnings.push(`${name}: gas di bawah 0,002 ETH, isi dari faucet Arbitrum Sepolia`);
    if (name === "buyer" && usdc < BigInt(5 * 10 ** USDC_DECIMALS)) warnings.push("buyer: USDC di bawah 5, jalankan npm run chain:recycle atau isi dari faucet Circle");
  }
  console.log(warnings.length ? `\nperlu diisi:\n  ${warnings.join("\n  ")}` : "\nsemua cukup untuk demo");
}

main().catch((err: unknown) => {
  const x = err as { shortMessage?: string; message?: string };
  console.error("GAGAL: " + (x.shortMessage ?? x.message ?? String(err)));
  process.exit(1);
});
