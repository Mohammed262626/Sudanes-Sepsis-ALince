# Homepage Redesign Plan — UKST shape clone

The homepage now copies the UK Sepsis Trust shapes, angles, floating cards and
section order, using the alliance's own palette: paper, ink, brand magenta
`#962567`, its tints `#f6cfe3` / `#d76da6`, and slate `#4d5c86`.

Source of truth for the shapes: `Home - The UK Sepsis Trust.html` (saved page;
Divi CSS extracted: `line-height:.8em` stacked headings, 200px card images with
300ms hover zoom, split-background story slides, 60/40 news card overlapping by
`-50px`, square buttons, 1500ms fade entrances).

## Decisions

- Colours: ours only. UKST red/yellow replaced by accent + tints.
- Header CTA: an accent "سجّل في المؤتمر" button to `/conference` (no public quiz).
- Newsletter: skipped. Donate/search/social icons: skipped (nothing honest to link).
- Stories: carousel UI built with one disabled placeholder slide.
- Photos: free-license Wikimedia images, credited in `public/img/CREDITS.md`.
- Stats: WHO/GBD only.
- Motion: rise entrances + 300ms image zoom, off under reduced motion.
- Docs: `AGENTS.md` and `DESIGN.md` describe the new identity and motion.

## Order (matches UKST for the shared sections)

1. `ConferenceBand`
2. Symptoms band (paper strip above the hero)
3. Hero: solid accent slab, diagonal cut, three-tone stacked headline, floating
   paper panel, scroll cue
4. Three photo cards (200px image, hover zoom, square "more" button)
5. ماذا نفعل (`#about`): stacked three-tone heading + mission/vision/values
6. Story carousel (split accent/paper slide, arrows + dots, placeholder)
7. Impact (`#impact`)
8. Our content: `#sepsis`, `#symptoms` (`#prevention`), `#amr`, `#news`,
   `#conference`, `#contact`
9. Ink footer

## Notes

- `.hero-home::before` holds the clipped accent slab so the floating panel is not
  clipped; the panel overlaps downward with `translate`.
- `.news-float` pulls the tint-pink text card over the image with a negative
  `margin-inline-start` (phones: negative `margin-block-start`).
- Removed: `.stats`/`.stat`, `.pillar-grid`/`.pillar`, `.story` band styles.
- Breakpoints unchanged: 720 / 800 / 900 / 1100.

## Risks

- AMR copy still needs clinician sign-off.
- The carousel has one placeholder slide; real stories must be documented and
  clinically reviewed before publishing.
- Logo assets may still carry the old org name (images cannot be edited here).
