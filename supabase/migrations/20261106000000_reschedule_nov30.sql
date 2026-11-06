-- Conference rescheduled: event 30 Nov 2026, registration closes 16 Nov 2026
-- 23:59 Khartoum (UTC+2) = 21:59:59 UTC. This supersedes the insert policy in
-- 20261031000000_init.sql; the old migration stays as history.

drop policy if exists "public register before deadline" on public.conference_registrations;

create policy "public register before deadline"
  on public.conference_registrations for insert to anon, authenticated
  with check (now() < timestamptz '2026-11-16 21:59:59+00');

alter table public.event_config
  alter column event_date set default '2026-11-30';

update public.event_config
   set event_date = '2026-11-30',
       -- checkin_window_open() also accepts the override; leaving it true would
       -- let any ticket be marked attended for the next three weeks.
       checkin_open = false
 where id = 1;

-- Templates live in the database, so the seed text is not what gets sent.
update public.message_templates
   set body = replace(body, '16 نوفمبر 2026', '30 نوفمبر 2026'),
       updated_at = now()
 where body like '%16 نوفمبر 2026%';
