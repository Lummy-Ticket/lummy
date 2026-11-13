#!/bin/bash
# Takes a live TEE receipt from lummy.id and puts it to the registry contract on NEAR mainnet: who signed
# it, who "signed" it once one character is changed, and whether it is recorded. Reads only, unless you
# pass an account of yours as the first argument: then it also records the receipt from that account
# (0.01 NEAR, signed from your legacy keychain).
#   bash record.sh                    ask only
#   bash record.sh you.near           ask, then record (0.01 NEAR)
set -euo pipefail
C=${NEAR_REGISTRY:-lummy-receipts.near}
NET=${NEAR_NETWORK:-mainnet}
T=$(mktemp -d)
curl -s -X POST https://lummy.id/api/near/ticket-check -H 'content-type: application/json' -d '{"sample":"concert"}' > "$T/receipt.json"
python3 - "$T" <<'EOF'
import json, sys
d = sys.argv[1]
r = json.load(open(f"{d}/receipt.json"))["receipt"]
t = r["signedText"]
changed = t[:-1] + ("1" if t[-1] == "0" else "0")
print("receipt from lummy.id: signer", r["signingAddress"], "| verified", r["verified"], "| attested", r["attested"])
json.dump({"signed_text": t, "signature": r["signature"]}, open(f"{d}/real.json", "w"))
json.dump({"signed_text": changed, "signature": r["signature"]}, open(f"{d}/changed.json", "w"))
json.dump({"signed_text": t, "signer": r["signingAddress"]}, open(f"{d}/get.json", "w"))
EOF
view() { near contract call-function as-read-only "$C" "$1" json-args "$(cat "$2")" network-config "$NET" now 2>/dev/null | grep -vE '^\s*$|console command|near contract|Logs' | tr -d '\n'; echo; }
echo "the contract says the signer is:        $(view signer_of "$T/real.json")"
echo "with one character changed, it says:    $(view signer_of "$T/changed.json")"
if [ -n "${1:-}" ]; then
  near contract call-function as-transaction "$C" record json-args "$(cat "$T/real.json")" prepaid-gas '30 Tgas' attached-deposit '0.01 NEAR' sign-as "$1" network-config "$NET" sign-with-legacy-keychain send 2>&1 | grep -iE 'Transaction ID|succeeded|already recorded' || true
fi
echo "recorded in the contract:               $(view get "$T/get.json" | cut -c1-200)"
rm -rf "$T"
