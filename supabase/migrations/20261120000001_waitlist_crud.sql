-- Waitlist admin CRUD: allow admins to add, edit, and delete registration_notify
-- rows, matching the other admin data tables. Public insert stays (the
-- conference form) but only admins can read/write/delete.

create policy "admin updates notify list"
  on public.registration_notify for update to authenticated
  using (exists (select 1 from public.admin_emails where email = auth.email()))
  with check (exists (select 1 from public.admin_emails where email = auth.email()));

create policy "admin deletes notify list"
  on public.registration_notify for delete to authenticated
  using (exists (select 1 from public.admin_emails where email = auth.email()));