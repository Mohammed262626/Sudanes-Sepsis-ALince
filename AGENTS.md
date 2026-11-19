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

Project ref `hdoylixxljkimdypfomp` (`supabase/config.toml`, `init.sql`, live REST URL). Tables: `activities` (public read),
`contact_messages` and `donation_interests` (insert-only; no public reads).
`admin_emails` lists the addresses allowed to read submissions; `/admin` is the
submissions dashboard (Supabase Auth email+password, data access gated by RLS).
Use migrations via the Supabase MCP `apply_migration`, never ad-hoc dashboard edits.
Pages fetch at build time, so content changes require a rebuild.

`.env` must be UTF-8 **without BOM** — a BOM silently breaks the first variable and
the built site ships a null Supabase client.

Email: inserts on the three tables fire `public.notify_email()` → Edge Function
`notify` (`supabase/functions/notify/`) → Resend. Secrets live in Supabase Vault
(`resend_api_key`, `webhook_secret`), never in the repo or client code.

WhatsApp is the live channel: the same function sends registrant confirmations and
admin alerts via Green API, using Vault secrets `green_api_instance`,
`green_api_token`, `green_api_admin` (chat id, e.g. `2499…@c.us`).

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

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
