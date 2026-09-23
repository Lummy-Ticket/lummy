// Salin ABI dari artefak Foundry ke web, supaya kontrak dan kode web tidak pernah beda versi.
// Sekalian alamat deployment chain publik untuk aplikasi. Jalankan setelah `forge build`:
//   npm run chain:abi
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACTS = path.resolve(WEB, "../contracts");
const OUT_DIR = path.join(WEB, "src/lib/chain");
const HEADER = "// Dibuat oleh scripts/export-abi.mjs dari artefak Foundry. Jangan diedit manual.\n\n";

function artifactAbi(name) {
  const f = path.join(CONTRACTS, "out", `${name}.sol`, `${name}.json`);
  if (!fs.existsSync(f)) throw new Error(`artefak tidak ada: ${f}. Jalankan forge build di contracts/ dulu.`);
  return JSON.parse(fs.readFileSync(f, "utf8")).abi;
}

const escrowAbi = artifactAbi("LummyEscrow");
const tokenAbi = artifactAbi("MockUSDC");
fs.writeFileSync(
  path.join(OUT_DIR, "abi.ts"),
  HEADER +
    `export const escrowAbi = ${JSON.stringify(escrowAbi, null, 2)} as const;\n\n` +
    `export const tokenAbi = ${JSON.stringify(tokenAbi, null, 2)} as const;\n`,
);

// Cuma chain publik. Alamat Anvil (31337) berubah tiap jalan dan tidak boleh masuk bundle aplikasi.
const PUBLIC_CHAINS = new Set([421614, 42161]);
const dir = path.join(CONTRACTS, "deployments");
const deployments = {};
for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
  const chainId = Number(path.basename(f, ".json"));
  if (!PUBLIC_CHAINS.has(chainId)) continue;
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  deployments[chainId] = {
    escrow: d.escrow,
    token: d.token,
    mockToken: d.mockToken,
    disputeWindow: Number(d.disputeWindow),
  };
}
fs.writeFileSync(
  path.join(OUT_DIR, "deployments.ts"),
  HEADER +
    'import type { Address } from "viem";\n\n' +
    "export type Deployment = { escrow: Address; token: Address; mockToken: boolean; disputeWindow: number };\n\n" +
    `export const DEPLOYMENTS: Partial<Record<number, Deployment>> = ${JSON.stringify(deployments, null, 2)};\n`,
);

console.log(`abi.ts: escrow ${escrowAbi.length} entri, token ${tokenAbi.length} entri | deployments.ts: ${Object.keys(deployments).length} chain publik`);
