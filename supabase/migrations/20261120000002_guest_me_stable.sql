-- guest_me only reads one row by token; volatile was the default, not a choice.
-- Stable lets the planner treat it honestly and lets callers reuse it in a query.
alter function public.guest_me(text) stable;
