# Lummy's receipt registry on NEAR

One small contract, built at NEAR HACKATHON. It is live on NEAR mainnet as
[`lummy-receipts.near`](https://nearblocks.io/address/lummy-receipts.near),
and was first tried on testnet as `lummy-receipts.testnet`.

When a ticket is read by a model inside NEAR AI Cloud's TEE, the reply comes with a receipt: the text
`model:request_hash:response_hash`, signed by the key inside that TEE. Lummy's server checks that
signature, and NEAR's Verification Center checks it in your browser. This contract is a third checker
that runs on a public chain and that any reader can ask: it recovers the signer with its own arithmetic (`ecrecover` over the EIP-191 form of
the text) and keeps the receipts recorded in it.

| Method | Kind | What it does |
|---|---|---|
| `signer_of(signed_text, signature)` | view | The address that signed this text. Change one character and it is another address. |
| `record(signed_text, signature)` | call, 0.01 NEAR | Verifies, then stores the receipt with who recorded it and when. Refuses text that is not a receipt, an unreadable signature, and a receipt already recorded. |
| `get(signed_text, signer)` | view | The record of this text signed by this address, or null. |
| `count()`, `recent(limit)` | view | How many are recorded, and the newest of them. |

Anyone may record. The deposit pays for the record's storage (0.01 NEAR covers 1,000 bytes and the longest possible record takes about 1,041; the contract's spare balance covers the difference. A comment in `src/lib.rs` still says 1,000: we left the deployed code unchanged so its hash stays reproducible), so the registry cannot be filled for free,
and records are keyed by text and signer, so a stranger's signature over the same text cannot take the
place of the TEE's.

**What it does not prove.** That a key lives inside a TEE. That is what the model's attestation report
says, and NEAR's Verification Center checks it. A record here proves that `signer` signed `signed_text`,
and that the record has existed since `recorded_at_ms`.

**Who can change it.** We can. The contract's account still has its full-access key, as most NEAR contracts do
while they are young, so we can deploy new code to it; that is how the text limit was tightened on 13 November.
A record is evidence you can re-check yourself with `signer_of`, not something to take on our word.

**On mainnet since 13 November 2026.** It ran on testnet first, where the refusals were tried on the network itself
and a record measured at 837 bytes and 2.6 Tgas. The NEAR for mainnet came from 8.5 USDC on Arbitrum, swapped through
NEAR Intents straight to the deploying account. [The deploy](https://nearblocks.io/txns/4dvSANR6nZtBASM4ffUA9Fnn8DAPRm2i2dahYQwi5cxz) has code hash
`60535f355ac1f7ef08aaba2a0187635029b124dd51c0572176ae72def21de31b`: build it yourself and compare with
`sha256sum target/near/lummy_receipts.wasm` (same toolchain, `rust-toolchain.toml`). It is unaudited, and the escrow
that holds money is on Arbitrum One and does not depend on it.

## Run it

```bash
cargo test                                   # 8 tests: a real signature, one changed character, the refusals
cargo near build non-reproducible-wasm       # target/near/lummy_receipts.wasm, about 144 KB
bash record.sh                               # takes a live TEE receipt from lummy.id and asks the contract (needs near-cli-rs)
```

Ask the contract with nothing installed, through NEAR's public RPC (`e30=` is `{}`):

```bash
curl -s https://rpc.mainnet.fastnear.com -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"lummy-receipts.near","method_name":"count","args_base64":"e30="}}'
```

The `result` bytes are the JSON answer. The first record on mainnet was made on 13 November 2026, in transaction
[`8CdwyCwV…te9v`](https://nearblocks.io/txns/8CdwyCwVPpdPM875SBWbBWKUp9eVe4uLy534B3vFte9v), from a
receipt signed by `0x835ab53d20294ef795906dff21ae4c045336aa26`, the key named in the attestation report
of `Qwen/Qwen3.8-27B` that day.
