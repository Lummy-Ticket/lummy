-- Pemindai gate (docs/09 §8): tiap scan di pintu masuk sebuah acara. Satu tiket cuma bisa masuk sekali,
-- dijaga database lewat unique index sebagian, jadi dua scan di detik yang sama tetap cuma satu yang
-- masuk. Satuan masuknya kunci barcode tiket (HMAC, sama dengan listing_barcodes), atau 'order:<id>'
-- untuk tiket contoh tanpa file. Diisi server, tidak pernah dari browser.
create table public.gate_scans (
  id bigint generated always as identity primary key,
  event_id text not null references public.events (id) on delete cascade,
  unit text not null check (char_length(unit) between 1 and 80),
  -- Pesanan Lummy yang pass-nya dipindai; kosong untuk barcode mentah atau salinan.
  order_id text references public.orders (id) on delete set null,
  -- Yang dipindai: pass masuk Lummy, barcode tiket aslinya, atau salinan (simulasi presenter).
  credential text not null check (credential in ('pass', 'barcode', 'copy')),
  result text not null check (result in ('admitted', 'refused')),
  reason text check (reason in ('ALREADY_USED', 'ALREADY_ADMITTED', 'WRONG_SHOW', 'ORDER_CLOSED')),
  gate text not null default 'Gate 1' check (char_length(gate) between 1 and 40),
  scanned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index gate_scans_one_admission on public.gate_scans (event_id, unit) where result = 'admitted';
create index gate_scans_event_idx on public.gate_scans (event_id, created_at desc);
create index gate_scans_order_idx on public.gate_scans (order_id) where order_id is not null;

alter table public.gate_scans enable row level security;
revoke all on public.gate_scans from anon, authenticated;
