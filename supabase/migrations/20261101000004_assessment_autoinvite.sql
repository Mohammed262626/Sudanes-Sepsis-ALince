-- Opening the final window is the moment it must reach everyone: the admin
-- flips it once and the invites go out in the same call. The first window is
-- opened at the start and its link rides the attendance message instead.

create or replace function public.set_assessment_window(p_stage text, p_open boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int := 0;
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

  if p_open and p_stage = 'post' then
    n := public.send_assessment_invite('post');
  end if;

  return jsonb_build_object('ok', true, 'sent', n);
end $$;
