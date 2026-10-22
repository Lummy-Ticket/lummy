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
| `test/LummyEscrow.t.sol` | 72 tests: the six outcomes, Model A, the show's end and postponement, the window, proof of handover, barcode commitments, access, signatures, reentrancy |
| `test/LummyLedger.t.sol` | 28 tests for the ledger |
| `test/*.invariant.t.sol` | Random sequences of actions, forbidden ones included. For the escrow: the balance always equals the books, money in equals money out, the operator never receives funds, and forbidden actions always revert |
| `test/MockUSDC.t.sol` | The ERC-3009 behaviour the escrow relies on |

A long invariant campaign (10,000 random sequences, about 3.5 minutes): `FOUNDRY_PROFILE=deep forge test --match-contract Invariant`.

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
