-- Sends auto-reply emails directly to Brevo via pg_net, bypassing the Edge
-- Function. The Edge Function (notify) still handles WhatsApp for all three
-- tables; this trigger takes over the email leg for contact_messages and
-- donation_interests so that no Vault secret chaining is needed.

-- HTML layout matching the site palette, sans webfonts (clients have their own).
create or replace function public.email_layout(body text, preheader text default '')
returns text
language sql
immutable
as $$
select
  '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' ||
  '<meta name="viewport" content="width=device-width,initial-scale=1">' ||
  '<title>' || preheader || '</title></head>' ||
  '<body style="margin:0;padding:0;background:#f7f5f0;color:#15130f;direction:rtl;text-align:right;font-family:Tahoma,Arial,sans-serif;font-size:16px;line-height:1.6">' ||
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f0"><tr><td align="center" style="padding:32px 16px">' ||
  '<table role="presentation" width="100%" style="max-width:540px;background:#f7f5f0;border:2px solid #ddd8cf;padding:32px">' ||
  body ||
  '</table></td></tr></table></body></html>'
$$;

create or replace function public.send_auto_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  api_key text;
  subject text;
  html_body text;
  preheader text;
  name text;
begin
  select decrypted_secret into api_key
  from vault.decrypted_secrets
  where name = 'brevo_api_key';
  if api_key is null then
    raise warning 'send_auto_reply: brevo_api_key not in Vault';
    return NEW;
  end if;

  name := coalesce(NEW.name, '');

  if TG_TABLE_NAME = 'contact_messages' then
    subject := 'استلمنا رسالتك';
    preheader := 'استلمنا رسالتك — التحالف السوداني للإنتان';
    html_body :=
      '<h1 style="font-size:22px;margin:0 0 16px;color:#15130f">استلمنا رسالتك</h1>' ||
      '<p style="margin:0 0 16px;color:#15130f;line-height:1.7">أهلاً ' || name || '،</p>' ||
      '<p style="margin:0;color:#15130f;line-height:1.7">شكراً لتواصلك مع التحالف السوداني للإنتان. سنعود إليك في أقرب وقت.</p>';
  elsif TG_TABLE_NAME = 'donation_interests' then
    subject := 'شكراً لاهتمامك بدعم التحالف';
    preheader := 'شكراً لاهتمامك بدعم التحالف السوداني للإنتان';
    html_body :=
      '<h1 style="font-size:22px;margin:0 0 16px;color:#15130f">شكراً لاهتمامك</h1>' ||
      '<p style="margin:0 0 16px;color:#15130f;line-height:1.7">أهلاً ' || name || '،</p>' ||
      '<p style="margin:0;color:#15130f;line-height:1.7">سجّلنا اهتمامك بدعم التحالف السوداني للإنتان، وسنرسل لك تفاصيل الدعم فور جاهزيتها.</p>';
  else
    return NEW;
  end if;

  perform net.http_post(
    url := 'https://api.brevo.com/v3/smtp/email',
    headers := jsonb_build_object(
      'api-key', api_key,
      'Content-Type', 'application/json',
      'accept', 'application/json'
    ),
    body := jsonb_build_object(
      'sender', jsonb_build_object(
        'name', 'التحالف السوداني للإنتان',
        'email', 'info@sudansepsisalliance.com'
      ),
      'to', jsonb_build_array(jsonb_build_object('email', NEW.email)),
      'subject', subject,
      'htmlContent', public.email_layout(html_body, preheader)
    )
  );

  return NEW;
end $$;

-- Disable the old triggers that sent to the Edge Function (WhatsApp admin
-- alerts for these two tables were never sent because green_api_admin was
-- missing; the Edge Function still handles WhatsApp for registrations).
drop trigger if exists notify_on_contact on public.contact_messages;
drop trigger if exists notify_on_donation on public.donation_interests;

-- New triggers: fire the DB-side Brevo call directly.
create trigger send_reply_on_contact
  after insert on public.contact_messages
  for each row execute function public.send_auto_reply();

create trigger send_reply_on_donation
  after insert on public.donation_interests
  for each row execute function public.send_auto_reply();