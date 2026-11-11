#!/usr/bin/env bash
# The NEAR Intents rail through the whole app, without real money: a fork of Arbitrum One with the
# contracts deployed by the mainnet scripts, the local check server pointed at that fork, and then
# scripts/near-app-check.ts. The database is the one start-local.sh picks (staging when it exists, else
# web/.env.local). From web/:
#   CHROME=... npm run near:app
set -euo pipefail
cd "$(dirname "$0")/.."
WEB=$PWD
CONTRACTS=$WEB/../contracts
UPSTREAM=${FORK_URL:-https://arb1.arbitrum.io/rpc}
RPC=http://127.0.0.1:8547
PORT=3001
USDC=0xaf88d065e77c8cC2239327C5EDb3A432268e5831

BROADCAST_TMP=$(mktemp -d)
EMAIL_DIR=$(mktemp -d)
ANVIL_PID=""
cleanup() {
  fuser -k -n tcp "$PORT" >/dev/null 2>&1 || true
  if [ -n "$ANVIL_PID" ]; then kill "$ANVIL_PID" 2>/dev/null || true; fi
  rm -rf "$BROADCAST_TMP" "$EMAIL_DIR" "$CONTRACTS/deployments/fork-42161.json" "$CONTRACTS/deployments/intents-fork-42161.json"
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

newkey() { node -e 'console.log("0x" + require("crypto").randomBytes(32).toString("hex"))'; }
addr() { cast wallet address --private-key "$1"; }
DEPLOYER_KEY=$(newkey)
OPERATOR_KEY=$(newkey)
MINTER_KEY=$(newkey)
ADMIN=$(addr "$DEPLOYER_KEY")
OPERATOR=$(addr "$OPERATOR_KEY")
MINTER=$(addr "$MINTER_KEY")
SELLER=$(addr "$(newkey)")
for a in "$ADMIN" "$OPERATOR" "$MINTER"; do
  cast rpc anvil_setBalance "$a" 0x56bc75e2d63100000 --rpc-url "$RPC" >/dev/null
done
MASTER=$(cast call "$USDC" "masterMinter()(address)" --rpc-url "$RPC")
cast rpc anvil_setBalance "$MASTER" 0xde0b6b3a7640000 --rpc-url "$RPC" >/dev/null
cast rpc anvil_impersonateAccount "$MASTER" --rpc-url "$RPC" >/dev/null
cast send "$USDC" "configureMinter(address,uint256)" "$MINTER" 1000000000000 --from "$MASTER" --unlocked --rpc-url "$RPC" >/dev/null

(cd "$CONTRACTS" && forge build --quiet && \
  ADMIN=$ADMIN OPERATOR=$OPERATOR TOKEN=$USDC PRICE_CAP=25000000 DISPUTE_WINDOW=172800 DEPLOY_NAME=fork-42161 FOUNDRY_BROADCAST=$BROADCAST_TMP \
  forge script script/Deploy.s.sol --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" --broadcast --silent)
ESCROW=$(node -e "console.log(require('$CONTRACTS/deployments/fork-42161.json').escrow)")
(cd "$CONTRACTS" && \
  ESCROW=$ESCROW DEPLOY_NAME=intents-fork-42161 FOUNDRY_BROADCAST=$BROADCAST_TMP \
  forge script script/DeployIntents.s.sol --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" --broadcast --silent)
FACTORY=$(node -e "console.log(require('$CONTRACTS/deployments/intents-fork-42161.json').factory)")
echo "Fork of Arbitrum One: escrow $ESCROW, factory $FACTORY"

# The server on the fork's contracts, with emails written to a folder instead of sent, and a cron secret
# of its own for this run, so the check can stand in for Vercel Cron.
CRON=$(newkey)
LUMMY_INTENTS_RPC_URL=$RPC LUMMY_INTENTS_ESCROW=$ESCROW LUMMY_INTENTS_FACTORY=$FACTORY \
LUMMY_INTENTS_OPERATOR_KEY=$OPERATOR_KEY LUMMY_INTENTS_SELLER=$SELLER \
EMAIL_TRANSPORT=file EMAIL_DIR=$EMAIL_DIR CRON_SECRET=$CRON \
  bash scripts/start-local.sh --port "$PORT"
for _ in $(seq 1 120); do
  curl -s -m 3 -o /dev/null "http://127.0.0.1:$PORT/" && break
  sleep 1
done

FORK_RPC=$RPC FORK_USDC=$USDC FORK_ESCROW=$ESCROW FORK_FACTORY=$FACTORY FORK_MINTER_KEY=$MINTER_KEY EMAIL_DIR=$EMAIL_DIR CRON_SECRET=$CRON \
BASE=http://127.0.0.1:$PORT \
  npx tsx scripts/near-app-check.ts
