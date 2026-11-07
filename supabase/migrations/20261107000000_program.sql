-- Day program for the guest dashboard. Admin-editable rows (RLS below), read by
-- everyone: no rebuild needed when the schedule changes.

create table if not exists public.conference_program (
  id bigint generated always as identity primary key,
  title text not null,
  starts_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.conference_program enable row level security;

drop policy if exists "program is public" on public.conference_program;
create policy "program is public"
  on public.conference_program for select to anon, authenticated
  using (true);

drop policy if exists "admins write program" on public.conference_program;
create policy "admins write program"
  on public.conference_program for all to authenticated
  using (exists (select 1 from public.admin_emails where email = auth.email()))
  with check (exists (select 1 from public.admin_emails where email = auth.email()));

-- Placeholder skeleton so the card is never empty; replace with the real
-- schedule in /admin → البرنامج.
insert into public.conference_program (title, starts_at, notes)
select * from (values
  ('تسجيل الحضور والافتتاح', timestamptz '2026-11-30 09:00:00+02', null),
  ('كلمة افتتاحية', timestamptz '2026-11-30 09:30:00+02', null),
  ('جلسة علمية: الكشف المبكر عن الإنتان', timestamptz '2026-11-30 10:00:00+02', null),
  ('استراحة', timestamptz '2026-11-30 11:30:00+02', null),
  ('جلسة نقاش: تجارب من الميدان', timestamptz '2026-11-30 12:00:00+02', null),
  ('الاستبيان الختامي والخاتمة', timestamptz '2026-11-30 13:00:00+02', null)
) as seed(title, starts_at, notes)
where not exists (select 1 from public.conference_program);
