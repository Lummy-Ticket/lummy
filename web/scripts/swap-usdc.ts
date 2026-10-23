// Testnet USDC for the demo wallets without Circle's faucet, which is blocked on Luthfi's network:
// the deployer's Arbitrum Sepolia ETH is swapped for USDC on Uniswap (SwapRouter02, the WETH/USDC
// pool at 1%) and sent to the simulated buyer, from which chain:recycle fills the team's wallets.
// Without --send it only quotes every pool: on 23 Oct the 1% pool gave 0.65 USDC for 0.02 ETH, a
// thirtieth of the September rate, so look before swapping. Testnet only.
//   npm run chain:swap -- --eth 0.02                 (quotes only)
//   npm run chain:swap -- --eth 0.02 --fee 500 --send [--to 0xAddress]
// Reads ~/.lummy/testnet.env; the key is never printed.
import fs from "fs";
import os from "os";
import path from "path";
import { createWalletClient, formatEther, formatUnits, http, isAddress, parseAbi, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { RPC_URLS, USDC_DECIMALS } from "../src/lib/chain/config";
import { DEPLOYMENTS } from "../src/lib/chain/deployments";
import { publicClient } from "../src/lib/chain/escrow";

const ROUTER: Address = "0x101F443B4d1b059569D643917553c771E1b9663E";
const WETH: Address = "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73";
const FEES = [100, 500, 3000, 10_000];

const routerAbi = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
]);
const tokenAbi = parseAbi(["function balanceOf(address) view returns (uint256)"]);

function env(): Record<string, string> {
  const out: Record<string, string> = {};
  const file = path.join(os.homedir(), ".lummy", "testnet.env");
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0 && !line.startsWith("#")) out[line.slice(0, eq)] = line.slice(eq + 1).trim();
  }
  return out;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const e = env();
  if (!e.DEPLOYER_PRIVATE_KEY || !e.BUYER_PRIVATE_KEY) throw new Error("needs DEPLOYER_PRIVATE_KEY and BUYER_PRIVATE_KEY in ~/.lummy/testnet.env");
  const deployer = privateKeyToAccount(e.DEPLOYER_PRIVATE_KEY as Hex);
  const to = arg("to") ?? privateKeyToAccount(e.BUYER_PRIVATE_KEY as Hex).address;
  if (!isAddress(to)) throw new Error(`--to is not an address: ${to}`);
  const amountIn = parseEther(arg("eth") ?? "0.01");
  const usdc = DEPLOYMENTS[arbitrumSepolia.id]?.token as Address;
  const pc = publicClient(arbitrumSepolia, RPC_URLS[arbitrumSepolia.id]);
  const wc = createWalletClient({ account: deployer, chain: arbitrumSepolia, transport: http(RPC_URLS[arbitrumSepolia.id]) });

  const quote = (fee: number) =>
    pc.simulateContract({
      account: deployer,
      address: ROUTER,
      abi: routerAbi,
      functionName: "exactInputSingle",
      args: [{ tokenIn: WETH, tokenOut: usdc, fee, recipient: to, amountIn, amountOutMinimum: BigInt(0), sqrtPriceLimitX96: BigInt(0) }],
      value: amountIn,
    });
  if (!process.argv.includes("--send")) {
    for (const fee of FEES) {
      const q = await quote(fee).then((r) => `${formatUnits(r.result, USDC_DECIMALS)} USDC`, () => "no pool");
      console.log(`fee ${fee / 10_000}%: ${formatEther(amountIn)} ETH -> ${q}`);
    }
    console.log("nothing sent; add --fee and --send to swap");
    return;
  }
  const fee = Number(arg("fee") ?? 10_000);
  const before = await pc.readContract({ address: usdc, abi: tokenAbi, functionName: "balanceOf", args: [to] });
  const { request, result } = await quote(fee);
  console.log(`swapping ${formatEther(amountIn)} ETH from the deployer: about ${formatUnits(result, USDC_DECIMALS)} USDC to ${to}`);
  // Never less than nine tenths of what the pool quoted a moment ago.
  const hash = await wc.writeContract({ ...request, args: [{ ...request.args[0], amountOutMinimum: (result * BigInt(9)) / BigInt(10) }] });
  const receipt = await pc.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`swap reverted: ${hash}`);
  const after = await pc.readContract({ address: usdc, abi: tokenAbi, functionName: "balanceOf", args: [to] });
  console.log(`done: ${formatUnits(after - before, USDC_DECIMALS)} USDC received, balance ${formatUnits(after, USDC_DECIMALS)} USDC`);
  console.log(`https://sepolia.arbiscan.io/tx/${hash}`);
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
