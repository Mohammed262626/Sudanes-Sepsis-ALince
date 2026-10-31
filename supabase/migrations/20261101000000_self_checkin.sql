-- Self check-in: the ticket QR carries an unguessable token, so the public page
-- only opens from the QR itself. The readable ticket code stays in the QR text
-- for the door scanner, but it can no longer open anything on its own.

create table public.event_config (
  id smallint primary key default 1 check (id = 1),
  event_date date not null default '2026-11-16',
  -- True for now so the flow can be tested; set to false before the conference
  -- and only event_date (Africa/Khartoum) passes.
  checkin_open boolean not null default true
);

insert into public.event_config (id) values (1);

alter table public.event_config enable row level security;

-- One random pass per registration; existing rows are filled by this migration.
alter table public.conference_registrations
  add column if not exists checkin_token uuid not null default gen_random_uuid();

create unique index if not exists conference_registrations_checkin_token_key
  on public.conference_registrations (checkin_token);

create or replace function public.checkin_window_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select c.checkin_open
      or (now() at time zone 'Africa/Khartoum')::date = c.event_date
    from public.event_config c
   where c.id = 1;
$$;

-- Looks a guest up by its pass only. Returns a name and nothing contactable.
create or replace function public.checkin_lookup(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.conference_registrations;
begin
  if p_token is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if not public.checkin_window_open() then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  select * into r
    from public.conference_registrations
   where checkin_token = p_token;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if r.status <> 'approved' then
    return jsonb_build_object('ok', false, 'reason', 'not_approved');
  end if;

  return jsonb_build_object(
    'ok', true,
    'name', r.name,
    'ticket_code', r.ticket_code,
    'attended_at', r.attended_at
  );
end $$;

-- Marks attendance once; a second press changes nothing and never re-notifies.
create or replace function public.checkin_confirm(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.conference_registrations;
begin
  if not public.checkin_window_open() then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  update public.conference_registrations
     set attended_at = now()
   where checkin_token = p_token
     and status = 'approved'
     and attended_at is null
  returning * into r;

  if found then
    return jsonb_build_object('ok', true, 'attended_at', r.attended_at);
  end if;

  select * into r
    from public.conference_registrations
   where checkin_token = p_token;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if r.status <> 'approved' then
    return jsonb_build_object('ok', false, 'reason', 'not_approved');
  end if;

  return jsonb_build_object('ok', true, 'attended_at', r.attended_at);
end $$;

grant execute on function public.checkin_lookup(uuid) to anon, authenticated;
grant execute on function public.checkin_confirm(uuid) to anon, authenticated;