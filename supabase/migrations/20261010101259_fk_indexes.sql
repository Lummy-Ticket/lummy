-- Advisor performa (10 Okt 2026): foreign key tanpa indeks. Menghapus profil (akun) menyetel kolom ini
-- ke null, dan tanpa indeks Postgres membaca seluruh tabel untuk menemukan barisnya.
create index gate_scans_scanned_by_idx on public.gate_scans (scanned_by);
create index payments_refunded_by_idx on public.payments (refunded_by);
