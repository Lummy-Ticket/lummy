#!/usr/bin/env bash
# Gladi tahap 3 tanpa faucet: fork Arbitrum Sepolia di Anvil, deploy lewat Deploy.s.sol dengan USDC
# asli Circle, lalu siklus release, refund, dan dispute. Pakai dari web/: npm run chain:fork
# Semua transaksi cuma terjadi di fork lokal, tidak ada yang terkirim ke jaringan asli.
set -euo pipefail
cd "$(dirname "$0")/.."
WEB=$PWD
CONTRACTS=$WEB/../contracts
UPSTREAM=${FORK_URL:-https://sepolia-rollup.arbitrum.io/rpc}
RPC=http://127.0.0.1:8546
USDC=0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d

BROADCAST_TMP=$(mktemp -d)
ANVIL_PID=""
cleanup() {
  if [ -n "$ANVIL_PID" ]; then kill "$ANVIL_PID" 2>/dev/null || true; fi
  rm -rf "$BROADCAST_TMP"
}
trap cleanup EXIT

if cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "Port 8546 sudah dipakai. Matikan dulu node di sana, gladi butuh fork yang bersih." >&2
  exit 1
fi
anvil --fork-url "$UPSTREAM" --port 8546 --silent &
ANVIL_PID=$!
for _ in $(seq 1 100); do
  cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break
  sleep 0.2
done

# Kunci segar, bukan akun bawaan Anvil: kunci bawaan itu publik, dan di Sepolia alamatnya sudah dipasangi
# kode delegasi EIP-7702 orang lain. FiatToken memeriksa tanda tangan lewat ERC-1271 kalau alamat pembeli
# berkode, jadi akun bawaan bikin fund() gagal. Wallet testnet asli juga segar, tanpa kode.
newkey() { node -e 'console.log("0x" + require("crypto").randomBytes(32).toString("hex"))'; }
addr() { cast wallet address --private-key "$1"; }
DEPLOYER_KEY=$(newkey)
OPERATOR_KEY=$(newkey)
BUYER_KEY=$(newkey)
ADMIN=$(addr "$DEPLOYER_KEY")
OPERATOR=$(addr "$OPERATOR_KEY")
BUYER=$(addr "$BUYER_KEY")
SELLER=$(addr "$(newkey)")
for a in "$ADMIN" "$OPERATOR"; do
  cast rpc anvil_setBalance "$a" 0x56bc75e2d63100000 --rpc-url "$RPC" >/dev/null
done
export CYCLE_OPERATOR_KEY=$OPERATOR_KEY CYCLE_BUYER_KEY=$BUYER_KEY CYCLE_SELLER=$SELLER

# USDC untuk pembeli: di fork, masterMinter asli ditiru (impersonate) supaya bisa memberi izin mint.
MASTER=$(cast call "$USDC" "masterMinter()(address)" --rpc-url "$RPC")
cast rpc anvil_setBalance "$MASTER" 0xde0b6b3a7640000 --rpc-url "$RPC" >/dev/null
cast rpc anvil_impersonateAccount "$MASTER" --rpc-url "$RPC" >/dev/null
cast send "$USDC" "configureMinter(address,uint256)" "$ADMIN" 1000000000 --from "$MASTER" --unlocked --rpc-url "$RPC" >/dev/null
cast send "$USDC" "mint(address,uint256)" "$BUYER" 100000000 --private-key "$DEPLOYER_KEY" --rpc-url "$RPC" >/dev/null
echo "Fork Arbitrum Sepolia siap. Pembeli pegang $(cast call "$USDC" "balanceOf(address)(uint256)" "$BUYER" --rpc-url "$RPC" | cut -d' ' -f1) unit USDC asli (6 desimal)."

# Skrip deploy yang sama dengan testnet. Hasilnya bernama fork-421614 dan rekaman broadcast-nya ke folder
# sementara, jadi tidak tercampur dengan deployment Sepolia yang asli.
(cd "$CONTRACTS" && forge build --quiet && \
  ADMIN=$ADMIN OPERATOR=$OPERATOR TOKEN=$USDC DEPLOY_NAME=fork-421614 FOUNDRY_BROADCAST=$BROADCAST_TMP \
  forge script script/Deploy.s.sol --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" --broadcast --quiet)
node scripts/export-abi.mjs

for p in release refund dispute; do
  npx tsx scripts/escrow-cycle.ts --chain sepolia --fork --path "$p"
done
echo ""
echo "Gladi selesai: tiga siklus dengan USDC asli Circle di fork Arbitrum Sepolia. Tinggal ETH testnet untuk yang asli."
