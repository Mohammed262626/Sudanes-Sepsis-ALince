-- Sends auto-reply emails directly to Brevo via pg_net, bypassing the Edge
-- Function. The Edge Function (notify) still handles WhatsApp for all three
-- tables; this trigger takes over the email leg for contact_messages and
-- donation_interests so that no Vault secret chaining is needed.

-- Branded HTML layout matching the site palette: logo header, Cairo webfont,
-- ink-white card, accent stripe, footer with disclaimer. Fonts served from the
-- production domain so they work in clients with @font-face support.
create or replace function public.email_layout(body text, preheader text default '')
returns text
language sql
immutable
as $$
select
  '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' ||
  '<meta name="viewport" content="width=device-width,initial-scale=1">' ||
  '<title>التحالف السوداني للإنتان</title>' ||
  '<style>@font-face{font-family:Cairo;src:url(https://sudansepsisalliance.com/fonts/cairo-arabic-wght-normal.woff2) format("woff2");font-weight:200 1000;font-style:normal;font-display:swap}' ||
  '@font-face{font-family:Cairo;src:url(https://sudansepsisalliance.com/fonts/cairo-latin-wght-normal.woff2) format("woff2");font-weight:200 1000;font-style:normal;font-display:swap}</style>' ||
  '</head>' ||
  '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' || preheader || '</div>' ||
  '<body dir="rtl" style="margin:0;padding:0;background:#f7f5f0;color:#15130f;direction:rtl;text-align:right;font-family:Cairo,Tahoma,Arial,sans-serif;font-size:16px;-webkit-text-size-adjust:100%">' ||
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl" style="background:#f7f5f0"><tr><td align="center" style="padding:32px 16px">' ||
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl" style="max-width:600px;width:100%;background:#ffffff;border:2px solid #15130f">' ||
  '<tr><td dir="rtl" align="right" style="background:#15130f;padding:20px 24px;text-align:right">' ||
  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="rtl" style="border-collapse:collapse"><tr>' ||
  '<td style="padding-left:14px;vertical-align:middle">' ||
  '<img src="https://sudansepsisalliance.com/logo.png" width="85" height="56" alt="" style="display:block;border:0;outline:none;text-decoration:none;width:85px;height:56px">' ||
  '</td>' ||
  '<td style="vertical-align:middle;text-align:right">' ||
  '<div style="color:#f7f5f0;font-size:17px;font-weight:bold">التحالف السوداني للإنتان</div>' ||
  '<div style="color:#b9b3a7;font-size:12px;margin-top:4px">مؤتمر كسلا للإنتان — 30 نوفمبر 2026</div>' ||
  '</td></tr></table></td></tr>' ||
  '<tr><td style="height:4px;line-height:4px;font-size:0;background:#962567">&nbsp;</td></tr>' ||
  '<tr><td dir="rtl" align="right" style="padding:28px 24px 8px;font-size:16px;line-height:1.75;color:#15130f;text-align:right">' || body || '</td></tr>' ||
  '<tr><td dir="rtl" align="right" style="padding:18px 24px 24px;border-top:2px solid #ddd8cf;font-size:12px;line-height:1.8;color:#6f6a62;text-align:right">' ||
  '<a href="https://sudansepsisalliance.com" style="color:#962567;text-decoration:none">التحالف السوداني للإنتان</a><br>' ||
  'رسالة تلقائية — لا تُستخدم للإبلاغ عن حالات طبية طارئة.' ||
  '</td></tr></table></td></tr></table></body></html>'
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
  v_name text;
begin
  select decrypted_secret into api_key
  from vault.decrypted_secrets
  where name = 'brevo_api_key';
  if api_key is null then
    raise warning 'send_auto_reply: brevo_api_key not in Vault';
    return NEW;
  end if;

  v_name := coalesce(NEW.name, '');

  if TG_TABLE_NAME = 'contact_messages' then
    subject := 'استلمنا رسالتك';
    preheader := 'استلمنا رسالتك — التحالف السوداني للإنتان';
    html_body :=
      '<h1 style="font-size:22px;margin:0 0 16px;color:#15130f">استلمنا رسالتك</h1>' ||
      '<p style="margin:0 0 16px;color:#15130f;line-height:1.7">أهلاً ' || v_name || '،</p>' ||
      '<p style="margin:0;color:#15130f;line-height:1.7">شكراً لتواصلك مع التحالف السوداني للإنتان. سنعود إليك في أقرب وقت.</p>';
  elsif TG_TABLE_NAME = 'donation_interests' then
    subject := 'شكراً لاهتمامك بدعم التحالف';
    preheader := 'شكراً لاهتمامك بدعم التحالف السوداني للإنتان';
    html_body :=
      '<h1 style="font-size:22px;margin:0 0 16px;color:#15130f">شكراً لاهتمامك</h1>' ||
      '<p style="margin:0 0 16px;color:#15130f;line-height:1.7">أهلاً ' || v_name || '،</p>' ||
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