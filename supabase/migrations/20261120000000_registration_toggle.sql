-- Registration start/stop toggle + a waitlist for "notify me when it opens".
-- The admin flips reg_open (set_conference_config) to let people register;
-- while closed, the conference form captures name+email into registration_notify
-- (unique email) and the admin can email the list when registration opens.

-- 1. The toggle column; start closed to match the current soon mode.
alter table public.event_config
  add column if not exists reg_open boolean not null default false;

update public.event_config
   set reg_open = not soon
 where id = 1;

-- 2. Waitlist: email is the dedup key.
create table if not exists public.registration_notify (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.registration_notify enable row level security;
alter table public.registration_notify
  add constraint registration_notify_email_key unique (email);

create policy "public add notify request"
  on public.registration_notify for insert to anon, authenticated
  with check (true);

create policy "admin reads notify list"
  on public.registration_notify for select to authenticated
  using (exists (select 1 from public.admin_emails where email = auth.email()));

-- 3. The gate now answers to reg_open, not the soon flag.
create or replace function public.registration_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select c.reg_open and now() < c.reg_deadline
  from public.event_config c
  where c.id = 1;
$$;

revoke execute on function public.registration_open() from public, anon, authenticated;
grant execute on function public.registration_open() to anon, authenticated;

-- 4. Expose the toggle to the public form.
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
    'soon', c.soon,
    'reg_open', c.reg_open
  )
  from public.event_config c
  where c.id = 1;
$$;

revoke execute on function public.event_public() from public, anon, authenticated;
grant execute on function public.event_public() to anon, authenticated;

-- 5. Admin write gains the toggle.
create or replace function public.set_conference_config(
  p_band_enabled boolean,
  p_soon boolean,
  p_event_date date,
  p_event_time text,
  p_reg_deadline timestamptz,
  p_reg_open boolean
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
         reg_deadline = p_reg_deadline,
         reg_open = p_reg_open
   where id = 1;
end;
$$;

revoke execute on function public.set_conference_config(boolean, boolean, date, text, timestamptz, boolean) from public, anon;
grant execute on function public.set_conference_config(boolean, boolean, date, text, timestamptz, boolean) to authenticated;

-- 6. Public dedup insert: insert unless that email is already waiting.
create or replace function public.register_notify(p_name text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ins boolean;
begin
  if p_email is null or length(trim(p_email)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_email');
  end if;

  insert into public.registration_notify (name, email)
  values (trim(p_name), lower(trim(p_email)))
  on conflict (email) do nothing
  returning true into ins;

  return jsonb_build_object(
    'ok', true,
    'inserted', coalesce(ins, false),
    'already', not coalesce(ins, false)
  );
end;
$$;

revoke execute on function public.register_notify(text, text) from public, anon, authenticated;
grant execute on function public.register_notify(text, text) to anon, authenticated;

-- 7. Admin bulk mail when registration opens: one http_post per row, exactly
-- like remind_pending, so the edge function gets the payload it knows.
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
      url := 'https://hdoylixxljkimdypfomp.supabase.co/functions/v1/notify',
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
end;
$$;

revoke execute on function public.notify_waitlist() from public, anon;
grant execute on function public.notify_waitlist() to authenticated;

-- 8. Admin alert on each waitlist signup, same channel as donations.
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
    url := 'https://hdoylixxljkimdypfomp.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(hook_secret, '')
    ),
    body := jsonb_build_object('table', 'registration_notify', 'record', to_jsonb(NEW))
  );
  return NEW;
end $$;

create trigger notify_on_registration_notify
  after insert on public.registration_notify
  for each row execute function public.notify_notify_signup();