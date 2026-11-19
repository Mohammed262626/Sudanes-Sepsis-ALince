-- Conference config: band toggle, soon mode, editable dates.
-- Admin controls these via the dashboard (set_conference_config RPC).
-- The public side reads them via event_public().

alter table public.event_config
  add column if not exists band_enabled boolean not null default true,
  add column if not exists reg_deadline timestamptz not null default '2026-11-16 21:59:59+00',
  add column if not exists event_time text not null default '9:00 صباحاً بتوقيت الخرطوم',
  add column if not exists soon boolean not null default false;

update public.event_config
   set band_enabled = false,
       soon = true
 where id = 1;

-- Public read of safe config fields.
create or replace function public.event_public()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'event_date', c.event_date,
    'event_time', c.event_time,
    'reg_deadline', c.reg_deadline,
    'band_enabled', c.band_enabled,
    'soon', c.soon
  )
  from public.event_config c
  where c.id = 1;
$$;

revoke execute on function public.event_public() from public, anon, authenticated;
grant execute on function public.event_public() to anon, authenticated;

-- Admin write of config.
create or replace function public.set_conference_config(
  p_band_enabled boolean,
  p_soon boolean,
  p_event_date date,
  p_event_time text,
  p_reg_deadline timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.event_config
     set band_enabled = p_band_enabled,
         soon = p_soon,
         event_date = p_event_date,
         event_time = p_event_time,
         reg_deadline = p_reg_deadline
   where id = 1;
end;
$$;

revoke execute on function public.set_conference_config(boolean, boolean, date, text, timestamptz) from public, anon;
grant execute on function public.set_conference_config(boolean, boolean, date, text, timestamptz) to authenticated;

-- Dynamic registration gate used by the insert policy.
create or replace function public.registration_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not c.soon and now() < c.reg_deadline
  from public.event_config c
  where c.id = 1;
$$;

revoke execute on function public.registration_open() from public, anon, authenticated;
grant execute on function public.registration_open() to anon, authenticated;

-- Replace the hardcoded-timestamp insert policy with the dynamic gate.
drop policy if exists "public register before deadline" on public.conference_registrations;

create policy "public register before deadline"
  on public.conference_registrations for insert to anon, authenticated
  with check (public.registration_open());

-- Message templates still contain literal dates; admin must update them manually
-- when changing the event date. A later migration could replace literals with
-- placeholders.