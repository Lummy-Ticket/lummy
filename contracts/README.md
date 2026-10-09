# Kontrak escrow Lummy

Foundry. Desain dan keputusannya ada di [`docs/09-technical-design.md`](../docs/09-technical-design.md), bagian "Keputusan terkunci".

```bash
cd contracts
git submodule update --init --recursive   # sekali setelah clone: OpenZeppelin dan forge-std
forge build
forge test
```

| Berkas | Isi |
|---|---|
| `src/LummyEscrow.sol` | Escrow: listing, dana terkunci sampai acara selesai + window, bukti serah terima, rilis, refund, putusan. Operator boleh bertindak atas nama pengguna (Model A) |
| `src/MockUSDC.sol` | USDC tiruan untuk test lokal. Testnet dan produksi memakai USDC asli Circle |
| `test/LummyEscrow.t.sol` | Enam jalur outcome, Model A, acara selesai dan penundaan, window, bukti serah terima, komitmen barcode, hak akses, tanda tangan, reentrancy |
| `test/LummyEscrow.invariant.t.sol` | Aksi acak berurutan, termasuk aksi terlarang: saldo selalu sama dengan pembukuan, uang masuk sama dengan uang keluar, operator tidak pernah dapat dana, aksi terlarang selalu ditolak |
| `test/MockUSDC.t.sol` | Perilaku ERC-3009 yang diandalkan escrow |

Kampanye invariant panjang (10.000 urutan acak, sekitar 3,5 menit): `FOUNDRY_PROFILE=deep forge test --match-contract Invariant`.

## Deploy dan siklus lokal

```bash
cd web && npm run chain:local   # Anvil, deploy, lalu empat siklus: release, refund, dispute, acara besok
cd web && npm run chain:fork    # gladi testnet: fork Arbitrum Sepolia, USDC asli Circle, tanpa faucet
```

Semua transaksi siklus dikirim operator, jadi di testnet cuma operator yang butuh ETH. Pembeli simulasi cuma menandatangani dan butuh USDC.

Deploy manual: `ADMIN=0x… OPERATOR=0x… forge script script/Deploy.s.sol --rpc-url <rpc> --private-key <kunci> --broadcast`. Tanpa `TOKEN`, skrip ikut men-deploy MockUSDC. `DISPUTE_WINDOW` default 600 detik untuk demo, dan di Arbitrum One skrip menolak apa pun selain 172800. Alamat hasil deploy tertulis di `deployments/<chainId>.json`, lalu `npm run chain:abi` di `web/` menyalin ABI dan alamat chain publik.

Buku besar pesanan QRIS (`LummyLedger`, [docs/09 §7](../docs/09-technical-design.md)): `ADMIN=0x… OPERATOR=0x… forge script script/DeployLedger.s.sol --rpc-url <rpc> --private-key <kunci> --broadcast --verify --etherscan-api-key <kunci etherscan>`. `LEDGER_WINDOW` default 172800 (48 jam, juga di testnet, sama dengan aturan pesanan QRIS di aplikasi); di Arbitrum One skrip menolak nilai lain. Hasilnya di `deployments/ledger-<chainId>.json`, dan `npm run chain:abi` ikut menyalinnya.

Verifikasi kode di Arbiscan dan Sourcify: [`docs/config/03`](../docs/config/03-verifikasi-kontrak.md). Escrow testnet `0x6830…25Dd` sudah terverifikasi (7 Okt 2026).
