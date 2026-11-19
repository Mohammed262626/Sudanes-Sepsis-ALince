# Landing Page Enhancement Plan

## 1. Hero Section Refinements
- **SVG Diagonal Cut**: Replace CSS clip-path with SVG shape for smoother responsivenss
- **Texture Overlay**: Add subtle paper texture to hero card (source: `public/textures/paper_light.png`)
- **Dynamic Typography**: Implement gradient animation on headline spans

## 2. Typography Hierarchy
- **Clearer Contrast**: Increase h2/h3 size difference (2.5rem → 2.8rem / 1.25rem → 1.4rem)
- **Text Shadows**: Add `var(--text-shadow-light)` to white text in hero section
- **Decorative Swashes**: Implement contextual alternates via `font-feature-settings: "salt"`

## 3. Photography Treatment
- **Staggered Layout**: Create asymmetric grid with varied image heights
- **Dynamic Depth**: Apply parallax effect on hover with `transform: translateZ(10px)`
- **Branded Overlays**: Add semi-transparent color layers (--tint-rose at 15% opacity)

## 4. Motion System
- **Sequenced Loading**: Stagger element animations (.hero-inner > *:nth-child(n))
- **Hover Elevation**: Implement subtle lift effect on cards with box-shadow transitions
- **Reduced-Motion Safety**: Ensure all animations respect `@media (prefers-reduced-motion)`

## 5. Signature Elements
- **Engraved Typography**: Use text-shadow to create inset effect on "three-tone" headings
- **Icon System**: Create SVG icons for key sections (prevention, symptoms, conference)
- **Abstract Shapes**: Integrate branded geometric elements as ::before pseudo-elements

## Implementation Notes
- Maintain IBM Plex Sans Arabic as exclusive font
- Preserve RTL layout conventions
- Prioritize content visibility over decorative elements
- Target mobile-first performance (LCP < 1.5s)
