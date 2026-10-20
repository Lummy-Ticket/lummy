// Kembalikan USDC testnet dari wallet seller ke wallet pembeli simulasi, supaya demo bisa berputar
// tanpa faucet. Seller cuma menandatangani otorisasi ERC-3009 (tanpa gas), operator yang mengirim.
// Dengan --from dan --to, dari pembeli atau seller ke alamat mana pun: wallet demo tim diisi dari
// sini, bukan dari faucet, dan penerimanya tidak butuh ETH.
//   npm run chain:recycle [-- --amount 5]      (tanpa --amount: seluruh saldo seller)
//   npm run chain:recycle -- --from buyer --to 0xAlamatWalletDemo --amount 5
// Membaca ~/.lummy/testnet.env. Khusus Arbitrum Sepolia.
import fs from "fs";
import os from "os";
import path from "path";
import { bytesToHex, createWalletClient, formatUnits, http, isAddress, parseAbi, parseUnits, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { RPC_URLS, USDC_DECIMALS } from "../src/lib/chain/config";
import { DEPLOYMENTS } from "../src/lib/chain/deployments";
import { publicClient } from "../src/lib/chain/escrow";

const fiatTokenAbi = parseAbi([
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature)",
]);

function env(): Record<string, string> {
  const out: Record<string, string> = {};
  const file = path.join(os.homedir(), ".lummy", "testnet.env");
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0 && !line.startsWith("#")) out[line.slice(0, eq)] = line.slice(eq + 1).trim();
  }
  return out;
}

async function main() {
  const e = env();
  const chain = arbitrumSepolia;
  const rpcUrl = process.env.RPC_URL ?? RPC_URLS[chain.id];
  const token = DEPLOYMENTS[chain.id]?.token;
  if (!token) throw new Error("belum ada deployment Arbitrum Sepolia di deployments.ts");
  const arg = (name: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const fromName = arg("from") ?? "seller";
  if (fromName !== "seller" && fromName !== "buyer") throw new Error("--from harus seller atau buyer");
  const signer = privateKeyToAccount((fromName === "seller" ? e.SELLER_PRIVATE_KEY : e.BUYER_PRIVATE_KEY) as Hex);
  const operator = privateKeyToAccount(e.OPERATOR_PRIVATE_KEY as Hex);
  const toArg = arg("to") ?? "buyer";
  const to = (toArg === "buyer" ? e.BUYER_ADDRESS : toArg === "seller" ? e.SELLER_ADDRESS : toArg) as Hex;
  if (!isAddress(to)) throw new Error(`--to bukan alamat: ${toArg}`);
  if (to.toLowerCase() === signer.address.toLowerCase()) throw new Error("pengirim dan penerima sama");
  const toName = toArg === "buyer" || toArg === "seller" ? toArg : `${to.slice(0, 6)}…${to.slice(-4)}`;
  const pc = publicClient(chain, rpcUrl);

  const read = (functionName: "name" | "version") => pc.readContract({ address: token, abi: fiatTokenAbi, functionName });
  const balanceOf = (a: Hex) => pc.readContract({ address: token, abi: fiatTokenAbi, functionName: "balanceOf", args: [a] });

  const available = await balanceOf(signer.address);
  const amount = arg("amount");
  const value = amount ? parseUnits(amount, USDC_DECIMALS) : available;
  if (value === BigInt(0) || value > available) {
    throw new Error(`saldo ${fromName} ${formatUnits(available, USDC_DECIMALS)} USDC, tidak cukup untuk ${formatUnits(value, USDC_DECIMALS)}`);
  }

  const now = (await pc.getBlock()).timestamp;
  const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const message = { from: signer.address, to, value, validAfter: BigInt(0), validBefore: now + BigInt(3600), nonce };
  const signature = await signer.signTypedData({
    domain: { name: await read("name"), version: await read("version"), chainId: chain.id, verifyingContract: token },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message,
  });

  const wallet = createWalletClient({ account: operator, chain, transport: http(rpcUrl) });
  const hash = await wallet.writeContract({
    address: token,
    abi: fiatTokenAbi,
    functionName: "transferWithAuthorization",
    args: [message.from, message.to, message.value, message.validAfter, message.validBefore, message.nonce, signature],
  });
  const r = await pc.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`tx ${hash} revert`);
  console.log(`${formatUnits(value, USDC_DECIMALS)} USDC dari ${fromName} ke ${toName}, dikirim operator: https://sepolia.arbiscan.io/tx/${hash}`);
  console.log(`saldo ${toName} sekarang ${formatUnits(await balanceOf(to), USDC_DECIMALS)} USDC`);
}

main().catch((err: unknown) => {
  const x = err as { shortMessage?: string; message?: string };
  console.error("GAGAL: " + (x.shortMessage ?? x.message ?? String(err)));
  process.exit(1);
});
