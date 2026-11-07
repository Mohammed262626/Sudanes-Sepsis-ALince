---
name: Sudanese Sepsis Alliance
description: Arabic-first clinical society site — ink on warm paper, ruled edges, one accent.
colors:
  paper: "#f7f5f0"
  ink: "#15130f"
  muted: "#6f6a62"
  line: "#ddd8cf"
  accent: "#962567"
  accent-ink: "#ffffff"
  ok: "#2e6b3e"
  danger: "#962567"
typography:
  display:
    fontFamily: "Cairo Variable, system-ui, sans-serif"
    fontSize: "clamp(3rem, 8.5vw, 6.5rem)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "0em"
  headline:
    fontFamily: "Cairo Variable, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 6vw, 4.75rem)"
    fontWeight: 800
    lineHeight: 1.15
  title:
    fontFamily: "Cairo Variable, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 3vw, 2rem)"
    fontWeight: 800
    lineHeight: 1.15
  body:
    fontFamily: "Tajawal, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.8
  label:
    fontFamily: "Cairo Variable, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 700
    lineHeight: 1.3
  button:
    fontFamily: "Cairo Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.3
rounded:
  none: "0"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2.5rem"
  section: "clamp(4rem, 9vw, 7rem)"
  wrap: "1160px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "0.9rem 1.75rem"
  button-primary-hover:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  button-ghost:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "0.9rem 1.75rem"
  chip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.2rem 0.65rem"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.65rem 0.75rem"
    height: "2.75rem"
---

# Design System: Sudanese Sepsis Alliance

## Overview

**Creative North Star: "The Clinical Ledger"**

The site reads like a well-kept clinical record: warm paper, dark ink, ruled
edges, and numbers that line up. Nothing floats. Every boundary is a drawn line —
1px hairlines between sections, 2px ink rules around anything you can press or
fill in — so the page feels documented rather than decorated.

The subject is life-threatening, so the interface stays quiet and certain: one
chromatic voice, generous Arabic leading, and typography that does the work that
imagery usually does. Earned seriousness, never alarm.

Depth is paper, not shadow. A surface rises by gaining a border, an ink fill, or
white space around it. There is exactly one exception in the whole system: the
sticky site header, which blurs whatever is scrolled beneath it.

**Key Characteristics:**

- Warm off-white paper `#f7f5f0` against near-black ink `#15130f`
- One accent, `#962567`, used sparingly and purposefully
- 2px borders on interactive surfaces; 1px hairlines for structure
- Zero corner radius, zero drop shadows, zero gradients
- Cairo for anything that speaks; Tajawal for anything that reads
- RTL native: logical properties everywhere, taller Arabic line-height

## Colors

A two-tone document with one deliberate mark of color. The palette is nearly
monochrome; the accent earns attention because it is rationed.

### Primary

- **Clinical Magenta** (#962567): the alliance's one chromatic voice, sampled from
  `public/gradient_background.png`. Used for kickers, active tab states, the
  hero fact block, primary links of emphasis, error/destructive state, focus
  rings, and the QR mark. Never as a large background wash.

### Neutral

- **Warm Paper** (#f7f5f0): the page. Every surface defaults to it — cards do not
  get a lighter fill, they get a border.
- **Ledger Ink** (#15130f): body text, headings, and the fill of primary buttons.
  Also the dark band used for the email header and the guest pass.
- **Pencil Gray** (#6f6a62): ledes, notes, timestamps, secondary metadata. Meets
  4.5:1 on paper but is never used for body copy.
- **Rule Line** (#ddd8cf): 1px structural hairlines — section separators, table
  rows, dividers between list items.

### State

- **Confirmed Green** (#2e6b3e): success only — approved status, attended badge,
  completed assessment, certificate ready. Never decorative.
- **Danger** resolves to the accent: errors are the magenta, not a separate red.

### Named Rules

**The Rationed Mark Rule.** The accent may cover no more than roughly a tenth of
any screen. If a screen needs more emphasis, use ink weight and size first; the
magenta is a signature, not a highlighter.

**The No Second Hue Rule.** There are exactly two colors of meaning besides ink
and paper: magenta for attention and green for confirmation. No amber, no blue,
no teal.

## Typography

**Display Font:** Cairo Variable (fallback: `system-ui, sans-serif`)
**Body Font:** Tajawal 400 / 500 / 700 (fallback: `system-ui, sans-serif`)

**Character:** A geometric Arabic display face with a humanist Arabic body face —
headings carry authority at heavy weight, while body text stays open and readable
at phone distance. Both are self-hosted; the pairing never touches the network.

### Hierarchy

- **Display** (Cairo 800, `clamp(3rem, 8.5vw, 6.5rem)`, 0.98): the homepage hero
  only. Arabic at this size needs the tight leading; do not reuse it elsewhere.
- **Headline** (Cairo 800, `clamp(2.5rem, 6vw, 4.75rem)`, 1.15): interior page
  titles, capped at `22ch` so the line never stretches.
- **Title** (Cairo 800, `clamp(1.5rem, 3vw, 2rem)`, 1.15): section headings in
  prose and major blocks.
- **Body** (Tajawal 400, `1.0625rem` / 17px, 1.8): every paragraph. The 1.8
  leading is deliberate — Arabic needs the air; 1.5 is a Latin habit.
- **Label** (Cairo 700, `0.8125rem`, 1.3): kickers, table headers, chips, badges,
  tab labels. The only place small bold Cairo appears.

### Named Rules

**The Arabic Leading Rule.** Body leading never drops below 1.7. If a component
feels loose, reduce the measure, not the line-height.

**The No Tracking Rule.** Never apply `letter-spacing` to Arabic text. Letter
spacing is reserved for Latin ticket codes rendered with `dir="ltr"`.

**The Two-Voice Rule.** Cairo speaks (headings, buttons, labels, numbers that carry
meaning); Tajawal reads (paragraphs, form values, table cells). Never set a
paragraph in Cairo or a heading in Tajawal.

## Layout

A single `1160px` container (`.wrap`) with fluid gutters
`clamp(1.25rem, 4vw, 2.5rem)` keeps every page on the same axis. Vertical rhythm
is owned by `.section`: `padding-block: clamp(4rem, 9vw, 7rem)`, and consecutive
sections are separated by a 1px `Rule Line` rather than by background changes.

Marketing pages use an asymmetric two-column split (roughly 1.35fr / 0.65fr) that
collapses to one column at 800px. Admin and guest surfaces collapse at 720px;
the admin sidebar only appears at 1100px. Breakpoints in the codebase are not yet
unified — treat 720px and 1100px as canonical and 800px as the marketing
exception, and consolidate rather than adding a new value.

Reading measures are capped: `34ch` for hero ledes, `62ch` for page ledes, `68ch`
for prose. Content never runs edge to edge on a wide screen.

## Elevation & Depth

There are no shadows in this system. No `box-shadow` on cards, buttons, inputs,
menus, or toasts; no gradients as decoration. Depth is expressed three ways:

1. **Rules** — a 1px line says where one thing ends and another begins.
2. **Ink fill** — the dark band (email header, guest pass, hero fact block) is the
   system's way of saying "this sits above the page".
3. **Space** — larger gaps mean higher grouping, not blur or lift.

The single exception is the sticky header: `color-mix(in srgb, var(--paper) 92%,
transparent)` with `backdrop-filter: blur(8px)`, so content scrolling underneath
stays legible. Toasts and overlays use 2px ink borders and appear in place; they
do not float on a shadow.

**The Flat By Default Rule.** If a surface needs to feel raised, give it a border,
not a shadow.

## Shapes

Zero radius everywhere: buttons, inputs, chips, badges, cards, panels, the guest
pass, the program list. Corners are square because the system is a ledger.

Borders are the shape language: **2px solid ink** around anything interactive or
contained (buttons, inputs, cards, pass), **1px rule line** for structure
(separators, table rows, list items), and **2px accent** only for focus rings
(`outline: 3px solid var(--accent); outline-offset: 3px`).

Icons are line icons at a consistent stroke, sized 24–34px in navigation and
16–20px inline. No emoji as icons.

## Components

### Buttons

- **Shape:** square (0 radius), 2px ink border, Cairo 700 1rem.
- **Primary:** ink fill, paper text, `0.9rem 1.75rem` padding. Hover inverts to
  paper fill / ink text; active drops `translateY(1px)`; disabled is 55% opacity
  with a progress cursor.
- **Hover / Focus:** 150ms `ease-out` on background, color, border; the focus ring
  is a 3px accent outline at 3px offset, never removed.
- **Ghost:** paper fill at rest, flips to ink fill on hover — same geometry.
- **Light:** for use on ink or photo surfaces; paper fill with ink text.
- **Small:** `0.45rem 0.9rem`, but any small button on a guest-facing screen must
  still be 44px tall (`min-block-size: 2.75rem`).

### Chips & Badges

- **Style:** square, 2px border in a mixed ink tone, label-sized Cairo, no fill.
- **State:** `ok` → confirmed green border and text; `wait` → muted ink text;
  status badges in admin use the same square treatment with colored borders.

### Cards / Containers

- **Corner:** square.
- **Background:** paper — the same paper as the page; the border is what defines
  the card.
- **Border:** 2px solid ink for primary cards (guest pass, program card), 1px rule
  line for grouped content.
- **Padding:** `1.25rem` inside cards; `clamp(1.25rem, 4vw, 2.5rem)` at page level.
- **Shadow:** none, ever.

### Inputs / Fields

- **Style:** square, 2px solid ink border, paper fill, Tajawal 1rem, minimum height
  `2.75rem` (44px), padding `0.65rem 0.75rem`.
- **Focus:** 2px accent outline at 2px offset; the border itself does not change.
- **Error:** the message sits directly under its field (`.form-status` with
  `data-state="error"`), in the accent color — not a separate red.

### Navigation

- **Style:** sticky header on paper at 92% with an 8px blur; 1px bottom rule;
  minimum height 72px. Brand mark 34px with the alliance name in Cairo 800.
- **Links:** Cairo 600 `0.9375rem`, no underline; the current page is marked with
  the accent color, not a pill or background.
- **Mobile:** links wrap beneath the brand instead of collapsing into a hamburger;
  the conference CTA keeps its own row (`.nav-special`).
- **Admin:** a top bar with the same rules, tabs as square bordered buttons where
  the active tab is an ink fill.

### Guest Pass (signature component)

The attendee's personal dashboard opens with a boarding-pass card: an ink band
carrying the conference name, the guest's name at display weight, square status
chips, then a single ruled ticket row holding the code (`dir="ltr"`), a copy
button and the door link. Below it, the day program and the assessments sit in a
two-column grid; the certificate status is a single flat strip, not a card. The
pass is the one place where an ink field is used at component scale.

## Do's and Don'ts

### Do:

- **Do** default every surface to Warm Paper with a drawn border; depth comes from
  rules and ink fills.
- **Do** use 2px ink borders on interactive elements and 1px `Rule Line` for
  structure.
- **Do** keep the accent rare, semantic, and purposeful — attention, confirmation
  contrast, focus.
- **Do** write layout with logical properties (`margin-inline`, `padding-block`,
  `inset-inline-start`) so RTL is native.
- **Do** keep body leading at 1.8 and cap measures at `68ch` for prose.
- **Do** give every control a 44px touch height and a visible accent focus ring.
- **Do** use real photographs, the alliance logo assets, and Cairo/Tajawal only.

### Don't:

- **Don't** add shadows, blurs (beyond the header), or gradients.
- **Don't** round corners or introduce a second accent hue.
- **Don't** set Arabic text in uppercase, letter-spaced, or below 1.7 leading.
- **Don't** use emoji as icons or mix icon libraries.
- **Don't** fill cards with white or a tint — paper plus a border is the card.
- **Don't** invent statistics, testimonials, partner logos, or donation channels
  to fill a layout.
- **Don't** add a new breakpoint before checking 720px and 1100px.
