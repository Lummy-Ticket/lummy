# Security

**Reporting.** Write to [team@lummy.id](mailto:team@lummy.id) with what you found and how to reproduce it.
We answer within three working days. Please do not open a public issue for something that could move
money or expose a ticket file.

**What is at stake today.** The contracts are unaudited. On Arbitrum One the app lets only the team's own
accounts pay, with the team's own money, and the escrow caps an order at 25 USDC (a cap our admin key can change). Everyone else is on test rails:
QRIS in the payment provider's test mode, and test USDC on Arbitrum Sepolia.

**What we already know.** [`contracts/SECURITY-ANALYSIS.md`](contracts/SECURITY-ANALYSIS.md) lists the
static analysis findings with their triage and the known limits of the receiver contract: a refund
address the token refuses, funding a listing first, a leaked operator key, and what happens when our
server is gone.

**Please do not** test against orders or accounts that are not yours, or send real funds to the
contracts.
