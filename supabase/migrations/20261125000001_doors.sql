-- Doors: each physical entrance gets its own code/ID. The code is public by
-- nature (it is on a poster); identity still comes from the guest's token.
create table if not exists public.doors (
  id bigint generated always as identity primary key,
  label text not null,
  code text not null unique,
  created_at timestamptz not null default now()
);

alter table public.doors enable row level security;

create policy "admins manage doors"
  on public.doors for all to authenticated
  using (exists (select 1 from public.admin_emails where email = auth.email()))
  with check (exists (select 1 from public.admin_emails where email = auth.email()));

-- The one door already posted at the venue keeps working through the tab.
insert into public.doors (label, code)
  select 'البوابة الرئيسية', 'KASALA-DOOR-2026'
  on conflict (code) do nothing;

-- Accept any door code; the legacy config value stays valid.
create or replace function public.checkin_door(p_door text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      upper(trim(p_door)) = upper(c.door_pass)
      or exists (
        select 1 from public.doors d where upper(d.code) = upper(trim(p_door))
      )
    )
    and public.checkin_window_open(),
    false
  )
    from public.event_config c
   where c.id = 1;
$$;

grant execute on function public.checkin_door(text) to anon, authenticated;
