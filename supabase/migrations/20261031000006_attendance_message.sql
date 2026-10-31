-- Check-in confirmation message + ticket code inside the approval message.

-- Approval message now carries the ticket code (the QR alone isn't readable).
update public.message_templates
set body = replace(
  body,
  E'رمز QR المرفق هو تذكرتك — أظهره عند الدخول.',
  E'رقم تذكرتك: {{ticket_code}}\nرمز QR المرفق هو تذكرتك — أظهره عند الدخول.'
)
where key = 'registration_approved';

insert into public.message_templates (key, label, body) values
  ('registration_attended', 'تأكيد الحضور', E'أهلاً {{name}}،\nتم تسجيل حضوركم في مؤتمر كسلا للإنتان بنجاح ✅\nرقم تذكرتك: {{ticket_code}}\nنتمنى لكم مؤتمراً مفيداً.\n— التحالف السوداني للإنتان')
on conflict (key) do nothing;

-- Posts an ATTEND event when the door scan marks attendance.
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
    url := 'https://hdoylixxljkimdypfomp.supabase.co/functions/v1/notify',
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

create trigger notify_on_attendance
  after update of attended_at on public.conference_registrations
  for each row when (old.attended_at is null and new.attended_at is not null)
  execute function public.notify_attendance();
