-- Per-environment message hooks. The trigger functions used to hardcode the
-- hosted project's notify URL, so a dev database mailed through prod, whose
-- emails and QR codes carry prod links. Each environment now names its own
-- notify function in Vault (notify_url); prod without the row falls back to
-- the hosted URL and behaves exactly as before.
--
-- Sites for the links inside the messages are read by the notify function
-- itself from Vault (site_url) — no SQL change needed for those.

create or replace function public.notify_hook_url()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'notify_url'),
    'https://hdoylixxljkimdypfomp.supabase.co/functions/v1/notify'
  );
$$;

revoke execute on function public.notify_hook_url() from public, anon, authenticated;

-- The definitions below are the latest bodies of each hook, unchanged except
-- for the swapped URL.

create or replace function public.notify_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hook_secret text;
  payload jsonb;
begin
  select decrypted_secret into hook_secret from vault.decrypted_secrets where name = 'webhook_secret';

  if TG_OP = 'UPDATE' then
    payload := jsonb_build_object(
      'table', TG_TABLE_NAME, 'event', TG_OP,
      'old_status', to_jsonb(OLD) ->> 'status',
      'record', to_jsonb(NEW)
    );
  else
    payload := jsonb_build_object('table', TG_TABLE_NAME, 'event', TG_OP, 'record', to_jsonb(NEW));
  end if;

  perform net.http_post(
    url := public.notify_hook_url(),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(hook_secret, '')
    ),
    body := payload
  );
  return NEW;
end $$;

create or replace function public.resend_ticket(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  reg public.conference_registrations;
  hook_secret text;
begin
  if not exists (select 1 from public.admin_emails where email = auth.email()) then
    raise exception 'not authorized';
  end if;

  select * into reg
  from public.conference_registrations
  where id = p_id and status = 'approved';

  if reg.id is null then
    raise exception 'registration not found or not approved';
  end if;

  select decrypted_secret into hook_secret
  from vault.decrypted_secrets where name = 'webhook_secret';

  perform net.http_post(
    url := public.notify_hook_url(),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(hook_secret, '')
    ),
    body := jsonb_build_object(
      'table', 'conference_registrations',
      'event', 'RESEND',
      'record', to_jsonb(reg)
    )
  );
end $$;

create or replace function public.notify_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hook_secret text;
begin
  select decrypted_secret into hook_secret from vault.decrypted_secrets where name = 'webhook_secret';
  perform net.http_post(
    url := public.notify_hook_url(),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(hook_secret, '')
    ),
    body := jsonb_build_object(
      'table', 'conference_registrations',
      'event', 'ATTEND',
      'record', to_jsonb(NEW)
    )
  );
  return NEW;
end $$;

create or replace function public.notify_decline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hook_secret text;
begin
  select decrypted_secret into hook_secret from vault.decrypted_secrets where name = 'webhook_secret';
  perform net.http_post(
    url := public.notify_hook_url(),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(hook_secret, '')
    ),
    body := jsonb_build_object(
      'table', 'conference_registrations',
      'event', 'DECLINE',
      'record', to_jsonb(NEW)
    )
  );
  return NEW;
end $$;

create or replace function public.remind_pending(p_limit int default 25)
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

  select decrypted_secret into hook_secret
  from vault.decrypted_secrets where name = 'webhook_secret';

  for reg in
    select *
      from public.conference_registrations
     where status = 'approved'
       and attended_at is null
       and declined_at is null
       and reminder_sent_at is null
       and phone is not null
       and length(trim(phone)) > 0
     order by created_at
     limit greatest(1, least(coalesce(p_limit, 25), 50))
  loop
    update public.conference_registrations
       set reminder_sent_at = now()
     where id = reg.id;

    perform net.http_post(
      url := public.notify_hook_url(),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', coalesce(hook_secret, '')
      ),
      body := jsonb_build_object(
        'table', 'conference_registrations',
        'event', 'REMIND',
        'record', to_jsonb(reg)
      )
    );
    n := n + 1;
  end loop;

  return n;
end $$;

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
      url := public.notify_hook_url(),
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

create or replace function public.notify_waitlist()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  row public.registration_notify;
  hook_secret text;
  n int := 0;
begin
  if not exists (select 1 from public.admin_emails where email = auth.email()) then
    raise exception 'not authorized';
  end if;

  if not public.registration_open() then
    raise exception 'registration not open';
  end if;

  select decrypted_secret into hook_secret
  from vault.decrypted_secrets where name = 'webhook_secret';

  for row in
    select * from public.registration_notify order by created_at
  loop
    perform net.http_post(
      url := public.notify_hook_url(),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', coalesce(hook_secret, '')
      ),
      body := jsonb_build_object(
        'table', 'registration_notify',
        'event', 'OPEN',
        'record', jsonb_build_object(
          'id', row.id,
          'name', row.name,
          'email', row.email
        )
      )
    );
    n := n + 1;
  end loop;

  return n;
end $$;

create or replace function public.notify_notify_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hook_secret text;
begin
  select decrypted_secret into hook_secret from vault.decrypted_secrets where name = 'webhook_secret';
  perform net.http_post(
    url := public.notify_hook_url(),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(hook_secret, '')
    ),
    body := jsonb_build_object('table', 'registration_notify', 'record', to_jsonb(NEW))
  );
  return NEW;
end $$;
