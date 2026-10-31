-- Sudanese Sepsis Alliance — full schema.
-- Project: hdoylixxljkimdypfomp

create extension if not exists pgcrypto;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

create table public.activities (
  id bigint generated always as identity primary key,
  title text not null,
  excerpt text,
  body text,
  cover_url text,
  published_at date not null default current_date,
  created_at timestamptz not null default now()
);

create table public.contact_messages (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table public.donation_interests (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  support_type text,
  note text,
  created_at timestamptz not null default now()
);

create table public.conference_registrations (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  phone text not null,
  role text not null,
  organization text,
  note text,
  created_at timestamptz not null default now()
);

create table public.admin_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.activities enable row level security;
alter table public.contact_messages enable row level security;
alter table public.donation_interests enable row level security;
alter table public.conference_registrations enable row level security;
alter table public.admin_emails enable row level security;

create policy "public read activities"
  on public.activities for select to anon, authenticated using (true);

create policy "public insert contact messages"
  on public.contact_messages for insert to anon, authenticated with check (true);

create policy "public insert donation interests"
  on public.donation_interests for insert to anon, authenticated with check (true);

-- Registration closes 2026-11-03 23:59 Khartoum (UTC+2) = 21:59:59 UTC.
create policy "public register before deadline"
  on public.conference_registrations for insert to anon, authenticated
  with check (now() < timestamptz '2026-11-03 21:59:59+00');

create policy "admin sees own row"
  on public.admin_emails for select to authenticated using (email = auth.email());

create policy "admin reads contact messages"
  on public.contact_messages for select to authenticated
  using (exists (select 1 from public.admin_emails where email = auth.email()));

create policy "admin reads donations"
  on public.donation_interests for select to authenticated
  using (exists (select 1 from public.admin_emails where email = auth.email()));

create policy "admin reads registrations"
  on public.conference_registrations for select to authenticated
  using (exists (select 1 from public.admin_emails where email = auth.email()));

-- Reads a Vault secret for the notify edge function; never exposed to clients.
create or replace function public.get_app_secret(p_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name;
$$;

revoke execute on function public.get_app_secret(text) from public, anon, authenticated;

-- Hands each new submission to the notify edge function (it emails via Resend).
create or replace function public.notify_email()
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
    body := jsonb_build_object('table', TG_TABLE_NAME, 'record', to_jsonb(NEW))
  );
  return NEW;
end $$;

create trigger notify_on_contact
  after insert on public.contact_messages
  for each row execute function public.notify_email();

create trigger notify_on_donation
  after insert on public.donation_interests
  for each row execute function public.notify_email();

create trigger notify_on_registration
  after insert on public.conference_registrations
  for each row execute function public.notify_email();

insert into public.admin_emails (email) values ('admin@admin.com');
