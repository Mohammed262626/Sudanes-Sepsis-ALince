-- Presence proof: the guest opens the page from WhatsApp (ID in the URI), then
-- has to scan the QR printed at the entrance before attendance can be written.
-- The door code is public by nature (it is on a poster); it only proves the
-- guest stood at the door. The per-guest checkin_token remains the real secret.

alter table public.event_config
  add column if not exists door_pass text not null default 'KASALA-DOOR-2026';

create or replace function public.checkin_door(p_door text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    upper(trim(p_door)) = upper(c.door_pass)
    and public.checkin_window_open(),
    false
  )
    from public.event_config c
   where c.id = 1;
$$;

-- Signature changes: the old one-argument version skipped the door check.
drop function if exists public.checkin_confirm(uuid);

create or replace function public.checkin_confirm(p_token uuid, p_door text)
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

  if not public.checkin_door(p_door) then
    return jsonb_build_object('ok', false, 'reason', 'bad_door');
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

grant execute on function public.checkin_door(text) to anon, authenticated;
grant execute on function public.checkin_confirm(uuid, text) to anon, authenticated;