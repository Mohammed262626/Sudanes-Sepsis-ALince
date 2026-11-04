-- Web push: visitors who allowed notifications save their browser subscription.
-- Insert-only for the public (a subscription is not readable by anyone else),
-- admins read the count; the push-send function prunes dead endpoints itself.

create table public.push_subscriptions (
  endpoint text primary key,
  keys jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "visitors subscribe"
  on public.push_subscriptions for insert to anon, authenticated
  with check (true);

create policy "admins read subscriptions"
  on public.push_subscriptions for select to authenticated
  using (exists (select 1 from public.admin_emails where email = auth.email()));
