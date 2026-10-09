-- Buku besar publik untuk pesanan yang dibayar lewat QRIS (docs/09 §7). Database tetap sumber kebenaran
-- soal uang (uangnya di Xendit); kolom ini mencatat sampai mana catatan di kontrak LummyLedger
-- (Arbitrum) sudah menyusul. Diisi server, tidak pernah dari browser.
alter table public.orders
  add column ledger_id text check (ledger_id ~ '^0x[0-9a-f]{64}$'),
  add column ledger_chain_id integer,
  add column ledger_contract text check (ledger_contract ~ '^0x[0-9a-fA-F]{40}$'),
  add column ledger_status text check (ledger_status in ('Open', 'Released', 'Refunded', 'Skipped')),
  add column ledger_error text,
  add column ledger_synced_at timestamptz;

comment on column public.orders.ledger_status is
  'Status catatan di LummyLedger setelah sinkron terakhir. Skipped = dibayar sebelum buku besar ada.';
comment on column public.orders.ledger_error is
  'Penolakan kontrak yang tidak hilang dengan dicoba ulang (mis. WindowClosed). Diisi = berhenti dicoba, staf memeriksa.';

-- Pesanan yang dibayar sebelum buku besar ada tidak dicatat belakangan: aturan waktunya (refund dan
-- klaim cuma sebelum window tutup) tidak bisa dipenuhi catatan yang ditulis jauh setelah kejadian.
update public.orders set ledger_status = 'Skipped' where payment_id is not null;

-- Sapuan: pesanan QRIS yang catatannya belum final dan tidak macet, yang paling lama tidak dicek dulu.
create index orders_ledger_pending_idx on public.orders (ledger_synced_at nulls first)
  where payment_id is not null and ledger_error is null and (ledger_status is null or ledger_status = 'Open');
