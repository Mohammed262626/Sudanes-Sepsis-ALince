# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Sudanese health workers — clinicians, nurses, students, and hospital staff — are
the primary audience: they read about sepsis, register for the national
conference, arrive carrying a phone with the ticket, and later fill in the
assessments. Conference attendees come first; the alliance's organizers are a
secondary audience using `/admin` as a working tool, not the product.

## Product Purpose

The Arabic-only site of the Sudanese Sepsis Alliance (التحالف السوداني للإنتان).
It exists to raise awareness of sepsis among Sudanese health workers and to run
the Kassala sepsis conference end to end: registration, approval, ticketing,
door check-in, day program, pre/post assessments, and certificate status.
Success means a health worker can register from a phone, get approved over
WhatsApp, enter the hall with their own ticket, and leave knowing what to do
next — with no English, no desktop, and no printed paper required.

## Positioning

A Sudan-first, Arabic-first clinical society presence: content and messaging are
written in Arabic for Sudanese practice, delivered over WhatsApp (the channel
people actually use), and tied to a physical national conference. It is not a
translated global NGO template — the accreditation, the language, the channel,
and the event are local.

## Operating Context

- Guests arrive from a WhatsApp approval message; the invitation link opens a
  personal dashboard that is saved on that phone.
- At the door, staff scan a QR code and guests can check themselves in from the
  same dashboard.
- The event is 30 November 2026 in Kassala; registration closes 16 November 2026.
- Organizers run everything from `/admin` on the same site: approvals, attendance,
  assessments, program, WhatsApp templates.
- Phones on variable connectivity; the site is a static build served from a CDN.

## Capabilities and Constraints

- Arabic-only, right-to-left. No English UI copy.
- Astro static build; Supabase for data, auth, and triggers; content that changes
  at runtime (program, windows, statuses) must be read from the database rather
  than baked into the build.
- One brand accent, two self-hosted font families, no build-time image pipeline.
- Medical copy must stay accurate; anything clinical needs clinician review.
- Must not invent Sudan-specific statistics, contact details, donation channels,
  testimonials, or accreditation claims.
- Public registration is insert-only; submissions are readable only by listed
  admin addresses through RLS.

## Brand Commitments

- Name: التحالف السوداني للإنتان / Sudanese Sepsis Alliance (English sender name
  only in email).
- Accent `#962567`, sampled from `public/gradient_background.png`; it is the only
  chromatic voice on the site.
- Self-hosted Cairo (display) and Tajawal (body) — no external font requests.
- Real photographs only; no illustration libraries, no stock-gradient art.
- Logo: `public/logo-mark.png` on light surfaces, full `public/logo.png` (white
  wordmark) on ink bands.

## Evidence on Hand

- Event photography in `public/` and `src/assets/`.
- Logo assets listed above; the accent color itself is a brand asset.
- No published testimonials, impact numbers, partner logos, or donor list exist in
  the repository. Future work must not fabricate them.

## Product Principles

1. **Arabic is the product, not a localization.** Copy, numerals, spacing, and
   flow are designed for Arabic from the start.
2. **Meet people where they already are.** WhatsApp and a phone at the door beat
   email and desktop flows.
3. **The attendee carries one thing.** The ticket (code + QR) is the single
   artifact that must always be reachable.
4. **Say only what is true.** Every number, name, and clinical statement must be
   backed by the alliance or left out.
5. **Calm authority.** The subject is life-threatening; the interface stays quiet,
   legible, and certain instead of alarming.

## Accessibility & Inclusion

- Touch targets at least 44px; visible focus rings; keyboard-operable forms and
  admin tables.
- RTL logical properties throughout; no layout that depends on physical left/right.
- Reduced motion respected (smooth scroll and toast animation opt out).
- Copy is short and written for readers on a phone screen in a clinical setting.
