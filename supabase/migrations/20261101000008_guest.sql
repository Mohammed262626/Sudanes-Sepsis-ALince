-- The guest dashboard works from the check-in token the guest already holds
-- (delivered in the approval message). Nothing to store, nothing to expose:
-- a security-definer read that returns only that guest's own row.

create or replace function public.guest_me(p_token text)
returns table (
  name text,
  ticket_code text,
  status text,
  attended_at timestamptz,
  assessment_token text,
  assessment_pre_open boolean,
  assessment_post_open boolean,
  pre_done boolean,
  post_done boolean
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
    )
  from public.conference_registrations r
  left join public.event_config c on c.id = 1
  where r.checkin_token::text = p_token
  limit 1;
$$;

revoke all on function public.guest_me(text) from public;
grant execute on function public.guest_me(text) to anon, authenticated;
