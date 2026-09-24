// Kembalikan USDC testnet dari wallet seller ke wallet pembeli simulasi, supaya demo bisa berputar
// tanpa faucet. Seller cuma menandatangani otorisasi ERC-3009 (tanpa gas), operator yang mengirim.
//   npm run chain:recycle [-- --amount 5]      (tanpa --amount: seluruh saldo seller)
// Membaca ~/.lummy/testnet.env. Khusus Arbitrum Sepolia.
import fs from "fs";
import os from "os";
import path from "path";
import { bytesToHex, createWalletClient, formatUnits, http, parseAbi, parseUnits, type Hex } from "viem";
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
  const seller = privateKeyToAccount(e.SELLER_PRIVATE_KEY as Hex);
  const operator = privateKeyToAccount(e.OPERATOR_PRIVATE_KEY as Hex);
  const buyer = e.BUYER_ADDRESS as Hex;
  const pc = publicClient(chain, rpcUrl);

  const read = (functionName: "name" | "version") => pc.readContract({ address: token, abi: fiatTokenAbi, functionName });
  const balanceOf = (a: Hex) => pc.readContract({ address: token, abi: fiatTokenAbi, functionName: "balanceOf", args: [a] });

  const available = await balanceOf(seller.address);
  const i = process.argv.indexOf("--amount");
  const value = i > 0 ? parseUnits(process.argv[i + 1], USDC_DECIMALS) : available;
  if (value === BigInt(0) || value > available) {
    throw new Error(`saldo seller ${formatUnits(available, USDC_DECIMALS)} USDC, tidak cukup untuk ${formatUnits(value, USDC_DECIMALS)}`);
  }

  const now = (await pc.getBlock()).timestamp;
  const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const message = { from: seller.address, to: buyer, value, validAfter: BigInt(0), validBefore: now + BigInt(3600), nonce };
  const signature = await seller.signTypedData({
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
  console.log(`${formatUnits(value, USDC_DECIMALS)} USDC dari seller ke pembeli, dikirim operator: https://sepolia.arbiscan.io/tx/${hash}`);
  console.log(`saldo pembeli sekarang ${formatUnits(await balanceOf(buyer), USDC_DECIMALS)} USDC`);
}

main().catch((err: unknown) => {
  const x = err as { shortMessage?: string; message?: string };
  console.error("GAGAL: " + (x.shortMessage ?? x.message ?? String(err)));
  process.exit(1);
});
