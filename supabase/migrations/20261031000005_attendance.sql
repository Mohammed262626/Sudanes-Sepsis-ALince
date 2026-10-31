-- Attendance: set when the guest's ticket QR is scanned at the door.
-- Status stays approved/rejected; certificates later key off attended_at.
alter table public.conference_registrations
  add column attended_at timestamptz;
