-- Pre/post assessment for attendees.
-- The link carries a hash of the door token (never the token itself), attendees
-- only, pre before post, and the admin flips each window on its own.

alter table public.event_config
  add column if not exists assessment_pre_open boolean not null default false,
  add column if not exists assessment_post_open boolean not null default false;

alter table public.conference_registrations
  add column if not exists assessment_token text
    generated always as (md5(checkin_token::text || 'sep-assessment-2026')) stored;

create unique index if not exists conference_registrations_assessment_token_key
  on public.conference_registrations (assessment_token);

create table if not exists public.assessment_responses (
  id bigint generated always as identity primary key,
  registration_id bigint not null
    references public.conference_registrations (id) on delete cascade,
  stage text not null check (stage in ('pre', 'post')),
  answers jsonb not null,
  created_at timestamptz not null default now(),
  unique (registration_id, stage)
);

alter table public.assessment_responses enable row level security;

create policy "admin reads assessments"
  on public.assessment_responses for select to authenticated
  using (exists (select 1 from public.admin_emails where email = auth.email()));

create policy "admin reads event config"
  on public.event_config for select to authenticated
  using (exists (select 1 from public.admin_emails where email = auth.email()));

-- Internal only: which window is open right now.
create or replace function public.assessment_window(p_stage text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when p_stage = 'pre' then c.assessment_pre_open
           when p_stage = 'post' then c.assessment_post_open
           else false
         end
    from public.event_config c
   where c.id = 1;
$$;

revoke execute on function public.assessment_window(text) from public, anon, authenticated;

-- What the page may show for this hash + stage. Never reveals contact details.
create or replace function public.assessment_lookup(p_token text, p_stage text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.conference_registrations;
  answered boolean;
begin
  if p_stage not in ('pre', 'post') then
    return jsonb_build_object('ok', false, 'reason', 'bad_stage');
  end if;

  select * into r from public.conference_registrations where assessment_token = p_token;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if r.attended_at is null then
    return jsonb_build_object('ok', false, 'reason', 'not_attended');
  end if;

  select exists (
    select 1 from public.assessment_responses
     where registration_id = r.id and stage = p_stage
  ) into answered;

  if not answered and not public.assessment_window(p_stage) then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  if p_stage = 'post' and not exists (
    select 1 from public.assessment_responses
     where registration_id = r.id and stage = 'pre'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'no_pre');
  end if;

  return jsonb_build_object('ok', true, 'name', r.name, 'stage', p_stage, 'answered', answered);
end $$;

-- Answers are written through here only: attended, window open, pre before post.
create or replace function public.assessment_submit(p_token text, p_stage text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.conference_registrations;
  gate jsonb;
begin
  gate := public.assessment_lookup(p_token, p_stage);
  if not (gate ->> 'ok')::boolean then
    return gate;
  end if;

  if (gate ->> 'answered')::boolean then
    return jsonb_build_object('ok', true, 'answered', true);
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'bad_answers');
  end if;

  select * into r from public.conference_registrations where assessment_token = p_token;

  insert into public.assessment_responses (registration_id, stage, answers)
  values (r.id, p_stage, p_answers)
  on conflict (registration_id, stage) do nothing;

  return jsonb_build_object('ok', true, 'answered', false);
end $$;

grant execute on function public.assessment_lookup(text, text) to anon, authenticated;
grant execute on function public.assessment_submit(text, text, jsonb) to anon, authenticated;

-- Admin: open/close either window.
create or replace function public.set_assessment_window(p_stage text, p_open boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admin_emails where email = auth.email()) then
    raise exception 'not authorized';
  end if;

  if p_stage = 'pre' then
    update public.event_config set assessment_pre_open = p_open where id = 1;
  elsif p_stage = 'post' then
    update public.event_config set assessment_post_open = p_open where id = 1;
  else
    return jsonb_build_object('ok', false, 'reason', 'bad_stage');
  end if;

  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.set_assessment_window(text, boolean) from public, anon;
grant execute on function public.set_assessment_window(text, boolean) to authenticated;

-- Admin: WhatsApp both links to every attendee who still owes this stage.
-- No batch cap: attendees are few, and a missed guest is worse than a burst.
-- shortcut: re-pressing resends to everyone unanswered, there is no sent stamp.
create or replace function public.send_assessment_invite(p_stage text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  reg public.conference_registrations;
  hook_secret text;
  n int := 0;
begin
  if not exists (select 1 from public.admin_emails where email = auth.email()) then
    raise exception 'not authorized';
  end if;

  if p_stage not in ('pre', 'post') then
    return 0;
  end if;

  select decrypted_secret into hook_secret
    from vault.decrypted_secrets where name = 'webhook_secret';

  for reg in
    select *
      from public.conference_registrations r
     where r.attended_at is not null
       and r.phone is not null
       and length(trim(r.phone)) > 0
       and not exists (
         select 1 from public.assessment_responses a
          where a.registration_id = r.id and a.stage = p_stage
       )
       and (p_stage = 'pre' or exists (
         select 1 from public.assessment_responses a
          where a.registration_id = r.id and a.stage = 'pre'
       ))
     order by r.created_at
  loop
    perform net.http_post(
      url := 'https://hdoylixxljkimdypfomp.supabase.co/functions/v1/notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', coalesce(hook_secret, '')
      ),
      body := jsonb_build_object(
        'table', 'conference_registrations',
        'event', 'ASSESSMENT',
        'stage', p_stage,
        'record', to_jsonb(reg)
      )
    );
    n := n + 1;
  end loop;

  return n;
end $$;

revoke execute on function public.send_assessment_invite(text) from public, anon;
grant execute on function public.send_assessment_invite(text) to authenticated;
