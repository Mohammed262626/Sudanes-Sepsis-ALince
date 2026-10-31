-- Two-stage registration: pending → approved/rejected, with a ticket code for the door.

alter table public.conference_registrations
  add column status text not null default 'pending',
  add column ticket_code text default ('SX-' || upper(substr(md5(random()::text), 1, 6)));

update public.conference_registrations
  set ticket_code = 'SX-' || upper(substr(md5(random()::text), 1, 6))
  where ticket_code is null;

alter table public.conference_registrations
  add constraint conference_registrations_status_check
    check (status in ('pending', 'approved', 'rejected')),
  add constraint conference_registrations_ticket_code_key unique (ticket_code);

create policy "admins update registrations"
  on public.conference_registrations for update to authenticated
  using (exists (select 1 from public.admin_emails where email = auth.email()))
  with check (exists (select 1 from public.admin_emails where email = auth.email()));

-- The function now also reports the event type, so approvals can be handled differently.
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
    url := 'https://hdoylixxljkimdypfomp.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(hook_secret, '')
    ),
    body := payload
  );
  return NEW;
end $$;

create trigger notify_on_registration_status
  after update of status on public.conference_registrations
  for each row when (old.status is distinct from new.status)
  execute function public.notify_email();
