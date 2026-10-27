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

Project ref `dzruizrqvzrxrjaucyie`. Tables: `activities` (public read),
`contact_messages` and `donation_interests` (insert-only; no public reads).
Use migrations via the Supabase MCP `apply_migration`, never ad-hoc dashboard edits.
Pages fetch at build time, so content changes require a rebuild.

Email: inserts on the three tables fire `public.notify_email()` → Edge Function
`notify` (`supabase/functions/notify/`) → Resend. Secrets live in Supabase Vault
(`resend_api_key`, `webhook_secret`), never in the repo or client code.

## Design rules

Modern-minimal NGO: off-white `--paper`, ink `--ink`, one accent (`--accent` is a
placeholder until brand colors arrive), Cairo display + Tajawal body (self-hosted),
2px borders instead of shadows/cards, no gradients. Real photos only. Keep new UI
consistent with the existing tokens and classes.

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
