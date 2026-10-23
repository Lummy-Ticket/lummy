# Static analysis of the Lummy contracts

Slither (Trail of Bits) on `contracts/src`, with every finding triaged. This is static analysis by the team, not an audit; what is not done yet is listed at the end of `README.md`.

- **Scope:** `src/LummyEscrow.sol`, `src/LummyLedger.sol`, `src/MockUSDC.sol` (local test token) and `src/interfaces/IERC3009.sol`, as deployed and verified on Arbitrum Sepolia. Nothing in `src` was changed for this analysis.
- **Tools:** Slither 0.11.6 with all 102 detectors, Foundry 1.8.3, solc 0.8.28, OpenZeppelin Contracts 5.7.0.
- **Result:** 12 findings, none of them a real issue: 2 high (one false positive, one not exploitable), 0 medium, 6 low, 4 informational. No code change was needed.

## Running it

```bash
cd contracts
python3 -m venv ~/venvs/slither
~/venvs/slither/bin/pip install --no-deps -r requirements-slither.txt
~/venvs/slither/bin/slither .                            # pass 1: the deployed sources
FOUNDRY_PROFILE=slither ~/venvs/slither/bin/slither .    # pass 2: LummyEscrow parsed in full
```

Both commands read `slither.config.json` and the triage database `slither.db.json`, and print `0 result(s) found` when nothing new turns up. `.github/workflows/slither.yml` runs both passes on every change under `contracts/`.

## Why two passes

Slither 0.11.6 cannot build its intermediate representation for three functions of OpenZeppelin's `ReentrancyGuardTransient` (`_nonReentrantBefore`, `_nonReentrantAfter`, `_reentrancyGuardEntered`), which call library functions through `using TransientSlot for *` on a user-defined value type. It then marks LummyEscrow as incorrectly parsed and skips the SSA step for the whole contract. We checked what that costs: Slither no longer sees any write to `listings` (the escrow's main mapping, written through `Listing storage L = listings[id]`), and its data-flow detectors, reentrancy among them, see much less of LummyEscrow. A clean result from that pass alone would overstate what was checked.

Pass 2 uses the `slither` profile in `foundry.toml`. It changes one thing: the import of OpenZeppelin's guard is remapped to `slither/ReentrancyGuardTransient.sol`, an analysis-only copy with the same transient storage slot, the same error and the same modifiers, written with `tload`/`tstore` directly. With it Slither parses every function and sees all the writes. The full test suite also passes against the copy (114 of 114). It is never deployed: the default profile, which builds what is on chain, does not use it. LummyLedger and MockUSDC parse completely in both passes.

**The deployed bytecode is unchanged.** On 23 Oct 2026 we compared the default `forge build` output before and after this work: the SHA-256 of the creation and runtime bytecode of LummyEscrow and LummyLedger is identical. The runtime bytecode also equals the code at both Arbitrum Sepolia addresses (`cast code`), byte for byte once the immutable values are masked (LummyEscrow 9,361 bytes with 14 immutable references, LummyLedger 4,337 bytes with 2).

## Findings

| # | Detector | Severity (confidence) | Where | Pass | Triage |
|---|---|---|---|---|---|
| 1 | `uninitialized-state` | High (high) | `LummyEscrow.listings` | 1 | False positive |
| 2 | `reentrancy-balance` | High (medium) | `LummyEscrow._pull` | 2 | Not exploitable |
| 3-8 | `timestamp` | Low (medium) | `LummyEscrow.fund`, `release`, `_windowClosed`; `LummyLedger.release`, `_windowClosed`; `MockUSDC._receive` | both | Accepted by design |
| 9 | `naming-convention` | Informational | `LummyEscrow.TOKEN` | both | Accepted |
| 10 | `naming-convention` | Informational | `MockUSDC.DOMAIN_SEPARATOR` | both | Accepted |
| 11-12 | `pragma` | Informational | all sources | both | Accepted |

**1. `listings` is never initialized: false positive.** A side effect of the parse failure above: with SSA skipped, Slither does not see `_createListing` writing `listings` through a storage pointer. Pass 2 does not report it, the same pattern in `LummyLedger.orders` is not reported in either pass, and every escrow test reads listings back after creating them.

**2. Stale balance in `_pull`: not exploitable.** `_pull` reads the escrow's USDC balance, calls `receiveWithAuthorization`, and checks that the balance rose by at least `value`. Slither warns that a reentrant call could raise the balance in between. It looks at `_pull` alone and does not see that `_pull` is private and reached only from `fund`, which is `nonReentrant`. That lock is the one `withdraw` and `withdrawFor` hold too, so no escrow function that moves tokens can run during the pull. `TOKEN` is immutable and set to Circle's USDC, whose `receiveWithAuthorization` makes no callback (at most a `staticcall` to check a contract signer's signature). USDC sits behind Circle's upgradeable proxy, so if a later version ever called out, the lock would still stop a nested `fund`. The balance check itself is defence in depth against a token that delivers less than `value`. Two tests cover this: `test_reentrancy_fundGuarded` (a token that calls `fund` for another listing in the middle of the transfer is rejected with `ReentrancyGuardReentrantCall`, and no funds move) and `test_fund_shortDeliveryRejected` (a token that delivers one unit short is rejected with `TransferMismatch`, and the listing stays open).

**3-8. Block timestamp in comparisons: accepted by design.** The contracts are time-based on purpose: the dispute window (48 hours in production; the testnet escrow uses a 10-minute demo window) and the deadline on the buyer's signed intent. On Arbitrum the sequencer sets the timestamp, and the protocol bounds how far it can drift. A skew moves a cutoff by the size of the skew; it never changes who can receive the funds. Forge lint's `block-timestamp` rule is off in `foundry.toml` for the same reason. `MockUSDC` is a local test token.

**9. `TOKEN` is not mixedCase: accepted.** Upper case for an immutable is the convention forge lint asks for, and renaming it would change a public getter of a deployed contract.

**10. `DOMAIN_SEPARATOR` is not mixedCase: accepted.** The standard name in EIP-2612 and ERC-3009 tokens, Circle's included, here in the local test token.

**11-12. Several Solidity versions: accepted.** Every file in `src` pins `pragma solidity 0.8.28`. The other six constraints are OpenZeppelin's open ranges (and the analysis copy in pass 2), and everything is compiled with solc 0.8.28 (`foundry.toml`). The finding appears once per pass because the file list differs.

## How the CI gate works

- `slither.config.json` keeps every finding that touches `contracts/src` (`include_paths`), even when it also touches OpenZeppelin, and drops findings that live only in `lib`, `test`, `script` or the analysis copy. We use `include_paths` rather than `filter_paths` because the latter drops a finding as soon as any of its elements sits in `lib/`, which can hide a finding in our code that calls into OpenZeppelin. Switching surfaced one extra finding, `pragma`.
- `slither.db.json` is Slither's triage database: the 12 findings above, by id. Slither derives the ids from names and expressions, not file paths, so they hold on any machine while `src` stays as it is.
- `fail_on` is `medium`: any medium or high finding not in the database fails the job. New low and informational findings are printed but do not fail it.
- Pass 2 also fails if Slither reports any parse failure, so it cannot quietly lose coverage of LummyEscrow.
- Slither 0.11.6 and all its dependencies are pinned in `requirements-slither.txt`, resolved from packages uploaded before 1 Oct 2026. The workflow's actions are pinned to commits at least two weeks old.

To triage a new finding: run `slither . --show-ignored-findings --json out.json`, decide, add it to `slither.db.json`, and add a row here.
