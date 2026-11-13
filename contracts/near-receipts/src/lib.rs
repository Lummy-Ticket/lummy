//! Lummy's receipt registry on NEAR.
//!
//! When a ticket is read by a model inside NEAR AI Cloud's TEE, the reply comes with a receipt: the text
//! `model:request_hash:response_hash`, signed by the key that lives inside that TEE (an Ethereum-style
//! secp256k1 signature over the EIP-191 form of the text). Our server checks that signature, and so does
//! NEAR's Verification Center in the reader's browser. This contract is a third checker that nobody
//! runs: it recovers the signer itself and keeps the receipt, so anyone can ask the chain "was this
//! exact request and reply signed, and by which key, and since when?" without trusting Lummy's server.
//!
//! What it does not do: it cannot tell that a key lives inside a TEE. That is what the model's
//! attestation report says, and NEAR's Verification Center checks it. Here a record proves only that
//! `signer` signed `signed_text`, and that the record has existed since `recorded_at_ms`.
//!
//! Anyone may record a receipt. The contract verifies before it stores, and each record costs its
//! caller a small deposit that pays for the storage, so the registry cannot be filled for free.

use near_sdk::store::IterableMap;
use near_sdk::{AccountId, NearToken, PanicOnDefault, env, near, require};

/// What one record costs its caller: it covers the storage of the record (under 1 KB) with room to spare.
const DEPOSIT: NearToken = NearToken::from_millinear(10);
/// A receipt's text is a model name and two 64-character hashes; anything much longer is not one. The
/// limit also keeps a record under the 1,000 bytes its deposit pays for: a record holds the text twice (in
/// its key and in itself), and one of 146 characters took 837 bytes on testnet.
const MAX_TEXT: usize = 200;

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Record {
    /// `model:request_hash:response_hash`, exactly as it was signed.
    pub signed_text: String,
    /// The 65-byte signature, 0x-prefixed hex.
    pub signature: String,
    /// The address this contract recovered from the signature, 0x-prefixed lowercase hex.
    pub signer: String,
    pub model: String,
    pub request_hash: String,
    pub response_hash: String,
    pub recorded_by: AccountId,
    /// Block time when it was recorded, in milliseconds.
    pub recorded_at_ms: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Registry {
    /// Keyed by `signed_text|signer`, so a stranger's signature over the same text cannot take the place
    /// of the TEE's.
    records: IterableMap<String, Record>,
}

#[near]
impl Registry {
    #[init]
    pub fn new() -> Self {
        Self { records: IterableMap::new(b"r") }
    }

    /// Verifies the signature and keeps the receipt. Fails, and keeps nothing, when the text is not a
    /// receipt, the signature cannot be read, or this receipt is already recorded.
    #[payable]
    pub fn record(&mut self, signed_text: String, signature: String) -> Record {
        require!(env::attached_deposit() >= DEPOSIT, "attach 0.01 NEAR: it pays for the record's storage");
        let (model, request_hash, response_hash) = parts(&signed_text);
        let signer = recover(&signed_text, &signature);
        let key = format!("{signed_text}|{signer}");
        require!(self.records.get(&key).is_none(), "this receipt is already recorded");
        let record = Record {
            signed_text,
            signature: signature.to_lowercase(),
            signer,
            model,
            request_hash,
            response_hash,
            recorded_by: env::predecessor_account_id(),
            recorded_at_ms: env::block_timestamp_ms(),
        };
        self.records.insert(key, record.clone());
        record
    }

    /// The record of this text signed by this address, if there is one.
    pub fn get(&self, signed_text: String, signer: String) -> Option<Record> {
        self.records.get(&format!("{signed_text}|{}", signer.to_lowercase())).cloned()
    }

    /// Who signed this text, by this contract's own arithmetic. Stores nothing: change one character of
    /// the text and the answer is another address.
    pub fn signer_of(&self, signed_text: String, signature: String) -> String {
        recover(&signed_text, &signature)
    }

    pub fn count(&self) -> u32 {
        self.records.len()
    }

    /// The newest records, oldest of them first. At most 50.
    pub fn recent(&self, limit: Option<u32>) -> Vec<Record> {
        let take = limit.unwrap_or(10).min(50) as usize;
        let skip = (self.records.len() as usize).saturating_sub(take);
        self.records.values().skip(skip).cloned().collect()
    }
}

/// The three parts of a receipt's text. The model's name may hold a colon; the hashes cannot.
fn parts(signed_text: &str) -> (String, String, String) {
    require!(signed_text.len() <= MAX_TEXT, "too long to be a receipt");
    let mut tail = signed_text.rsplitn(3, ':');
    let (response_hash, request_hash, model) = (tail.next(), tail.next(), tail.next());
    match (model, request_hash, response_hash) {
        (Some(m), Some(req), Some(res)) if !m.is_empty() && is_hash(req) && is_hash(res) => (m.to_string(), req.to_string(), res.to_string()),
        _ => env::panic_str("not a receipt: expected model:request_hash:response_hash with two 64-character hex hashes"),
    }
}

fn is_hash(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())
}

/// The address that signed `text` the way an Ethereum wallet signs a message (EIP-191).
fn recover(text: &str, signature: &str) -> String {
    let sig = unhex(signature);
    require!(sig.len() == 65, "a signature is 65 bytes");
    let v = match sig[64] {
        0 | 27 => 0,
        1 | 28 => 1,
        _ => env::panic_str("the signature's last byte must be 27 or 28"),
    };
    let mut message = format!("\x19Ethereum Signed Message:\n{}", text.len()).into_bytes();
    message.extend_from_slice(text.as_bytes());
    let digest = env::keccak256_array(&message);
    let Some(public_key) = env::ecrecover(&digest, &sig[..64], v, true) else {
        env::panic_str("the signature cannot be read");
    };
    let hashed = env::keccak256_array(&public_key);
    format!("0x{}", hex(&hashed[12..]))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn unhex(s: &str) -> Vec<u8> {
    let s = s.strip_prefix("0x").unwrap_or(s);
    require!(s.len() % 2 == 0 && s.bytes().all(|b| b.is_ascii_hexdigit()), "the signature must be hex");
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    // A throwaway key (0x11 repeated), signing the way NEAR AI's TEE signs a receipt. Made with viem.
    const SIGNER: &str = "0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a";
    const TEXT: &str = "Qwen/Qwen3.8-27B:1f58b9145b24d108d7ac38887338b3ea3229833b9c1e418250343f907bfd1047:a9f4b3d22a523fdada41c85c175425bcd15b32b4cd0f54d9433accd52d7195a1";
    const SIG: &str = "0x3f39a3788b38ecb35b1645bb9529abad40aa9529eeff67e89bbafadc2716a81a0812094203b788563297da93dfcebdfc8cf11aed1f0d7e2096dd6dd88e1551d91b";

    fn paying(millinear: u128) {
        testing_env!(
            VMContextBuilder::new()
                .predecessor_account_id("fan.testnet".parse().unwrap())
                .attached_deposit(NearToken::from_millinear(millinear))
                .block_timestamp(1_800_000_000_000_000_000)
                .build()
        );
    }

    fn changed(text: &str) -> String {
        let last = if text.ends_with('0') { '1' } else { '0' };
        format!("{}{}", &text[..text.len() - 1], last)
    }

    #[test]
    fn recovers_the_signer_of_a_real_signature() {
        paying(0);
        assert_eq!(Registry::new().signer_of(TEXT.into(), SIG.into()), SIGNER);
    }

    #[test]
    fn one_changed_character_is_another_signer() {
        paying(0);
        let got = std::panic::catch_unwind(|| Registry::new().signer_of(changed(TEXT), SIG.into()));
        assert!(got.map(|signer| signer != SIGNER).unwrap_or(true));
    }

    #[test]
    fn records_and_returns_the_receipt() {
        paying(10);
        let mut registry = Registry::new();
        let record = registry.record(TEXT.into(), SIG.into());
        assert_eq!(record.signer, SIGNER);
        assert_eq!(record.model, "Qwen/Qwen3.8-27B");
        assert_eq!(record.request_hash.len(), 64);
        assert_eq!(record.recorded_by.as_str(), "fan.testnet");
        assert_eq!(record.recorded_at_ms, 1_800_000_000_000);
        assert_eq!(registry.count(), 1);
        assert_eq!(registry.get(TEXT.into(), SIGNER.to_uppercase().replace("0X", "0x")), Some(record.clone()));
        assert_eq!(registry.recent(None), vec![record]);
        assert_eq!(registry.get(changed(TEXT), SIGNER.into()), None);
    }

    #[test]
    #[should_panic(expected = "already recorded")]
    fn refuses_the_same_receipt_twice() {
        paying(10);
        let mut registry = Registry::new();
        registry.record(TEXT.into(), SIG.into());
        registry.record(TEXT.into(), SIG.into());
    }

    #[test]
    #[should_panic(expected = "attach 0.01 NEAR")]
    fn refuses_a_record_that_does_not_pay_for_its_storage() {
        paying(9);
        Registry::new().record(TEXT.into(), SIG.into());
    }

    #[test]
    #[should_panic(expected = "not a receipt")]
    fn refuses_text_that_is_not_a_receipt() {
        paying(10);
        Registry::new().record("hello".into(), SIG.into());
    }

    #[test]
    #[should_panic(expected = "too long to be a receipt")]
    fn refuses_text_longer_than_its_deposit_pays_for() {
        paying(10);
        let long = format!("{}:{}", "m".repeat(80), &TEXT[17..]);
        assert!(long.len() > 200);
        Registry::new().record(long, SIG.into());
    }

    #[test]
    #[should_panic(expected = "65 bytes")]
    fn refuses_a_short_signature() {
        paying(10);
        Registry::new().record(TEXT.into(), "0x1234".into());
    }
}
