# Lummy's receipt registry on NEAR

One small contract, built at NEAR HACKATHON. It is live on NEAR testnet as
[`lummy-receipts.testnet`](https://testnet.nearblocks.io/address/lummy-receipts.testnet).

When a ticket is read by a model inside NEAR AI Cloud's TEE, the reply comes with a receipt: the text
`model:request_hash:response_hash`, signed by the key inside that TEE. Lummy's server checks that
signature, and NEAR's Verification Center checks it in your browser. This contract is a third checker
that nobody runs: it recovers the signer with its own arithmetic (`ecrecover` over the EIP-191 form of
the text) and keeps the receipts recorded in it.

| Method | Kind | What it does |
|---|---|---|
| `signer_of(signed_text, signature)` | view | The address that signed this text. Change one character and it is another address. |
| `record(signed_text, signature)` | call, 0.01 NEAR | Verifies, then stores the receipt with who recorded it and when. Refuses text that is not a receipt, an unreadable signature, and a receipt already recorded. |
| `get(signed_text, signer)` | view | The record of this text signed by this address, or null. |
| `count()`, `recent(limit)` | view | How many are recorded, and the newest of them. |

Anyone may record. The deposit pays for the record's storage, so the registry cannot be filled for free,
and records are keyed by text and signer, so a stranger's signature over the same text cannot take the
place of the TEE's.

**What it does not prove.** That a key lives inside a TEE. That is what the model's attestation report
says, and NEAR's Verification Center checks it. A record here proves that `signer` signed `signed_text`,
and that the record has existed since `recorded_at_ms`.

**Why testnet.** It was written on 13 November 2026, a day before the deadline, and it is unaudited.
The escrow that holds money is on Arbitrum One and does not depend on it.

## Run it

```bash
cargo test                                   # 7 tests: a real signature, one changed character, the refusals
cargo near build non-reproducible-wasm       # target/near/lummy_receipts.wasm, about 144 KB
bash record.sh                               # takes a live TEE receipt from lummy.id and asks the contract (needs near-cli-rs)
```

Ask the contract with nothing installed, through NEAR's public RPC (`e30=` is `{}`):

```bash
curl -s https://rpc.testnet.fastnear.com -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"lummy-receipts.testnet","method_name":"count","args_base64":"e30="}}'
```

The `result` bytes are the JSON answer. The first record was made on 13 November 2026, in transaction
[`5p4xG8Nc…h2Gz`](https://testnet.nearblocks.io/txns/5p4xG8Ncu5v6mEfAsWNoXTqFfotAVfi81rnE2wBYh2Gz), from a
receipt signed by `0x835ab53d20294ef795906dff21ae4c045336aa26`, the key named in the attestation report
of `Qwen/Qwen3.8-27B` that day.
