# Ontograph Brand Guidelines

## Positioning

**Ontograph** — Where knowledge takes shape.

A modern, AI-powered ontology editor for people who think in structures. Ontograph transforms the complexity of formal ontologies into a visual, intuitive experience.

### Brand Personality

| Trait | Expression |
|-------|------------|
| Precise | Clean interfaces, deliberate spacing, no visual noise |
| Intelligent | Sophisticated color palette, refined typography |
| Approachable | Warm accent colors, smooth animations, friendly empty states |
| Craft-quality | Attention to detail in every interaction |

---

## Color System

All colors use OKLCH for perceptual uniformity. See `globals.css` for exact token values.

### Primary: Deep Indigo

The primary color conveys intelligence, depth, and distinguishes Ontograph from competitor blues and teals.

- Light mode: `oklch(0.45 0.15 270)` — deep indigo
- Dark mode: `oklch(0.65 0.12 280)` — soft violet (lighter for readability)

### Accent: Electric Cyan

Used for graph node selections, interactive highlights, and data-related UI.

- `oklch(0.75 0.15 195)` — consistent across themes

### Semantic Colors

| Role | Token | Purpose |
|------|-------|---------|
| Success | `--success` | Validation pass, saved states |
| Warning | `--warning` | Amber alerts, AI content markers |
| Destructive | `--destructive` | Errors, delete confirmations |

### Neutral System

Neutrals carry a subtle cool/indigo tint (270 hue angle) for a cohesive feel without being obviously tinted.

### Graph Tokens

Dedicated tokens for the graph canvas ensure visual consistency:

| Token | Purpose |
|-------|---------|
| `--graph-node-class` | Class node header color |
| `--graph-node-selected` | Selected node highlight (cyan) |
| `--graph-edge-property` | Object property edge color |
| `--graph-edge-subclass` | Inheritance edge color |
| `--graph-edge-disjoint` | Disjoint relationship edge color |
| `--graph-bg` | Canvas background |

---

## Typography

### Fonts

| Use | Font | Weights |
|-----|------|---------|
| UI Text | Geist Sans | 100-900 (variable) |
| Code / URIs | Geist Mono | 100-900 (variable) |

Geist provides a geometric, modern character with excellent readability at all sizes. The monospace variant handles OWL URIs and Turtle code snippets.

### Scale

Use Tailwind's default type scale. Key sizes:

- `text-xs` (12px) — status bar, metadata
- `text-sm` (14px) — body text, form labels
- `text-base` (16px) — primary content
- `text-lg` (18px) — section headings
- `text-2xl` (24px) — page titles, empty state headers

---

## Spacing & Layout

- Base unit: 4px (0.25rem)
- Border radius: 0.5rem (8px) — `--radius: 0.5rem`
- Toolbar height: 40px
- Status bar height: 24px
- Activity bar width: 40px

---

## Dark Mode

Dark mode is the **default** theme. The audience (knowledge engineers, AI researchers) predominantly uses dark mode, and the graph canvas renders best on dark backgrounds.

Light mode is available via the theme toggle in the toolbar.

---

## Logo & Icon

### Concept

Three connected nodes in a triangle — representing the fundamental ontology structure of subject-predicate-object triples and class relationships.

### Icon Variants

- **Full color on dark**: Primary use for app icon, marketing
- **Monochrome**: For constrained contexts (favicon, small sizes)

### App Icon

- Flat, clean node shapes (no 3D effects)
- Deep indigo background with subtle gradient
- White/cyan nodes with indigo connector lines
- macOS squircle shape, platform-appropriate on Windows/Linux

---

## Component System

Built on **shadcn/ui** with **Tailwind CSS v4**. Prefer existing shadcn components over custom implementations.

### Key Patterns

- **Buttons**: Primary (indigo), secondary (muted), ghost (toolbar), destructive (red)
- **Dialogs**: Backdrop blur, centered, scale animation
- **Popovers**: Used for graph controls and contextual editors
- **Activity bar**: Right-side vertical icon strip with active indicator
- **Empty states**: Centered content with icon, title, description

---

## Motion

| Pattern | Duration | Easing |
|---------|----------|--------|
| Micro (hover, focus) | 150ms | ease-out |
| Standard (panels, modals) | 200ms | ease-in-out |
| Emphasis (transitions) | 300ms | spring |
| Graph (layout animation) | 500ms | spring |

Use `motion` (Framer Motion) for complex animations. CSS transitions for simple hover/focus states.

---

## Writing Style

- Concise, technical but approachable
- No jargon for UI labels — use plain language
- Tooltips for technical terms (OWL, RDF, etc.)
- Error messages should explain what went wrong and how to fix it
