-- Editable WhatsApp message templates (admin-only).
-- The notify edge function reads these at send time and falls back to its
-- built-in text if a template is missing or blank.

create table public.message_templates (
  key text primary key,
  label text not null,
  body text not null,
  updated_at timestamptz not null default now()
);

alter table public.message_templates enable row level security;

create policy "admins read templates"
  on public.message_templates for select to authenticated
  using (exists (select 1 from public.admin_emails where email = auth.email()));

create policy "admins update templates"
  on public.message_templates for update to authenticated
  using (exists (select 1 from public.admin_emails where email = auth.email()))
  with check (exists (select 1 from public.admin_emails where email = auth.email()));

insert into public.message_templates (key, label, body) values
  ('registration_received', 'استلام الطلب', E'أهلاً {{name}}،\nاستلمنا طلب تسجيلك في مؤتمر كسلا للإنتان ✅\nسنتواصل معك قريباً لتأكيد القبول.\n— التحالف السوداني للإنتان'),
  ('registration_approved', 'القبول + التذكرة', E'أهلاً {{name}}،\nتم قبول تسجيلك في مؤتمر كسلا للإنتان ✅\nالاثنين 16 نوفمبر 2026 — 9:00 صباحاً — كسلا\nرمز QR المرفق هو تذكرتك — أظهره عند الدخول.\n— التحالف السوداني للإنتان'),
  ('registration_rejected', 'الرفض', E'أهلاً {{name}}،\nنشكرك على اهتمامك بمؤتمر كسلا للإنتان. للأسف لم نتمكن من قبول تسجيلك في هذه الدورة.\nنأمل أن نلتقي في فعاليات قادمة.\n— التحالف السوداني للإنتان');
