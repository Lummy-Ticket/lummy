#!/usr/bin/env bash
# Deploys the NEAR Intents rail to Arbitrum One: LummyEscrow with Circle's USDC, a 48-hour window and a
# 25 USDC price cap, then LummyIntentFactory for it, both verified on Arbiscan. The same scripts as the
# fork rehearsals (npm run near:fork, npm run near:app). Real ETH for gas, from ~/.lummy/mainnet.env
# (docs/config/08-near.md). Keys are read from the file and never printed. From web/:
#   bash scripts/near-deploy.sh            # simulates only: what it would deploy, and the gas
#   bash scripts/near-deploy.sh --broadcast
set -euo pipefail
cd "$(dirname "$0")/.."
WEB=$PWD
CONTRACTS=$WEB/../contracts
RPC=${ARB_RPC:-https://arb1.arbitrum.io/rpc}
USDC=0xaf88d065e77c8cC2239327C5EDb3A432268e5831

set -a
. "$HOME/.lummy/mainnet.env"
ETHERSCAN_API_KEY=$(grep '^ETHERSCAN_API_KEY=' "$HOME/.lummy/testnet.env" | cut -d= -f2-)
set +a
[ "$(cast chain-id --rpc-url "$RPC")" = "42161" ] || { echo "Not Arbitrum One: $RPC" >&2; exit 1; }
echo "deployer $DEPLOYER_ADDRESS holds $(cast balance --ether --rpc-url "$RPC" "$DEPLOYER_ADDRESS") ETH"
echo "operator $OPERATOR_ADDRESS holds $(cast balance --ether --rpc-url "$RPC" "$OPERATOR_ADDRESS") ETH"

BROADCAST=()
if [ "${1:-}" = "--broadcast" ]; then
  [ -e "$CONTRACTS/deployments/42161.json" ] && { echo "deployments/42161.json exists: already deployed" >&2; exit 1; }
  BROADCAST=(--broadcast --verify --etherscan-api-key "$ETHERSCAN_API_KEY")
fi

cd "$CONTRACTS"
forge build --quiet
ADMIN=$DEPLOYER_ADDRESS OPERATOR=$OPERATOR_ADDRESS TOKEN=$USDC PRICE_CAP=25000000 DISPUTE_WINDOW=172800 \
  forge script script/Deploy.s.sol --rpc-url "$RPC" --private-key "$DEPLOYER_PRIVATE_KEY" "${BROADCAST[@]}"
if [ "${#BROADCAST[@]}" -eq 0 ]; then
  echo "simulated only; run again with --broadcast to deploy"
  exit 0
fi
ESCROW=$(node -e "console.log(require('$CONTRACTS/deployments/42161.json').escrow)")
ESCROW=$ESCROW forge script script/DeployIntents.s.sol --rpc-url "$RPC" --private-key "$DEPLOYER_PRIVATE_KEY" "${BROADCAST[@]}"
cd "$WEB" && npm run -s chain:abi
echo "deployed: commit contracts/deployments, contracts/broadcast and web/src/lib/chain/deployments.ts"
