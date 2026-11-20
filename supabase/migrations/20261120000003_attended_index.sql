-- Door screens poll the attended list every few seconds, ordered newest-first.
-- Partial + descending matches that query exactly, so the poll stops scanning
-- and sorting the whole table as attendance grows.
create index if not exists conference_registrations_attended_idx
  on public.conference_registrations (attended_at desc)
  where attended_at is not null;
