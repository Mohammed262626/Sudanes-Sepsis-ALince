-- Manual sign-in for the guest dashboard: the guest types the phone or email on
-- the registration plus the 6 characters after "SX-" on the ticket. Returns the
-- same row as guest_me so the client can store the token and reuse it.

create or replace function public.guest_login(p_contact text, p_code text)
returns table (
  name text,
  ticket_code text,
  status text,
  attended_at timestamptz,
  assessment_token text,
  assessment_pre_open boolean,
  assessment_post_open boolean,
  pre_done boolean,
  post_done boolean,
  token text
)
language sql
security definer
set search_path = ''
as $$
  select
    r.name,
    r.ticket_code,
    r.status,
    r.attended_at,
    r.assessment_token,
    coalesce(c.assessment_pre_open, false),
    coalesce(c.assessment_post_open, false),
    exists (
      select 1 from public.assessment_responses a
      where a.registration_id = r.id and a.stage = 'pre'
    ),
    exists (
      select 1 from public.assessment_responses a
      where a.registration_id = r.id and a.stage = 'post'
    ),
    r.checkin_token::text
  from public.conference_registrations r
  left join public.event_config c on c.id = 1
  where (
      lower(r.email) = lower(trim(p_contact))
      or (
        regexp_replace(p_contact, '\D', '', 'g') <> ''
        and regexp_replace(r.phone, '\D', '', 'g') =
            regexp_replace(p_contact, '\D', '', 'g')
      )
    )
    and upper(right(replace(r.ticket_code, '-', ''), 6)) =
        upper(trim(p_code))
  limit 1;
$$;

revoke all on function public.guest_login(text, text) from public;
grant execute on function public.guest_login(text, text) to anon, authenticated;
