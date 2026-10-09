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
const ledgerAbi = artifactAbi("LummyLedger");
fs.writeFileSync(
  path.join(OUT_DIR, "abi.ts"),
  HEADER +
    `export const escrowAbi = ${JSON.stringify(escrowAbi, null, 2)} as const;\n\n` +
    `export const tokenAbi = ${JSON.stringify(tokenAbi, null, 2)} as const;\n\n` +
    `export const ledgerAbi = ${JSON.stringify(ledgerAbi, null, 2)} as const;\n`,
);

/**
 * Blok tempat kontrak di-deploy, dari rekaman broadcast Foundry yang ikut di-commit. Riwayatnya
 * dibaca mulai dari blok ini, jadi pencarian log tidak perlu mulai dari genesis.
 */
function deployBlockOf(chainId, address, script = "Deploy.s.sol", contractName = "LummyEscrow") {
  const f = path.join(CONTRACTS, "broadcast", script, String(chainId), "run-latest.json");
  if (!fs.existsSync(f)) return undefined;
  const run = JSON.parse(fs.readFileSync(f, "utf8"));
  const tx = (run.transactions ?? []).find(
    (t) => t.contractName === contractName && t.contractAddress?.toLowerCase() === address.toLowerCase(),
  );
  const receipt = tx && (run.receipts ?? []).find((r) => r.transactionHash === tx.hash);
  return receipt ? Number(receipt.blockNumber) : undefined;
}

// Cuma chain publik. Alamat Anvil (31337) berubah tiap jalan dan tidak boleh masuk bundle aplikasi.
// deployments/<chainId>.json = escrow (Deploy.s.sol), deployments/ledger-<chainId>.json = buku besar
// pesanan QRIS (DeployLedger.s.sol).
const PUBLIC_CHAINS = new Set([421614, 42161]);
const dir = path.join(CONTRACTS, "deployments");
const deployments = {};
const ledgers = {};
for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
  const name = path.basename(f, ".json");
  const isLedger = name.startsWith("ledger-");
  const chainId = Number(isLedger ? name.slice("ledger-".length) : name);
  if (!PUBLIC_CHAINS.has(chainId)) continue;
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  if (isLedger) {
    ledgers[chainId] = {
      ledger: d.ledger,
      disputeWindow: Number(d.disputeWindow),
      deployBlock: deployBlockOf(chainId, d.ledger, "DeployLedger.s.sol", "LummyLedger"),
    };
    continue;
  }
  deployments[chainId] = {
    escrow: d.escrow,
    token: d.token,
    mockToken: d.mockToken,
    disputeWindow: Number(d.disputeWindow),
    deployBlock: deployBlockOf(chainId, d.escrow),
  };
}
fs.writeFileSync(
  path.join(OUT_DIR, "deployments.ts"),
  HEADER +
    'import type { Address } from "viem";\n\n' +
    "export type Deployment = { escrow: Address; token: Address; mockToken: boolean; disputeWindow: number; deployBlock?: number };\n\n" +
    "export type LedgerDeployment = { ledger: Address; disputeWindow: number; deployBlock?: number };\n\n" +
    `export const DEPLOYMENTS: Partial<Record<number, Deployment>> = ${JSON.stringify(deployments, null, 2)};\n\n` +
    `export const LEDGERS: Partial<Record<number, LedgerDeployment>> = ${JSON.stringify(ledgers, null, 2)};\n`,
);

console.log(
  `abi.ts: escrow ${escrowAbi.length}, token ${tokenAbi.length}, ledger ${ledgerAbi.length} entri | ` +
    `deployments.ts: ${Object.keys(deployments).length} escrow, ${Object.keys(ledgers).length} ledger di chain publik`,
);
