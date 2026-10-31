-- Decline + reminder.
-- declined_at mirrors attended_at: status stays 'approved' so the dashboard
-- filters keep working, and the column is what says the seat is free again.

alter table public.conference_registrations
  add column if not exists declined_at timestamptz,
  add column if not exists reminder_sent_at timestamptz;

insert into public.message_templates (key, label, body) values
  ('registration_reminder', 'تذكير بالمؤتمر', E'أهلاً {{name}}،\nتذكير بمؤتمر كسلا للإنتان — الاثنين 16 نوفمبر 2026، 9:00 صباحاً، كسلا.\nرقم تذكرتك: {{ticket_code}}\nاضغط «تأكيد الحضور» عند وصولك، أو «لا أستطيع الحضور» إن تعذّر مجيئك.\n— التحالف السوداني للإنتان'),
  ('registration_declined', 'اعتذار عن الحضور', E'أهلاً {{name}}،\nسجّلنا اعتذارك عن حضور مؤتمر كسلا للإنتان، وأتحنا مقعدك لضيف آخر.\nشكراً لإبلاغنا، ونأمل أن نلتقي بك في فعالية قادمة.\n— التحالف السوداني للإنتان')
on conflict (key) do nothing;

-- The page now needs to know a guest has declined.
create or replace function public.checkin_lookup(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.conference_registrations;
begin
  if p_token is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if not public.checkin_window_open() then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  select * into r
    from public.conference_registrations
   where checkin_token = p_token;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if r.status <> 'approved' then
    return jsonb_build_object('ok', false, 'reason', 'not_approved');
  end if;

  return jsonb_build_object(
    'ok', true,
    'name', r.name,
    'ticket_code', r.ticket_code,
    'attended_at', r.attended_at,
    'declined_at', r.declined_at
  );
end $$;

-- A guest who declined can no longer be marked present.
create or replace function public.checkin_confirm(p_token uuid, p_door text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.conference_registrations;
begin
  if not public.checkin_window_open() then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  if not public.checkin_door(p_door) then
    return jsonb_build_object('ok', false, 'reason', 'bad_door');
  end if;

  update public.conference_registrations
     set attended_at = now()
   where checkin_token = p_token
     and status = 'approved'
     and attended_at is null
     and declined_at is null
  returning * into r;

  if found then
    return jsonb_build_object('ok', true, 'attended_at', r.attended_at);
  end if;

  select * into r
    from public.conference_registrations
   where checkin_token = p_token;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if r.status <> 'approved' then
    return jsonb_build_object('ok', false, 'reason', 'not_approved');
  end if;

  if r.declined_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'declined');
  end if;

  return jsonb_build_object('ok', true, 'attended_at', r.attended_at);
end $$;

-- "I can't come": frees the seat. Allowed outside the check-in window, because
-- guests often know days earlier.
create or replace function public.checkin_decline(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.conference_registrations;
begin
  update public.conference_registrations
     set declined_at = now()
   where checkin_token = p_token
     and status = 'approved'
     and attended_at is null
     and declined_at is null
  returning * into r;

  if found then
    return jsonb_build_object('ok', true, 'declined_at', r.declined_at);
  end if;

  select * into r
    from public.conference_registrations
   where checkin_token = p_token;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if r.status <> 'approved' then
    return jsonb_build_object('ok', false, 'reason', 'not_approved');
  end if;

  return jsonb_build_object('ok', true, 'declined_at', r.declined_at);
end $$;

-- Closing message for a decline.
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
    url := 'https://hdoylixxljkimdypfomp.supabase.co/functions/v1/notify',
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

create trigger notify_on_decline
  after update of declined_at on public.conference_registrations
  for each row when (old.declined_at is null and new.declined_at is not null)
  execute function public.notify_decline();

-- Reminder batch for the evening before: approved, not attended, not declined,
-- never reminded. Capped so Green API is not flooded; press again for the next
-- batch. reminder_sent_at makes it idempotent.
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
      url := 'https://hdoylixxljkimdypfomp.supabase.co/functions/v1/notify',
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

grant execute on function public.checkin_decline(uuid) to anon, authenticated;
revoke execute on function public.remind_pending(int) from public, anon;
grant execute on function public.remind_pending(int) to authenticated;