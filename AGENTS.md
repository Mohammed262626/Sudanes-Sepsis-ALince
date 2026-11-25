## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Project

Website for the Sudanese Sepsis Alliance (التحالف السوداني للإنتان). Arabic-only,
RTL. Stack: Astro 7 + Svelte 5 islands + Supabase. Static output (`npm run build` → `dist/`).

- `src/pages/` — one file per route; Arabic content lives here
- `src/layouts/Base.astro` — shell: nav, footer, fonts, meta
- `src/styles/global.css` — design tokens and shared classes; use these before writing new CSS
- `src/components/*.svelte` — hydrated islands only for interactive forms
- `src/lib/supabase.ts` — build-time client from `PUBLIC_SUPABASE_*` in `.env` (never commit)

## Supabase

Two environments:

- **Prod**: hosted project `hdoylixxljkimdypfomp` (`supabase/config.toml`) behind
  `sudansepsisalliance.com`. Migrations via the Supabase MCP `apply_migration`.
- **Dev**: self-hosted stack on the dev box behind caddy — site
  `https://162.35.15.216.nip.io` (caddy serves `/srv/www`; rebuild + copy `dist/`),
  Supabase `https://supabase.162.35.15.216.nip.io` (studio at `studio.…nip.io`).
  Edge functions are bind-mounted read-only from `supabase/functions/`, so
  deploying is edit + `docker restart supabase_edge_runtime_hdoylixxljkimdypfomp`;
  DB migrations run via `docker exec supabase_db_hdoylixxljkimdypfomp psql -U postgres`.

Both share the same schema and migrations. Tables: `activities` (public read),
`contact_messages` and `donation_interests` (insert-only; no public reads).
`admin_emails` lists the addresses allowed to read submissions; `/admin` is the
submissions dashboard (Supabase Auth email+password, data access gated by RLS).
Never make ad-hoc dashboard edits to schema or functions.
Pages fetch at build time, so content changes require a rebuild.

The dev database is not a sandbox — it holds real registrations. Do not approve
or message real guests from dev.

`.env` must be UTF-8 **without BOM** — a BOM silently breaks the first variable and
the built site ships a null Supabase client.

Messages are per-environment: every hook posts to its own environment's notify
function via Vault `notify_url` (helper `public.notify_hook_url()`, fallback =
prod URL), and the links inside messages/QR come from Vault `site_url` read by
the notify function (fallback = prod domain). Prod needs neither key; dev has
both set. Prod's edge function has not been redeployed since the route
re-org — old-path links it still builds are covered by the redirect stubs
until its next deploy.

Email: registration inserts/updates fire `public.notify_email()` → Edge Function
`notify` (`supabase/functions/notify/`) → Resend. `contact_messages` and
`donation_interests` auto-replies bypass the function — DB triggers
(`send_auto_reply`) post straight to Brevo. Secrets live in Supabase Vault
(`resend_api_key`, `brevo_api_key`, `webhook_secret`), never in the repo or
client code.

WhatsApp is the live channel: the same function sends registrant confirmations and
admin alerts via Wasender (`wasender_api_key`; results keep the old Green API
shape for `notify_log`), using Vault secret `green_api_admin` for the admin chat
id (e.g. `2499…@c.us`).

Conference registration is two-stage: a new row is a *request* (`status` =
`pending`, auto `ticket_code`) and gets only a "received" message. Approving it in
`/admin` flips the status, firing the update trigger → approval message + ticket QR
image. Rejection sends a closing message.
Admins can re-send an approved ticket (`resend_ticket` RPC, sends the QR again) and delete registrations; both are RLS-gated.

## Design rules

Bold two-tone NGO: off-white `--paper`, ink `--ink`, brand magenta `--accent`
(#962567, sampled from `public/gradient_background.png`) plus its tints
`--tint-pink` / `--tint-rose` and slate `--impact-slate`. The homepage follows the
UK Sepsis Trust layout: paper "check symptoms" strip, solid-accent hero cut by a
diagonal with a paper card floating over the cut, three-line tone-shifted
headline, three 200px photo cards (hover zoom), a stacked three-tone "what we do"
heading, an accent story carousel with split background, floating news card, and
an ink footer. IBM Plex Sans Arabic only (self-hosted; 700 display, 400 body, 600
compact UI — never 800/900). Homepage blocks are borderless; interior pages keep
2px ink rules. Borders instead of shadows. Motion: entrances rise (opacity + translateY) and
card photos zoom on hover; both off under `prefers-reduced-motion`. Real photos
only — credits live in `public/img/CREDITS.md`. Breakpoints stay 720 / 800 / 900 /
1100.

## Content

Medical copy must stay accurate; flag anything that needs clinician review.
Do not invent Sudan-specific statistics, contact details, or donation channels.

## Documentation

Every session appends its changes to `log.md` (newest first) — update it whenever
you modify the repo.

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
