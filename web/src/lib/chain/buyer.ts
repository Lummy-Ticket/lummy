// Model A: backend memegang alamat simulasi pembeli dan menandatangani atas namanya. Dua tanda
// tangan, dua-duanya tanpa gas: otorisasi ERC-3009 ke token dan niat beli EIP-712 ke escrow.
// Kalau nanti pembeli memegang wallet sendiri, tanda tangan yang sama dibuat wallet itu.
import { bytesToHex, parseAbi, type Address, type Hex, type LocalAccount, type PublicClient } from "viem";
import { escrowAbi, tokenAbi } from "./abi";

export type FundSignature = {
  from: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  authNonce: Hex;
  authSig: Hex;
  deadline: bigint;
  fundSig: Hex;
};

type Domain = { name: string; version: string; chainId: number; verifyingContract: Address };

const fiatTokenVersionAbi = parseAbi(["function version() view returns (string)"]);

const RECEIVE_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

const FUND_TYPES = {
  Fund: [
    { name: "listingId", type: "bytes32" },
    { name: "buyer", type: "address" },
    { name: "value", type: "uint256" },
    { name: "authNonce", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** Domain EIP-712 token. MockUSDC punya eip712Domain(), FiatToken Circle cuma name() dan version(). */
async function tokenDomain(pc: PublicClient, token: Address, chainId: number): Promise<Domain> {
  try {
    const [, name, version, cid, verifyingContract] = await pc.readContract({
      address: token,
      abi: tokenAbi,
      functionName: "eip712Domain",
    });
    return { name, version, chainId: Number(cid), verifyingContract };
  } catch {
    const [name, version] = await Promise.all([
      pc.readContract({ address: token, abi: tokenAbi, functionName: "name" }),
      pc.readContract({ address: token, abi: fiatTokenVersionAbi, functionName: "version" }),
    ]);
    return { name, version, chainId, verifyingContract: token };
  }
}

async function escrowDomain(pc: PublicClient, escrow: Address): Promise<Domain> {
  const [, name, version, cid, verifyingContract] = await pc.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "eip712Domain",
  });
  return { name, version, chainId: Number(cid), verifyingContract };
}

/**
 * The two messages a buyer signs to fund one listing, as a wallet's eth_signTypedData_v4 takes them.
 * Built on the server, so a buyer's own wallet only signs; the same objects check the signatures.
 */
export async function fundTypedData(opts: {
  pc: PublicClient;
  buyer: Address;
  escrow: Address;
  token: Address;
  listingId: Hex;
  value: bigint;
  validBefore: bigint;
  authNonce?: Hex;
}) {
  const { pc, buyer, escrow, token, listingId, value, validBefore } = opts;
  const chainId = await pc.getChainId();
  const validAfter = BigInt(0);
  const deadline = validBefore;
  const authNonce = opts.authNonce ?? bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  return {
    authNonce,
    validAfter,
    validBefore,
    deadline,
    auth: {
      domain: await tokenDomain(pc, token, chainId),
      types: RECEIVE_TYPES,
      primaryType: "ReceiveWithAuthorization" as const,
      message: { from: buyer, to: escrow, value, validAfter, validBefore, nonce: authNonce },
    },
    fund: {
      domain: await escrowDomain(pc, escrow),
      types: FUND_TYPES,
      primaryType: "Fund" as const,
      message: { listingId, buyer, value, authNonce, deadline },
    },
  };
}

export async function signFund(opts: {
  pc: PublicClient;
  buyer: LocalAccount;
  escrow: Address;
  token: Address;
  listingId: Hex;
  value: bigint;
  validForSeconds?: number;
}): Promise<FundSignature> {
  const { pc, buyer, escrow, token, listingId, value } = opts;
  if (!buyer.signTypedData) throw new Error("akun pembeli tidak bisa menandatangani typed data");

  // Waktu chain, bukan jam lokal: di Anvil waktunya bisa sudah dimajukan.
  const now = (await pc.getBlock()).timestamp;
  const typed = await fundTypedData({ pc, buyer: buyer.address, escrow, token, listingId, value, validBefore: now + BigInt(opts.validForSeconds ?? 3600) });
  const authSig = await buyer.signTypedData(typed.auth);
  const fundSig = await buyer.signTypedData(typed.fund);

  const { validAfter, validBefore, authNonce, deadline } = typed;
  return { from: buyer.address, value, validAfter, validBefore, authNonce, authSig, deadline, fundSig };
}
