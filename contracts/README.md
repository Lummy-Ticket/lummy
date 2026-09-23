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
