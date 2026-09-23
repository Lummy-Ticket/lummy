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
| `src/LummyEscrow.sol` | Escrow: listing, dana terkunci, window sengketa, rilis, refund, putusan |
| `src/MockUSDC.sol` | USDC tiruan untuk test lokal. Testnet dan produksi memakai USDC asli Circle |
| `test/LummyEscrow.t.sol` | Enam jalur outcome, window, komitmen barcode, hak akses, tanda tangan, reentrancy |
| `test/LummyEscrow.invariant.t.sol` | Aksi acak berurutan: saldo selalu sama dengan pembukuan, uang masuk sama dengan uang keluar |
| `test/MockUSDC.t.sol` | Perilaku ERC-3009 yang diandalkan escrow |

## Deploy dan siklus lokal

```bash
cd web && npm run chain:local   # Anvil, deploy, lalu siklus release, refund, dan dispute
```

Deploy manual: `ADMIN=0x… OPERATOR=0x… forge script script/Deploy.s.sol --rpc-url <rpc> --private-key <kunci> --broadcast`. Tanpa `TOKEN`, skrip ikut men-deploy MockUSDC. `DISPUTE_WINDOW` default 600 detik untuk demo, dan di Arbitrum One skrip menolak apa pun selain 172800. Alamat hasil deploy tertulis di `deployments/<chainId>.json`, lalu `npm run chain:abi` di `web/` menyalin ABI dan alamat chain publik.
