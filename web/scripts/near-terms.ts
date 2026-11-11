// "The address is the terms", checked by anyone: reads an order's receiver contract on Arbitrum One,
// takes the terms it carries (listing, seller, price, show end, refund address, deadline), and asks
// the factory which address those terms give. It must be that same address. Then it changes one term
// at a time and shows that each gives another address. Public RPC, no keys, nothing is sent.
//
//   npm run near:terms                 the team's real order of 10 Nov 2026
//   npm run near:terms -- 0xReceiver   any other receiver that has been funded or swept
import { createPublicClient, fallback, formatUnits, getAddress, http, isAddress, type Address, type Hex } from "viem";
import { arbitrum } from "viem/chains";
import { intentFactoryAbi, intentReceiverAbi } from "../src/lib/chain/abi";
import { INTENTS } from "../src/lib/chain/deployments";

/** The receiver of the order paid from Ethereum on 10 Nov 2026 (README, "Then the whole flow on lummy.id"). */
const TEAM_ORDER = "0x35e2e3A55F881D22Fbf9A497A288fe69a4F064A8";
const OTHER = "0x000000000000000000000000000000000000dEaD";
const when = (s: bigint | number) => new Date(Number(s) * 1000).toISOString().replace(".000Z", "Z");

async function main() {
  const given = process.argv[2] ?? TEAM_ORDER;
  if (!isAddress(given)) throw new Error("usage: npm run near:terms [-- 0xReceiver]");
  const receiver = getAddress(given);
  const factory = INTENTS[arbitrum.id]?.factory as Address | undefined;
  if (!factory) throw new Error("no factory is recorded for Arbitrum One");
  const pc = createPublicClient({
    chain: arbitrum,
    transport: fallback(["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com"].map((u) => http(u, { timeout: 10_000 }))),
  });

  const code = await pc.getCode({ address: receiver });
  if (!code || code === "0x") {
    throw new Error(`${receiver} has no code on Arbitrum One. A receiver is deployed when its order is funded or swept; before that it is only an address money can wait at.`);
  }
  const at = { address: receiver, abi: intentReceiverAbi } as const;
  const [listingId, seller, price, eventEndsAt, refundTo, refundAfter, escrow, token] = await Promise.all([
    pc.readContract({ ...at, functionName: "LISTING_ID" }),
    pc.readContract({ ...at, functionName: "SELLER" }),
    pc.readContract({ ...at, functionName: "PRICE" }),
    pc.readContract({ ...at, functionName: "EVENT_ENDS_AT" }),
    pc.readContract({ ...at, functionName: "REFUND_TO" }),
    pc.readContract({ ...at, functionName: "REFUND_AFTER" }),
    pc.readContract({ ...at, functionName: "ESCROW" }),
    pc.readContract({ ...at, functionName: "TOKEN" }),
  ]);
  const terms = { listingId: listingId as Hex, seller, price: BigInt(price), eventEndsAt: Number(eventEndsAt), refundTo, refundAfter: Number(refundAfter) };
  const of = (t: typeof terms) => pc.readContract({ address: factory, abi: intentFactoryAbi, functionName: "receiverOf", args: [t] });

  console.log(`receiver    ${receiver}  (Arbitrum One, ${(code.length - 2) / 2} bytes of code)`);
  console.log(`factory     ${factory}`);
  console.log("the terms this receiver carries, read from the contract itself:");
  console.log(`  listing     ${terms.listingId}`);
  console.log(`  seller      ${terms.seller}`);
  console.log(`  price       ${formatUnits(terms.price, 6)} USDC`);
  console.log(`  show ends   ${when(terms.eventEndsAt)}`);
  console.log(`  refund to   ${terms.refundTo}`);
  console.log(`  deadline    ${when(terms.refundAfter)}\n`);

  const [same, otherRefund, otherPrice, otherDeadline, otherSeller, fEscrow, fToken] = await Promise.all([
    of(terms),
    of({ ...terms, refundTo: OTHER }),
    of({ ...terms, price: terms.price + BigInt(1) }),
    of({ ...terms, refundAfter: terms.refundAfter + 1 }),
    of({ ...terms, seller: OTHER }),
    pc.readContract({ address: factory, abi: intentFactoryAbi, functionName: "ESCROW" }),
    pc.readContract({ address: factory, abi: intentFactoryAbi, functionName: "TOKEN" }),
  ]);
  const results: [string, boolean, string][] = [
    ["the factory gives this very address for these terms", getAddress(same) === receiver, same],
    ["another refund address gives another address", getAddress(otherRefund) !== receiver, otherRefund],
    ["one unit more on the price gives another address", getAddress(otherPrice) !== receiver, otherPrice],
    ["one second more on the deadline gives another address", getAddress(otherDeadline) !== receiver, otherDeadline],
    ["another seller gives another address", getAddress(otherSeller) !== receiver, otherSeller],
    ["the receiver pays into the factory's escrow, in the factory's token", getAddress(escrow) === getAddress(fEscrow) && getAddress(token) === getAddress(fToken), `${escrow} / ${token}`],
  ];
  for (const [name, ok, note] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (${note})`);
  const failed = results.filter((r) => !r[1]).length;
  console.log(`\n${results.length - failed}/${results.length} checks pass`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
