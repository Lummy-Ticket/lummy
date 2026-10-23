# Lummy contracts

Foundry. Two contracts on Arbitrum, and a USDC stand-in for local tests. The design notes and their locked decisions are in `docs/09-technical-design.md` of the working repository, which is private.

```bash
cd contracts
git submodule update --init --recursive   # once after cloning: OpenZeppelin and forge-std
forge build
forge test
```

| File | What it is |
|---|---|
| `src/LummyEscrow.sol` | The escrow: a listing, the buyer's USDC locked until the show is over plus the dispute window, proof of handover, release, refund and rulings. The operator may act for users (Model A: users sign in with email and never hold a wallet or pay gas) |
| `src/LummyLedger.sol` | The public record of rupiah (QRIS) orders: paid, claim, ruling, payout, refund. The money stays with the licensed payment provider; the contract keeps the record |
| `src/MockUSDC.sol` | A USDC stand-in for local tests. Testnet and production use Circle's USDC |
| `test/LummyEscrow.t.sol` | 76 tests: the six outcomes, Model A, the show's end and postponement, the window, proof of handover, barcode commitments, access, signatures, reentrancy, a token that delivers short |
| `test/LummyLedger.t.sol` | 28 tests for the ledger |
| `test/*.invariant.t.sol` | Random sequences of actions, forbidden ones included. For the escrow: the balance always equals the books, money in equals money out, the operator never receives funds, and forbidden actions always revert |
| `test/MockUSDC.t.sol` | The ERC-3009 behaviour the escrow relies on |

A long invariant campaign (10,000 random sequences, about 3.5 minutes): `FOUNDRY_PROFILE=deep forge test --match-contract Invariant`.

## How we checked these contracts

Everything here was done by the team. There has been no external audit yet (see the end of this section).

| Check | Result |
|---|---|
| Tests | 114 Foundry tests pass: 76 for the escrow, 28 for the ledger, 8 for MockUSDC, and one invariant suite per contract. Each fuzz test runs 1,000 random inputs; each invariant suite runs 256 random sequences of 64 actions |
| Coverage | 100% of lines and functions in `src`; 100% of LummyEscrow's branches (table below) |
| Slither (Trail of Bits) | 0 untriaged medium or high findings. 12 findings triaged, none a real issue, in [`SECURITY-ANALYSIS.md`](SECURITY-ANALYSIS.md), with why it takes two passes |
| CI | `ci.yml`: format, build with sizes, tests. `slither.yml`: both Slither passes on every change under `contracts/`, failing on any untriaged medium or high finding |
| Source on chain | Verified on Arbiscan and Sourcify. On 23 Oct 2026 the local build matched the runtime bytecode at both addresses, with the immutable values masked |

Coverage, from `forge coverage --no-match-coverage "(test|script|slither)/"`:

| File | Lines | Statements | Branches | Functions |
|---|---|---|---|---|
| `src/LummyEscrow.sol` | 100% (124/124) | 100% (170/170) | 100% (37/37) | 100% (22/22) |
| `src/LummyLedger.sol` | 100% (65/65) | 98.8% (82/83) | 95.8% (23/24) | 100% (10/10) |
| `src/MockUSDC.sol` | 100% (21/21) | 100% (20/20) | 100% (5/5) | 100% (7/7) |

The one ledger branch reported as missed is the window floor in the constructor (`WindowTooShort`). `test_constructor_guards` expects exactly that revert and passes, but forge coverage does not count the branch from that test; a standalone test of the same call does.

Gas per call, from `forge test --gas-report` on the happy-path tests. These are execution gas as Foundry measures it; a real transaction also pays the base and calldata cost and, on Arbitrum, the L1 data fee.

| Call | LummyEscrow | LummyLedger |
|---|---|---|
| `createListing` / `open` | 116,663 | 97,149 |
| `fund` | 130,857 | |
| `markHandover` | 32,488 | |
| `postponeEvent` | 32,705 | 32,422 |
| `raiseDispute` | 31,731 | 31,336 |
| `release` | 54,255 | 29,046 |
| `refund` | 56,379 | 32,028 |
| `resolveDispute` | 56,500 (one party) to 80,953 (both) | 31,945 |
| `withdraw`, `withdrawFor` | 44,148 to 61,797 | |
| `cancelListing` | 40,013 | |

Runtime size: LummyEscrow 9,361 bytes and LummyLedger 4,337 bytes, against the 24,576-byte limit.

Not done yet:

- **No external audit.** Slither finds known patterns; it does not judge the design or the economics.
- No formal verification, and no fuzzing beyond Foundry's own (no Echidna or Medusa campaign).
- Testnet only: Arbitrum Sepolia with Circle's test USDC. Nothing is deployed on Arbitrum One.
- The operator key is trusted with timing and with how a disputed payment is split between buyer and seller (Model A). The tests and invariants check that it can never send funds to anyone else, but a leaked key could still delay a payout or make a wrong ruling while the window is open.

## Deploy and local cycles

```bash
cd web && npm run chain:local   # Anvil, a deploy, then four cycles: release, refund, dispute, a show tomorrow
cd web && npm run chain:fork    # a testnet rehearsal: an Arbitrum Sepolia fork with Circle's USDC, no faucet
```

The operator sends every transaction in these cycles, so on testnet only the operator needs ETH. The simulated buyer only signs, and needs USDC.

Manual deploy: `ADMIN=0x… OPERATOR=0x… forge script script/Deploy.s.sol --rpc-url <rpc> --private-key <key> --broadcast`. Without `TOKEN`, the script deploys MockUSDC too. `DISPUTE_WINDOW` defaults to 600 seconds for demos, and on Arbitrum One the script refuses anything but 172800 (48 hours). The addresses land in `deployments/<chainId>.json`, and `npm run chain:abi` in `web/` copies the ABI and the public chain addresses.

The QRIS order ledger: `ADMIN=0x… OPERATOR=0x… forge script script/DeployLedger.s.sol --rpc-url <rpc> --private-key <key> --broadcast --verify --etherscan-api-key <key>`. `LEDGER_WINDOW` defaults to 172800 (48 hours, on testnet too, the same as the app's rule for QRIS orders); on Arbitrum One the script refuses any other value. The result is in `deployments/ledger-<chainId>.json`, and `npm run chain:abi` copies it too.

## On Arbitrum Sepolia

| Contract | Address |
|---|---|
| `LummyEscrow` | [`0x6830Db86283157E4cB80b0615d4c51381A0C25Dd`](https://sepolia.arbiscan.io/address/0x6830Db86283157E4cB80b0615d4c51381A0C25Dd#code), with Circle's USDC (`0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`) and a 10-minute demo window. Source verified on Arbiscan and Sourcify (7 Oct 2026) |
| `LummyLedger` | [`0xe454cbc81916E9bE1e6A768715134568FCEE8b0E`](https://sepolia.arbiscan.io/address/0xe454cbc81916E9bE1e6A768715134568FCEE8b0E#code). Source verified on Arbiscan and Sourcify |
