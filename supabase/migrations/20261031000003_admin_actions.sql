-- Admin actions: delete a registration, re-send an approved ticket.

create policy "admins delete registrations"
  on public.conference_registrations for delete to authenticated
  using (exists (select 1 from public.admin_emails where email = auth.email()));

-- Re-fires the approval message for an already approved registration (the update
-- trigger only fires when the status changes).
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
    url := 'https://hdoylixxljkimdypfomp.supabase.co/functions/v1/notify',
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

revoke execute on function public.resend_ticket(bigint) from public, anon;
grant execute on function public.resend_ticket(bigint) to authenticated;