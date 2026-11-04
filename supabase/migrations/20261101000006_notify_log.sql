-- Every WhatsApp send result, so the dashboard can say what Green API answered.
-- The notify function writes with the service role; admins only read.

create table public.notify_log (
  id bigint generated always as identity primary key,
  ref_table text not null,
  ref_id bigint,
  kind text not null,
  chat_id text not null default '',
  ok boolean not null,
  status int not null default 0,
  error text,
  created_at timestamptz not null default now()
);

create index notify_log_ref_idx on public.notify_log (ref_id, created_at desc);

alter table public.notify_log enable row level security;

create policy "admins read notify log"
  on public.notify_log for select to authenticated
  using (exists (select 1 from public.admin_emails where email = auth.email()));
