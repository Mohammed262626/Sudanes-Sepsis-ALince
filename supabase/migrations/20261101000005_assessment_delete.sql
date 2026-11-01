-- Admin can wipe a guest's answers so they can take the assessment again.
-- Deleting a registration already cascades its responses.

create policy "admin deletes assessments"
  on public.assessment_responses for delete to authenticated
  using (exists (select 1 from public.admin_emails where email = auth.email()));
