---
name: Sudanese Sepsis Alliance
description: Arabic-first clinical society site — bold two-tone: solid-accent diagonal hero, floating cards, ink footer.
colors:
  paper: "#f7f5f0"
  ink: "#15130f"
  muted: "#6f6a62"
  line: "#ddd8cf"
  accent: "#962567"
  accent-ink: "#ffffff"
  tint-pink: "#f6cfe3"
  tint-rose: "#d76da6"
  impact-slate: "#4d5c86"
  ok: "#2e6b3e"
  danger: "#962567"
typography:
  display:
    fontFamily: "IBM Plex Sans Arabic, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 6vw, 5.5rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0em"
  headline:
    fontFamily: "IBM Plex Sans Arabic, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 6vw, 4.75rem)"
    fontWeight: 700
    lineHeight: 1.15
  title:
    fontFamily: "IBM Plex Sans Arabic, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 3vw, 2rem)"
    fontWeight: 700
    lineHeight: 1.15
  body:
    fontFamily: "IBM Plex Sans Arabic, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.8
  label:
    fontFamily: "IBM Plex Sans Arabic, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 700
    lineHeight: 1.3
  small:
    fontFamily: "IBM Plex Sans Arabic, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  caption:
    fontFamily: "IBM Plex Sans Arabic, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.4
  ui:
    fontFamily: "IBM Plex Sans Arabic, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.3
  subhead:
    fontFamily: "IBM Plex Sans Arabic, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
  button:
    fontFamily: "IBM Plex Sans Arabic, system-ui, sans-serif"
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

**Creative North Star: "The Public Warning, Kept Honest"**

The site opens loud and then settles into the ledger. The homepage hero is a
solid accent slab cut by a diagonal at its lower edge, carrying a three-tone
headline at the boldest available weight (700) with a paper card floating over
the cut. Below it the page
returns to warm paper: ruled edges, squared photo cards whose images zoom on
hover, a stacked three-tone "what we do" heading, an accent story carousel with a
split background, a floating news card, and an ink footer.

The subject is life-threatening, so the boldness is structural, not decorative:
big type, hard diagonals, real photographs, and generous Arabic leading. Earned
seriousness, never alarm.

Depth is paper, not shadow. A surface rises by gaining a border, an ink fill, or
white space around it. The sticky site header is the one exception, blurring
whatever is scrolled beneath it. Cards "float" by overlapping the surface above
(negative margins/translate), never by casting a shadow.

**Key Characteristics:**

- Warm off-white paper `#f7f5f0` against near-black ink `#15130f`
- Brand magenta `#962567` for full-bleed hero/band washes, plus its tints
  `#f6cfe3` / `#d76da6` and slate `#4d5c86` for highlights and impact numbers
- 2px borders on interactive surfaces and interior sections; the homepage's
  blocks sit borderless on paper (its sections are separated by space only)
- Zero corner radius, zero drop shadows, zero decorative gradients
- Diagonal `clip-path` cut on the hero; split-background story slides
- Floating cards overlap the surface above via negative offsets
- Ink footer closes every page
- IBM Plex Sans Arabic for everything — one family, weights 400 / 600 / 700
- Homepage blocks carry no outlines; interior pages keep 2px rules
- RTL native: logical properties everywhere, taller Arabic line-height

## Colors

A two-tone document with one deliberate mark of color. The palette is nearly
monochrome; the accent earns attention because it is rationed.

### Primary

- **Brand Magenta** (#962567): the alliance's chromatic voice, sampled from
  `public/gradient_background.png`. Used for kickers, active tab states, primary
  links of emphasis, error/destructive state, focus rings, the QR mark, the
  homepage hero slab, the story carousel, and the header CTA.

### Brand Tints

- **Tint Pink** (#f6cfe3): second line of the hero headline, kickers and notes on
  accent surfaces, and the floating news card fill. Light enough for ink text.
- **Tint Rose** (#d76da6): third line of the hero headline — the deepest readable
  step of the accent on an accent surface.
- **Impact Slate** (#4d5c86): the third impact number and the third
  "what we do" heading line; the only place a second hue carries meaning.

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

**The One Loud Surface Rule.** Accent may cover a whole band or the homepage
hero, but only once per page and always followed by paper. Interior pages stay
mostly paper; if a screen needs more emphasis, use ink weight and size first.

**The Brand Tints Only Rule.** Beyond ink and paper, the only hues are the accent
and its two sampled tints (pink, slate) plus confirmed green. No amber, no
independent blue, no teal.

## Typography

**Display Font:** IBM Plex Sans Arabic 700 (fallback: `system-ui, sans-serif`)
**Body Font:** IBM Plex Sans Arabic 400 / 600 / 700 (fallback: `system-ui, sans-serif`)

**Character:** One humanist Arabic family for both roles: headings sit at 700,
body at 400. Plex tops out at 700, so the hero uses 700 — never request 800/900,
the browser would fake-bold the Arabic. Self-hosted; never touches the network.

### Hierarchy

- **Display** (weight 700, `clamp(2.25rem, 6vw, 5.25rem)`, 0.9): the homepage hero
  only, three stacked block lines in paper / tint-pink / tint-rose. Do not reuse
  it elsewhere.
- **Headline** (weight 700, `clamp(2.5rem, 6vw, 4.75rem)`, 1.15): interior page
  titles, capped at `22ch` so the line never stretches.
- **Title** (weight 700, `clamp(1.5rem, 3vw, 2rem)`, 1.15): section headings in
  prose. Homepage section heads step up to `clamp(2rem, 5vw, 3.25rem)`.
- **Body** (400, `1.0625rem` / 17px, 1.8): every paragraph. The 1.8
  leading is deliberate — Arabic needs the air; 1.5 is a Latin habit.
- **Label** (700, `0.8125rem`, 1.3): kickers, table headers, chips, badges,
  tab labels. The only place small bold Plex appears.
- **Small** (400, `0.875rem`, 1.6): timestamps, table cells, toast text,
  helper notes inside dense surfaces.
- **Caption** (700, `0.75rem`, 1.4): the smallest step — ticket-row labels,
  admin counters, meta above a value.

**Scale:** the fixed steps in use are `0.75` · `0.8125` · `0.875` · `0.9375` (nav
and dense UI) · `1` (buttons) · `1.0625` (body) · `1.125` / `1.25` (subheads) ·
`1.5`–`2` (titles). Anything larger is fluid and belongs to one of the display
roles; do not add a new fixed step between these unless the role genuinely
differs. Display sizes are deliberately fluid and page-scoped — each surface sets
its own `clamp()` within the 1.6rem–7.5rem band (hero 2.25→5.5rem, impact
2.75→4.75rem, conference band 3.5→5.5rem, page heads 2.5→4.75rem) — so a clamp
endpoint is not drift unless it lands inside the fixed scale above.

### Named Rules

**The Arabic Leading Rule.** Body leading never drops below 1.7. If a component
feels loose, reduce the measure, not the line-height.

**The No Tracking Rule.** Never apply `letter-spacing` to Arabic text. Letter
spacing is reserved for Latin ticket codes rendered with `dir="ltr"`.

**The Two-Voice Rule.** One family, two weights: 700 speaks (headings, buttons,
labels, numbers that carry meaning), 400 reads (paragraphs, form values, table
cells). 600 is reserved for compact UI. Never request 800 or 900.

## Layout

A single `1160px` container (`.wrap`) with fluid gutters
`clamp(1.25rem, 4vw, 2.5rem)` keeps every page on the same axis. Vertical rhythm
is owned by `.section`: `padding-block: clamp(4rem, 9vw, 7rem)`, and consecutive
sections are separated by a 2px ink rule or by a full-bleed band. The homepage
breaks the container on purpose four times: the symptoms band, the accent hero,
the story carousel, and the ink footer. Homepage order mirrors the UK Sepsis
Trust: band → hero → photo cards → what we do → stories → impact → news, then
the alliance's own content sections.

Marketing pages use an asymmetric two-column split (roughly 1.4fr / 0.6fr) that
collapses to one column at 800px; the hero and photo grid collapse at the same
800px. Admin and guest surfaces collapse at 720px;
the admin table drops columns at 900px and the admin sidebar only appears at
1100px. Those four values — 720, 800, 900, 1100 — are the whole breakpoint set:
720 is the app/phone stack, 800 the marketing stack, 900 the admin table, 1100
the admin sidebar. Do not introduce a fifth.

Reading measures are capped: `34ch` for hero ledes, `62ch` for page ledes, `68ch`
for prose. Content never runs edge to edge on a wide screen.

## Elevation & Depth

There are no shadows in this system. No `box-shadow` on cards, buttons, inputs,
menus, or toasts, and no decorative gradients. Depth is expressed three ways:

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

- **Shape:** square (0 radius), 2px ink border, 700 1rem.
- **Primary:** ink fill, paper text, `0.9rem 1.75rem` padding. Hover inverts to
  paper fill / ink text; active drops `translateY(1px)`; disabled is 55% opacity
  with a progress cursor.
- **Hover / Focus:** 150ms `ease-out` on background, color, border; the focus ring
  is a 3px accent outline at 3px offset, never removed.
- **Ghost:** paper fill at rest, flips to ink fill on hover — same geometry.
- **Light:** for use on ink or accent surfaces; paper fill with ink text, hover
  clears the fill but keeps paper text.
- **Accent:** header CTA only — accent fill, paper text, hover inverts to outline.
- **Small:** same geometry, `0.45rem 0.9rem` padding and a 44px minimum height —
  small changes the density, never the target size.

### Chips & Badges

- **Style:** square, 2px border in a mixed ink tone, label-sized Plex, no fill.
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
- **Photo cards:** no border, photo on top fixed at 200px (cover), kicker +
  title + text + a square bordered "more" button. The image zooms to 1.05 over
  300ms on hover; overflow is clipped by the card. The photo is the only colour.
- **Floating news card:** an unbordered image block (60%) with a tint-pink text card
  (40%) pulled over its edge by a negative inline-start margin; on phones the
  text card overlaps the image from below (`margin-block-start: -2.5rem`).
- **Story carousel:** one slide with a split background (`to left, accent 62%,
  paper 62%`), text on the accent side, a paper image panel on the other. Accent
  arrows sit at `top: 33%` translated up 30%; square dots, the active one paper.
  Arrows/dots exist even with one placeholder slide (buttons disabled).

### Inputs / Fields

- **Style:** square, 2px solid ink border, paper fill, Plex 400 1rem, minimum height
  `2.75rem` (44px), padding `0.65rem 0.75rem`.
- **Focus:** 2px accent outline at 2px offset; the border itself does not change.
- **Error:** the message sits directly under its field (`.form-status` with
  `data-state="error"`), in the accent color — not a separate red.

### Navigation

- **Style:** sticky header on paper at 92% with an 8px blur; 1px bottom rule;
  minimum height 72px. Brand mark 34px with the alliance name in weight 700.
- **Links:** 600 `0.9375rem`, no underline; the current page is marked with
  the accent color, not a pill or background.
- **Mobile:** links wrap beneath the brand instead of collapsing into a hamburger;
  the conference CTA keeps its own row (`.nav-special`).
- **Header CTA:** an accent "سجّل في المؤتمر" button links to `/conference`
  (structure copied from the UKST header button; no public assessment quiz).
- **Admin:** a top bar with the same rules, tabs as square bordered buttons where
  the active tab is an ink fill.

### Guest Pass (signature component)

The attendee's personal dashboard opens with a boarding-pass card: an ink band
carrying the conference name, the guest's name at display weight, square status
chips, then a single ruled ticket row holding the code (`dir="ltr"`), a copy
button and the door link. Below it, the day program and the assessments sit in a
two-column grid; the certificate status is a single flat strip, not a card. The
pass is the one place where an ink field is used at component scale.

### Footer

A full-bleed ink slab closes every page: brand + logo mark (the mark sits on a
paper chip so its black shape still reads), one row of anchor links (hover turns
tint-pink), then a disclaimer / copyright strip in 72% paper. No newsletter form.

## Motion

Entrances rise: opacity 0→1 plus `translateY(1.25rem)`→0 over 500–700ms
`ease-out`, once per element. The hero staggers kicker, the three headline lines,
then the floating panel in 0.1s steps. Scroll-revealed sections use the same rise
through `.reveal`. Photo-card images scale to 1.05 over 300ms on hover; the
symptoms band cross-fades its background to tint-pink over 300ms; buttons press
`translateY(1px)`. Nothing else moves. All of it is disabled under
`prefers-reduced-motion: reduce`.

## Do's and Don'ts

### Do:

- **Do** default every surface to Warm Paper with a drawn border; depth comes from
  rules and ink fills.
- **Do** use 2px ink borders on interactive elements and 1px `Rule Line` for
  structure.
- **Do** keep the accent purposeful — one loud band per page, plus attention,
  confirmation contrast, and focus.
- **Do** write layout with logical properties (`margin-inline`, `padding-block`,
  `inset-inline-start`) so RTL is native.
- **Do** keep body leading at 1.8 and cap measures at `68ch` for prose.
- **Do** give every guest-facing control a 44px touch height and a visible accent
  focus ring. Admin icon buttons may stay 36px inside dense tables.
- **Do** use real photographs, the alliance logo assets, and IBM Plex Sans Arabic
  (weights 400 / 600 / 700) only.

### Don't:

- **Don't** add shadows, blurs (beyond the header), or decorative gradients.
- **Don't** round corners or leave the accent's sampled tints for a new hue.
- **Don't** animate anything except entrance rises, the 300ms image zoom, and
  the 1px button press.
- **Don't** set Arabic text in uppercase, letter-spaced, or below 1.7 leading.
- **Don't** use emoji as icons or mix icon libraries.
- **Don't** fill cards with white or a tint — paper plus a border is the card.
- **Don't** invent statistics, testimonials, partner logos, or donation channels
  to fill a layout.
- **Don't** add a new breakpoint before checking 720px and 1100px.
