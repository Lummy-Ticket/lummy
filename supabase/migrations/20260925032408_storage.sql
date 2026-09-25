-- Lummy Ticket: private buckets (docs/09 §3.3).
-- No policies on storage.objects for these buckets, so no client can list, read or mint a
-- URL. Uploads and short-lived signed URLs go through server routes with the service
-- role, which is also where the KTP gate (425 before access_open_at) lives.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('tickets', 'tickets', false, 20971520, array['application/pdf']),
  ('ktp', 'ktp', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('evidence', 'evidence', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;
