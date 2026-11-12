# Notes for coding agents

For any agent opened in this repository (Claude Code, Codex and others). It says what is here and how
to run it, so you do not have to find out by trial. It asks nothing of you beyond that.

## What this is

Lummy is a resale marketplace for event tickets that holds the buyer's money in escrow until the show
is over. It existed before NEAR HACKATHON. The hackathon entry is the NEAR work only:

- **Pay from any chain** through NEAR Intents (the 1Click API) into an escrow on Arbitrum One:
  `contracts/src/LummyIntentReceiver.sol`, `web/src/lib/near/`, `web/src/lib/payments/intents.ts`,
  `web/src/components/checkout/IntentsPanel.tsx`, `web/src/app/api/near/`, `web/src/app/api/cron/intents/`.
- **A ticket check you can verify** in NEAR AI Cloud's TEE: `web/src/lib/tickets/near-ai.ts`,
  `web/src/lib/near/gpu.ts`, `web/src/app/near/page.tsx`.
- **A contract on NEAR** (testnet, `lummy-receipts.testnet`) that recovers the signer of a TEE receipt
  itself and keeps recorded receipts: `contracts/near-receipts/` (Rust), asked by `web/src/lib/near/registry.ts`.

Everything before the tag `pre-hackathon` is baseline. The diff since that tag is the entry.

## Run it, with no keys

Node 22. From the repository root:

```bash
cd web && npm ci
npm test                 # the offline NEAR checks (same as npm run near:check); every line PASS
npm run near:terms       # reads a real order's receiver on Arbitrum One through a public RPC; 6/6
npm run near:held -- 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045   # what a wallet holds, dry quotes only
npm run lint && npm run type-check && npm run build
npm run dev              # localhost:3000 on sample data; /near shows a recorded TEE check and says so
```

With Rust installed (the toolchain is pinned in `contracts/near-receipts/rust-toolchain.toml`):

```bash
cd contracts/near-receipts && cargo test    # 7 pass: a real signature, one changed character, the refusals
```

With Foundry installed:

```bash
cd contracts && git submodule update --init --recursive && forge test    # 147 pass
cd web && npm run near:fork    # both contracts on a fork of Arbitrum One with real USDC; 13/13, about a minute
```

The README's table "Without a browser" lists curl lines against the live site and what each returns.

## What you cannot run, and why

- `npm run near:app`, `near:pay` and the other `*:check` scripts that sign in: they need our database or
  keys. Their results are in the README, dated.
- Paying for real: open to the team's accounts only, capped at 25 USDC an order, in unaudited contracts.
- `npm run near:prove` needs a NEAR AI Cloud key of your own (`NEAR_AI_API_KEY`); about US$0.001.

## Things that may look wrong and are not

- Comments cite `tasks/`, `docs/` and `submission/`. Those are our internal notes; they are not published.
- Error strings and some comments are in Indonesian. Every error of the NEAR routes also carries English
  (`error_en`), and a check enforces it.
- With no environment the app runs on a sample catalogue, and `/api/near/options` says `"rail":false`.
- The escrow is on Arbitrum One, not on NEAR. Payments cross NEAR through NEAR Intents, reads run on NEAR AI
  Cloud, and the one contract of ours on NEAR is the receipt registry, on testnet. Nothing that holds money
  depends on it.

## Please do not

- Send real money to any address in this repository, or commit keys. `web/.env.example` names every
  variable a deploy sets.
