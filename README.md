# Lummy

**Escrow-backed resale for concert tickets in Indonesia.** Live at [lummy.id](https://lummy.id), on testnets and test payments.

Resale in Indonesia runs through WhatsApp groups and X replies with nobody in the middle. On Lummy the buyer's money is held until 48 hours after the show, every ticket is checked before it goes on sale, and a seller whose ticket fails at the gate loses the sale and pays a penalty. Users sign in with email. Shows in Indonesia need no wallet at all; for a show abroad the buyer's wallet only signs at checkout, with no gas.

> [!NOTE]
> This repository is a public mirror of our working repository, updated after every push. It holds the app, the database schema and the contracts, with their full commit history. Internal notes, plans, applications and partner documents stay private, so a few links in the code and in commit messages point to files that are not here.

## What is here

| Folder | What it is |
|---|---|
| [`web/`](web) | The Next.js app in TypeScript: buyer, seller and staff pages, and the server routes in `web/src/app/api` for listings, orders, QRIS and USDC payments, claims, the gate and the ticket checks |
| [`contracts/`](contracts) | Solidity and Foundry: `LummyEscrow`, `LummyLedger` and their tests |
| [`supabase/`](supabase) | The Postgres schema, row-level security and its tests, seed data and email templates |

## How it works

1. **The seller uploads the ticket PDF.** The server reads every barcode, normalises it and hashes it with a secret key, so a barcode already on sale is blocked. It checks the PDF's structure for signs of editing, and Claude (Anthropic) reads the printed show, category and seat from the text after names, numbers and codes are taken out. A flagged ticket waits for a person.
2. **The buyer pays.** For shows in Indonesia, rupiah by QRIS through Xendit, a licensed payment provider (test mode for now). For shows abroad, such as Binance Blockchain Week or Singapore Blockchain Week, USDC from the buyer's own wallet: two signatures, no transaction from the wallet, and the server locks the money in the escrow contract (test USDC on Arbitrum Sepolia for now).
3. **The money is held until 48 hours after the show.** A claim with proof is decided by a person: refund, partial refund, or payout. Without a claim, the seller is paid.

The full story, with what we do and do not promise, is at [lummy.id/how-it-works](https://lummy.id/how-it-works).

## On Arbitrum

Two contracts on Arbitrum Sepolia, both with verified source:

| Contract | Address | What it does |
|---|---|---|
| `LummyEscrow` | [`0x6830…25Dd`](https://sepolia.arbiscan.io/address/0x6830Db86283157E4cB80b0615d4c51381A0C25Dd#code) | Holds a buyer's USDC (Circle's native USDC on Arbitrum Sepolia) per listing until the dispute window after the show closes, then releases it to the seller, refunds the buyer, or splits it on a ruling |
| `LummyLedger` | [`0xe454…8b0E`](https://sepolia.arbiscan.io/address/0xe454cbc81916E9bE1e6A768715134568FCEE8b0E#code) | Records each QRIS order's life: paid, claim, ruling, payout, refund. Each order has a public proof page, `/proof/<id>`, with no personal data |

What the escrow enforces itself (`contracts/src/LummyEscrow.sol`):

- **No gas for users.** The buyer signs two messages: an ERC-3009 authorization on the token, and an EIP-712 purchase intent bound to that one listing, so a relayer cannot reuse it elsewhere. Our operator sends the transaction and pays the gas.
- **Money only goes to the listing's buyer or seller.** No sweep, no fee taken by the contract, the token fixed at deploy.
- **The seller cannot be held hostage.** Once the window closes without a dispute, anyone can release the money to the seller, even with our backend down.
- **One barcode, one sale.** Each listing commits a keyed hash of the ticket's barcode; a second listing with the same commitment is refused.

Crypto may not be used as payment in Indonesia, which is why shows there are paid in rupiah through the provider and only recorded on chain.

## Arbitrum Founder House

The git tag `founder-house-start` marks the start of Arbitrum Founder House Singapore (23 October 2026): everything before it existed already, and `git log founder-house-start..HEAD` is the work done there. Built at the event:

- **USDC checkout from the buyer's own wallet** for shows abroad. `POST /api/payments` with a wallet holds the seats and returns the two messages to sign, bound to an on-chain listing named after the hold; `POST /api/payments/[id]/usdc` checks both signatures against that wallet, then our operator creates and funds the listing and records the handover, paying the gas (`web/src/lib/payments/usdc.ts`). Money funded for an order that cannot be written goes straight back. Guards: a testnet label, sign-in, a limit per wallet, and a switch to turn it off.
- **`npm run usdc:check`**: 32 checks on Arbitrum Sepolia against a server with the testnet keys, from forged signatures and another account's attempt to a purchase through the pages with a wallet injected into the browser, ending with a cancelled show that refunds the wallet in full.
- **A catalogue of real shows**, in Jakarta and abroad, with sources for every price, freely licensed photos with credits, and the promoter's name rule where its terms state one. Every listing on them is a sample until our beta.

## Run it

Node 22 and [Foundry](https://getfoundry.sh). Each line runs from the repository root:

```bash
cd web && npm install && npm run dev      # the app on localhost:3000, on sample data
cd contracts && git submodule update --init --recursive && forge test
cd web && npm run chain:local             # Anvil, a deploy, and four escrow cycles: release, refund, dispute, a show tomorrow
cd web && npm run chain:fork              # a rehearsal on an Arbitrum Sepolia fork with Circle's USDC, no faucet
```

Without environment variables the app runs on its sample catalogue and sample accounts; `web/.env.example` lists what a deploy sets (Supabase, Xendit, the operator key, the AI provider). Code comments are in English and Indonesian.

## Status (October 2026)

- Live at [lummy.id](https://lummy.id): email sign-in; buyer, seller and staff flows on a real database; claims with photo evidence the server reads; gate passes scanned at the door; cancelled and postponed shows; English and Indonesian.
- QRIS through Xendit in test mode, and USDC checkout from the buyer's own wallet on Arbitrum Sepolia with test USDC. Real money waits for our company registration, the provider's business verification, a legal opinion and a contract audit.
- Contracts: 110 Foundry tests, fuzzing and invariant runs included.
- Not built yet: e-signature and e-stamp for the letter of authorisation, and storing a seller's ID card.

## License

All rights reserved. The code is public to read, not licensed for reuse. Questions: team@lummy.id.

## Team

Zahra Sasongko, CEO · Luthfi Hadi, CTO ([@luthfidi](https://github.com/luthfidi)) · Joanita Timbin Panggalo, COO. More at [github.com/Lummy-Ticket](https://github.com/Lummy-Ticket).
