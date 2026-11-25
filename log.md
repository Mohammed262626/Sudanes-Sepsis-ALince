# Change log

One entry per session — newest first. Updated on every change.

## Next (pick up here)

- Rotate the Supabase access token pasted in chat (Account → Access Tokens).
- Renew the dev Wasender trial — the dev WhatsApp leg returns `403 Your trial
  has expired` until then (email leg works).
- Optional prod follow-up: redeploy the `notify` edge function so prod messages
  build `/conference/…` links directly; until then the redirect stubs cover the
  old paths, so nothing is broken.

## 2026-11-25 — guest journey, doors, admin overhaul

- **Routes**: conference flows moved under `/conference/` — `register` (sign-up
  split out of the event page), `checkin`, `assessment`, `guest`. Old paths are
  redirect stubs that preserve query strings, so already-delivered WhatsApp
  links and QR codes keep working. Notify function links updated; dev edge
  runtime restarted.
- **Doors**: new `doors` table + admin «البوابات» tab — create doors with auto
  IDs (`DOOR-XXXXXX`), per-door poster overlay (wide QR of
  `/conference/checkin/?door=<ID>` + ID printed). `checkin_door` accepts any
  door code or the legacy config one; the check-in page parses poster URLs and
  auto-verifies `?door=` links.
- **Guest**: dashboard skeleton (+ shared `Skeleton.astro` hydration fallback on
  all client:only islands), rise entrances, redesigned centered login card,
  logout button, name+ticket on one line, event-day register→login swap,
  auto-login after attendance (the check-in token IS the dashboard token),
  «العودة إلى لوحتك» on the check-in page, «طبيب مختبر» added to roles.
- **Admin**: drawer sidebar ≤899px (icon-only ☰ beside the title, scroll lock,
  backdrop/Escape close), per-tab lazy loading (boot fetches only the open tab;
  others stream in on first open with honest head-count badges), every action
  updates in place (no reloads), «تحديث» refetches only the open tab, CSV
  exports the whole tab from Supabase (paginated, all columns), save errors
  surface the real message and expired JWTs redirect to login.
- **Fixes**: push subscribe upserts (`merge-duplicates`), config cache 60 s and
  self-corrects after a failed insert, guest CTA on check-in dead-ends.
- **Cleanup**: dropped `improveplan.md`, `plan.md`, `PROGRESS.md`,
  `vercel.json`, `wrangler.jsonc`, Cairo fonts, tracked `supabase/.temp`;
  created this log (rule in `AGENTS.md`).
- **Known issues**: dev Wasender trial expired — WhatsApp leg dead until
  renewed (email works). Migrations `2026112500000x` not yet applied to prod
  (safe no-op until then thanks to fallbacks).
- **Build note**: no node/npm on the host — the site builds in the `dev-site-1`
  docker container (`docker compose run --rm site npm run build`), then
  `rsync -az --delete dist/ /srv/www/`.

## Session closed 2026-11-25

- `log.md` compacted to the summary above; dropped `vercel.json`,
  `wrangler.jsonc`, `public/fonts/` (Cairo), and the tracked
  `supabase/.temp`/`supabase/.branches` CLI junk (now gitignored).
- Committed `a0f2edd` on `dev` and pushed to `origin/dev` (deploys via
  Actions) and `origin/main`.
- **Prod migrations applied** (`supabase db push --remote --yes`, token from
  user): prod was missing FOUR — `20261120000002` (guest_me stable),
  `20261120000003` (attended index), `20261125000000` (notify routing),
  `20261125000001` (doors) — all applied and verified up to date. Prod's
  `notify_url`/`site_url` Vault keys intentionally unset (fallbacks = current
  behavior); prod edge function redeploy still optional (old paths covered by
  the redirect stubs). Access token pasted in chat — rotate it in the dashboard.
