#!/usr/bin/env bash
# Uji mode chain dari ujung ke ujung: Anvil lokal, deploy, `next dev` dengan kunci akun bawaan Anvil,
# lalu tiap route /api/chain dipanggil lewat HTTP dan alur UI dijalankan di Chrome. Pakai dari web/:
#   npm run chain:e2e
set -euo pipefail
cd "$(dirname "$0")/.."
WEB=$PWD
CONTRACTS=$WEB/../contracts
RPC=http://127.0.0.1:8545
PORT=3107
MNEMONIC="test test test test test test test test test test test junk"
LOG=$(mktemp)

ANVIL_PID=""
cleanup() {
  pkill -f "next dev -p $PORT" 2>/dev/null || true
  if [ -n "$ANVIL_PID" ]; then kill "$ANVIL_PID" 2>/dev/null || true; fi
  rm -f "$LOG"
}
trap cleanup EXIT

if cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "Port 8545 sudah dipakai. Matikan dulu node di sana, uji ini butuh chain yang bersih." >&2
  exit 1
fi
anvil --silent --port 8545 &
ANVIL_PID=$!
for _ in $(seq 1 50); do
  cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break
  sleep 0.2
done

key() { cast wallet private-key "$MNEMONIC" "$1"; }
addr() { cast wallet address --private-key "$(key "$1")"; }
DEPLOYER_KEY=$(key 0)
ADMIN=$(addr 0)
OPERATOR=$(addr 1)

(cd "$CONTRACTS" && forge build --quiet && ADMIN=$ADMIN OPERATOR=$OPERATOR \
  forge script script/Deploy.s.sol --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" --broadcast --quiet)
ESCROW=$(node -p "require('$CONTRACTS/deployments/31337.json').escrow")
TOKEN=$(node -p "require('$CONTRACTS/deployments/31337.json').token")
cast send "$TOKEN" "mint(address,uint256)" "$(addr 3)" 100000000 --private-key "$DEPLOYER_KEY" --rpc-url "$RPC" >/dev/null

LUMMY_CHAIN_ID=31337 LUMMY_RPC_URL=$RPC LUMMY_ESCROW=$ESCROW LUMMY_TOKEN=$TOKEN \
LUMMY_OPERATOR_KEY=$(key 1) LUMMY_BUYER_KEY=$(key 3) LUMMY_SELLER_ADDRESS=$(addr 2) LUMMY_DEMO_KEY=uji-lokal \
  npx next dev -p "$PORT" >"$LOG" 2>&1 &
for i in $(seq 1 120); do
  curl -sf "http://127.0.0.1:$PORT/api/chain" >/dev/null 2>&1 && break
  if [ "$i" = 120 ]; then echo "next dev tidak siap dalam 2 menit:" >&2; tail -20 "$LOG" >&2; exit 1; fi
  sleep 1
done

BASE=http://127.0.0.1:$PORT RPC=$RPC DEMO_KEY=uji-lokal node scripts/chain-api-check.mjs
if [ -x "${CHROME:-/opt/google/chrome/chrome}" ]; then
  echo ""
  BASE=http://127.0.0.1:$PORT RPC=$RPC DEMO_KEY=uji-lokal node scripts/chain-ui-check.mjs
else
  echo "Chrome tidak ditemukan (set CHROME=/path/ke/chrome), uji UI dilewati."
fi
