# ADR 0020: shadcn/ui + Tailwind v4 + OKLCH design tokens

- **Status:** Accepted (backfilled)
- **Date:** 2026-05-01

## Context

The editor and the marketing site need a shared visual language with serious requirements:

- Light and dark modes that are perceptually balanced — the same UI weight in both.
- A graph canvas with semantic colours (class node, selected, adjacent, dimmed, three edge kinds) that compose with the rest of the UI.
- Components we can extend, not fight. shadcn-style "copy the source into your tree" beats opaque component libraries when we need precise control over Radix primitives.

sRGB-named colours (hex, hsl) drift in perceived lightness across the spectrum: a `#FF0000` red and a `#0000FF` blue at the same notional brightness look very different. OKLCH is perceptually uniform — same `L` value reads as the same lightness regardless of hue.

## Decision

- **Design system spec:** `DESIGN.md` is the source of truth. It enumerates every token, every component pattern, every motion duration.
- **Components:** shadcn/ui copied into each app's tree, extended in place. Prefer existing shadcn components over custom implementations.
- **Styling:** Tailwind CSS v4 with the new CSS-variable-driven theme. Tokens declared as CSS custom properties (`--background`, `--primary`, etc.) consumable by both apps.
- **Colour space:** OKLCH for every token. Light and dark modes share the same hue and chroma where possible; only `L` shifts, which keeps the brand consistent across modes.
- **Graph tokens:** dedicated `--graph-*` namespace for canvas-specific colours, kept separate from the general UI palette so the canvas can be tuned independently.

## Consequences

- Adding a new themeable surface is a token edit, not a component rewrite.
- Hover states, alpha overlays, and selection tints compose predictably because the lightness scale is uniform.
- shadcn components live in our tree, so upstream churn doesn't break us; we cherry-pick fixes we want.
- Cost: OKLCH support requires modern browsers; not a constraint for an Electron renderer or a marketing site we control.

## Alternatives considered

- **MUI / Mantine / Chakra:** opaque components; theming a graph canvas semantic palette through them is awkward.
- **HSL tokens:** familiar but perceptually non-uniform — dark mode required hand-tuning that OKLCH avoids.
- **CSS-in-JS (Emotion, vanilla-extract):** loses the Tailwind utility ergonomics we already depend on across both apps.
