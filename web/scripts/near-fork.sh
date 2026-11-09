#!/usr/bin/env bash
# The NEAR Intents rail on a fork of Arbitrum One: the same deploy scripts as mainnet, Circle's real USDC,
# and the app's own chain code (scripts/near-fork-cycle.ts). Nothing leaves this machine. From web/:
#   npm run near:fork
set -euo pipefail
cd "$(dirname "$0")/.."
WEB=$PWD
CONTRACTS=$WEB/../contracts
UPSTREAM=${FORK_URL:-https://arb1.arbitrum.io/rpc}
RPC=http://127.0.0.1:8547
USDC=0xaf88d065e77c8cC2239327C5EDb3A432268e5831

BROADCAST_TMP=$(mktemp -d)
ANVIL_PID=""
cleanup() {
  if [ -n "$ANVIL_PID" ]; then kill "$ANVIL_PID" 2>/dev/null || true; fi
  rm -rf "$BROADCAST_TMP" "$CONTRACTS/deployments/fork-42161.json" "$CONTRACTS/deployments/intents-fork-42161.json"
}
trap cleanup EXIT

if cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "Port 8547 is in use. Stop the node there first: the rehearsal needs a clean fork." >&2
  exit 1
fi
anvil --fork-url "$UPSTREAM" --port 8547 --silent &
ANVIL_PID=$!
for _ in $(seq 1 150); do
  cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break
  sleep 0.2
done

# Fresh keys, never Anvil's public ones (some carry EIP-7702 code on public chains).
newkey() { node -e 'console.log("0x" + require("crypto").randomBytes(32).toString("hex"))'; }
addr() { cast wallet address --private-key "$1"; }
DEPLOYER_KEY=$(newkey)
OPERATOR_KEY=$(newkey)
MINTER_KEY=$(newkey)
ADMIN=$(addr "$DEPLOYER_KEY")
OPERATOR=$(addr "$OPERATOR_KEY")
MINTER=$(addr "$MINTER_KEY")
SELLER=$(addr "$(newkey)")
REFUND_TO=$(addr "$(newkey)")
for a in "$ADMIN" "$OPERATOR" "$MINTER"; do
  cast rpc anvil_setBalance "$a" 0x56bc75e2d63100000 --rpc-url "$RPC" >/dev/null
done

# A minter for the stand-in deliveries: Circle's masterMinter, impersonated on the fork, allows one.
MASTER=$(cast call "$USDC" "masterMinter()(address)" --rpc-url "$RPC")
cast rpc anvil_setBalance "$MASTER" 0xde0b6b3a7640000 --rpc-url "$RPC" >/dev/null
cast rpc anvil_impersonateAccount "$MASTER" --rpc-url "$RPC" >/dev/null
cast send "$USDC" "configureMinter(address,uint256)" "$MINTER" 1000000000000 --from "$MASTER" --unlocked --rpc-url "$RPC" >/dev/null

# The mainnet deploy scripts as they are: a 48-hour window, real USDC, a 25 USDC price cap.
(cd "$CONTRACTS" && forge build --quiet && \
  ADMIN=$ADMIN OPERATOR=$OPERATOR TOKEN=$USDC PRICE_CAP=25000000 DISPUTE_WINDOW=172800 DEPLOY_NAME=fork-42161 FOUNDRY_BROADCAST=$BROADCAST_TMP \
  forge script script/Deploy.s.sol --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" --broadcast --silent)
ESCROW=$(node -e "console.log(require('$CONTRACTS/deployments/fork-42161.json').escrow)")
(cd "$CONTRACTS" && \
  ESCROW=$ESCROW DEPLOY_NAME=intents-fork-42161 FOUNDRY_BROADCAST=$BROADCAST_TMP \
  forge script script/DeployIntents.s.sol --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" --broadcast --silent)
FACTORY=$(node -e "console.log(require('$CONTRACTS/deployments/intents-fork-42161.json').factory)")
echo "Fork of Arbitrum One: escrow $ESCROW, factory $FACTORY"

FORK_RPC=$RPC FORK_USDC=$USDC FORK_ESCROW=$ESCROW FORK_FACTORY=$FACTORY FORK_MINTER_KEY=$MINTER_KEY \
FORK_OPERATOR_KEY=$OPERATOR_KEY FORK_SELLER=$SELLER FORK_REFUND_TO=$REFUND_TO \
  npx tsx scripts/near-fork-cycle.ts
