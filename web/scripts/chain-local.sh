#!/usr/bin/env bash
# Tahap 2: Anvil lokal, deploy, lalu empat siklus escrow (release, refund, dispute, acara besok).
# Pakai dari web/: npm run chain:local
set -euo pipefail
cd "$(dirname "$0")/.."
WEB=$PWD
CONTRACTS=$WEB/../contracts
RPC=http://127.0.0.1:8545
MNEMONIC="test test test test test test test test test test test junk"

ANVIL_PID=""
cleanup() { if [ -n "$ANVIL_PID" ]; then kill "$ANVIL_PID" 2>/dev/null || true; fi; }
trap cleanup EXIT

if cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "Anvil sudah jalan di $RPC, dipakai."
else
  anvil --silent --port 8545 &
  ANVIL_PID=$!
  for _ in $(seq 1 50); do
    cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break
    sleep 0.2
  done
fi

DEPLOYER_KEY=$(cast wallet private-key "$MNEMONIC" 0)
ADMIN=$(cast wallet address --private-key "$DEPLOYER_KEY")
OPERATOR=$(cast wallet address --private-key "$(cast wallet private-key "$MNEMONIC" 1)")
export ADMIN OPERATOR

mkdir -p "$CONTRACTS/deployments"
(cd "$CONTRACTS" && forge build --quiet && forge script script/Deploy.s.sol --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" --broadcast --quiet)
node scripts/export-abi.mjs

for p in release refund dispute; do
  npx tsx scripts/escrow-cycle.ts --chain anvil --path "$p"
done
# Serah terima sehari sebelum acara: dana tetap menunggu acara selesai ditambah window.
npx tsx scripts/escrow-cycle.ts --chain anvil --path release --event-in 86400
echo ""
echo "Tahap 2 selesai: empat siklus escrow jalan di Anvil, semua transaksi dikirim operator."
