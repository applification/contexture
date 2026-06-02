# Contexture Design System

> AI-readable design system specification for Contexture — the Convex model control plane with agent-safe editing.
> Derived from existing Figma design system, shadcn/ui components, and production code.

## Brand

- **Product:** Contexture — visual Convex model editor that pairs a graph canvas with agent-safe model changes
- **Tagline:** "Where schemas take shape."
- **Voice:** Precise, confident, approachable, builder-oriented. Never academic, never dismissive.
- **Logo:** Three connected nodes in a triangle. Always title-case: "Contexture".
- **Default theme:** Dark — the graph canvas renders best on dark backgrounds.
- **Theme family:** Catppuccin Latte for light mode and Catppuccin Mocha for dark mode.

## Color Tokens

The shared palette is aligned to official Catppuccin values: Latte in light mode, Mocha in dark mode. The system uses Catppuccin's cool lavender neutrals for structure, Mauve for primary actions and object identity, Lavender for selection, references, and soft Convex table chrome, neutral Overlay/Subtext values for index/query structure, Green for success/union ownership, Yellow/Peach for enums and warnings, and Red/Maroon for destructive or invalid states.

### Core Palette

| Token                    | Light Mode                | Dark Mode                 | Usage                              |
| ------------------------ | ------------------------- | ------------------------- | ---------------------------------- |
| `--background`           | `#eff1f5`                 | `#1e1e2e`                 | Page background (Latte Base / Mocha Base) |
| `--foreground`           | `#4c4f69`                 | `#cdd6f4`                 | Primary text (Latte Text / Mocha Text) |
| `--card`                 | `#f9fafc`                 | `#313244`                 | Card / surface background          |
| `--card-foreground`      | `#4c4f69`                 | `#cdd6f4`                 | Card text                          |
| `--popover`              | `#f9fafc`                 | `#313244`                 | Popover / dropdown background      |
| `--popover-foreground`   | `#4c4f69`                 | `#cdd6f4`                 | Popover text                       |
| `--primary`              | `#8839ef`                 | `#cba6f7`                 | Primary actions, object identity (Mauve) |
| `--primary-foreground`   | `#eff1f5`                 | `#11111b`                 | Text on primary                    |
| `--secondary`            | `#e6e9ef`                 | `#313244`                 | Secondary surfaces                 |
| `--secondary-foreground` | `#4c4f69`                 | `#cdd6f4`                 | Text on secondary                  |
| `--muted`                | `#e6e9ef`                 | `#313244`                 | Muted backgrounds                  |
| `--muted-foreground`     | `#5c5f77`                 | `#bac2de`                 | Subdued text, labels, descriptions |
| `--accent`               | `#e6e9ef`                 | `#45475a`                 | Subtle hover/focus fill for shadcn chrome |
| `--accent-foreground`    | `#4c4f69`                 | `#cdd6f4`                 | Text on accent surfaces            |
| `--reference`            | `#1e66f5`                 | `#89b4fa`                 | Reference, selection, graph accent |
| `--reference-text`       | `#1a5fd7`                 | `#89b4fa`                 | Accessible reference text and icons |
| `--reference-foreground` | `#eff1f5`                 | `#11111b`                 | Text on reference surfaces         |
| `--border`               | `#ccd0da`                 | `#45475a`                 | Borders and dividers               |
| `--input`                | `#ccd0da`                 | `#45475a`                 | Input field borders                |
| `--ring`                 | `#7287fd`                 | `#89b4fa`                 | Focus ring                         |

### Semantic Colors

| Token                       | Light Mode                | Dark Mode                 | Usage           |
| --------------------------- | ------------------------- | ------------------------- | --------------- |
| `--destructive`             | `#d20f39`                 | `#f38ba8`                 | Errors, danger (Red) |
| `--destructive-foreground`  | `#eff1f5`                 | `#11111b`                 | Text on danger  |
| `--success`                 | `#40a02b`                 | `#a6e3a1`                 | Success states (Green) |
| `--success-foreground`      | `#eff1f5`                 | `#11111b`                 | Text on success |
| `--warning`                 | `#df8e1d`                 | `#f9e2af`                 | Warning states (Yellow) |
| `--warning-foreground`      | `#4c4f69`                 | `#11111b`                 | Text on warning |

### Chart Colors (Desktop App)

| Token       | Light Mode              | Dark Mode               |
| ----------- | ----------------------- | ----------------------- |
| `--chart-1` | `#8839ef`              | `#cba6f7`              |
| `--chart-2` | `#04a5e5`              | `#74c7ec`              |
| `--chart-3` | `#df8e1d`              | `#f9e2af`              |
| `--chart-4` | `#40a02b`              | `#a6e3a1`              |
| `--chart-5` | `#fe640b`              | `#fab387`              |

### Graph-Specific Tokens (Desktop App)

| Token                       | Light Mode                       | Dark Mode                        | Usage                        |
| --------------------------- | -------------------------------- | -------------------------------- | ---------------------------- |
| `--graph-bg`                | `#e6e9ef`                       | `#181825`                       | Canvas background            |
| `--graph-node-class`        | `#8839ef`                       | `#cba6f7`                       | Class/object node color (Mauve) |
| `--graph-node-header-bg`    | `#8839ef`                       | `#cba6f7`                       | Object node header background |
| `--graph-node-table-header-bg` | soft Lavender Surface mix        | soft Lavender Surface mix        | Table header tinted surface |
| `--graph-node-header-text`  | `#eff1f5`                       | `#11111b`                       | Node header text             |
| `--graph-node-body-bg`      | `color-mix(#eff1f5, white)`     | `color-mix(#313244, #1e1e2e)`   | Node body background         |
| `--graph-node-border`       | `color-mix(#8839ef, #bcc0cc)`   | `#45475a`                       | Node default border          |
| `--graph-node-table-accent` | muted Lavender mix               | muted Lavender mix               | Convex table marker |
| `--graph-node-selected`     | `#7287fd`                       | `#b4befe`                       | Selected node border         |
| `--graph-node-selected-bg`  | `color-mix(#7287fd, transparent)` | `color-mix(#b4befe, transparent)` | Selected node fill           |
| `--graph-node-adjacent`     | `color-mix(#7287fd, #bcc0cc)`   | `color-mix(#b4befe, #45475a)`   | Adjacent node border         |
| `--graph-edge-property`     | `#8839ef`                       | `#cba6f7`                       | Object property edges        |
| `--graph-edge-ref`          | muted Lavender mix               | `#89b4fa`                       | Reference relationship edges |
| `--graph-edge-disjoint`     | `#d20f39`                       | `#f38ba8`                       | Disjoint-with edges          |
| `--graph-edge-subclass`     | `#6c6f85`                       | `#9399b2`                       | SubClassOf edges             |
| `--inspector-type-enum`     | `#df8e1d`                       | `#f9e2af`                       | Enum type marker             |
| `--inspector-type-union`    | `#40a02b`                       | `#a6e3a1`                       | Discriminated union marker   |
| `--inspector-index`         | `#6c6f85`                       | `#9399b2`                       | Index and suggested query structure |
| `--inspector-advisory`      | `#7287fd`                       | `#b4befe`                       | Modeling advice, non-warning hints |

## Typography

| Property         | Value                                                       |
| ---------------- | ----------------------------------------------------------- |
| **Sans font**    | Geist (variable, 100-900)                                   |
| **Mono font**    | Geist Mono (variable, 100-900)                              |
| **Body font**    | `font-family: 'Geist', ui-sans-serif, system-ui, sans-serif`|
| **Smoothing**    | `-webkit-font-smoothing: antialiased`                       |

### Type Scale (Tailwind)

| Class      | Usage                            |
| ---------- | -------------------------------- |
| `text-2xl` | Page titles — `font-bold`        |
| `text-lg`  | Section headings — `font-semibold` |
| `text-base`| Body text                        |
| `text-sm`  | Labels, descriptions, secondary  |
| `text-xs`  | Status bar, metadata, badges     |

### Tracking

- Page titles: `tracking-tight`
- Section labels: `tracking-wider uppercase`
- Body: default tracking

## Spacing & Layout

| Property        | Value      |
| --------------- | ---------- |
| **Base radius**  | `0.5rem`   |
| **radius-sm**    | `0.3rem`   |
| **radius-md**    | `0.4rem`   |
| **radius-lg**    | `0.5rem`   |
| **radius-xl**    | `0.7rem`   |
| **radius-2xl**   | `0.9rem`   |

### Layout Patterns

- **Max content width:** `max-w-5xl` (marketing), `max-w-3xl` (text-heavy content)
- **Page padding:** `px-4 sm:px-8`
- **Section spacing:** `py-16 sm:py-32`
- **Card padding:** `p-6 sm:p-8`
- **Card border radius:** `rounded-xl`
- **Responsive grid:** `grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6`

### Desktop App Layout

- **Full viewport:** `height: 100vh; width: 100vw; overflow: hidden`
- **Resizable panels:** `react-resizable-panels` for split views
- **Graph canvas:** fills available space using React Flow
- **Detail panel:** slide-in right panel
- **Toolbar:** fixed top bar with drag region (`-webkit-app-region: drag`)

## Components

Built on **shadcn/ui** with **Tailwind CSS v4**. Prefer existing shadcn components over custom implementations. Extend, don't reinvent.

### Component Library

**Web app (marketing site):**
- `Button` — primary, secondary, ghost, destructive variants
- `Select` — dropdown selection
- `AnimatedThemeToggler` — light/dark mode switch
- `MobileNav` — responsive hamburger navigation
- `ThemeImage` — renders different images for light/dark theme
- `TrackedLink` — anchor with PostHog event tracking

**Desktop app (Electron):**
- **UI primitives:** Badge, Button, Checkbox, Command, ContextMenu, Dialog, DropdownMenu, Empty, Input, Label, Popover, Resizable, Select, Separator, Slider, Tabs, Textarea, Tooltip
- **Graph:** GraphCanvas, TypeNode, GroupNode, GraphBackground, GraphLegend, ContextMenu
- **Graph edges:** RefEdge
- **Detail panels:** TypeDetail, FieldDetail, EdgeDetail, DetailPanel
- **Chat:** ChatPanel, ChatThreadList
- **Toolbar:** Toolbar, GraphSearchBar, GraphControlsPanel
- **App:** UpdateBanner

### Button Patterns

```
Primary:    bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity
Secondary:  bg-secondary text-secondary-foreground border border-border/60 rounded-lg hover:bg-secondary/80 transition-colors
Ghost:      text-muted-foreground rounded-lg hover:text-accent-foreground hover:bg-accent transition-colors
Destructive: bg-destructive text-destructive-foreground rounded-lg hover:opacity-90 transition-opacity
```

In shadcn primitives, `--accent` is the routine hover/focus surface, so keep it subtle. Catppuccin color should be applied as sparse annotation on top of Base/Mantle/Surface/Overlay structure, not as competing full-surface fills. Selection and reference emphasis use Lavender through graph-specific tokens such as `--graph-node-selected` and `--graph-edge-ref`.

### Card Patterns

```
Standard:   rounded-xl border border-border/60 bg-card/50 p-6 sm:p-8 hover:border-primary/30 transition-colors
Subtle:     rounded-xl border border-border/60 bg-card/30 p-8
```

### Badge / Pill Patterns

```
Reference:  text-xs font-medium px-3 py-1 rounded-full border border-reference/20 bg-reference/5 text-reference-text
Neutral:    text-xs font-medium px-3 py-1 rounded-full border border-border/60 text-muted-foreground
Success:    text-xs font-medium px-3 py-1 rounded-full bg-success/10 text-success border border-success/20
Warning:    text-xs font-medium px-3 py-1 rounded-full bg-warning/10 text-warning border border-warning/20
```

### Graph Node Pattern

Class nodes use inline styles for React Flow compatibility:
- **Header:** Mauve background (`--graph-node-header-bg`), high-contrast text, 12px bold, ellipsis overflow
- **Table marker:** Muted Lavender icon/label and soft Lavender header surface (`--graph-node-table-accent`); avoid cyan/teal table fills and inset rails
- **Body:** Semi-transparent background (`--graph-node-body-bg`), lists datatype properties
- **Selection:** Lavender border (`--graph-node-selected`), restrained tinted background; avoid stacking hover halos, table rails, and row rails
- **Edges:** Lavender relationship lines (`--graph-edge-ref`)
- **Adjacent:** Dimmed node-selection border, no background tint
- **Dimmed:** `opacity: 0.2` when another node is selected and this node is not adjacent
- **Min/max width:** 160px — 220px
- **Border radius:** 8px with `backdrop-filter: blur(8px)`

## Icons

- **Icon set:** Lucide React
- **Default size:** `size-4` (16px) for inline, `size-5` (20px) for feature icons
- **Feature icon container:** `size-11 rounded-lg bg-primary/10` with `size-5` icon inside
- **Style:** Consistent stroke style, never filled

## Motion

Motion is purposeful and restrained. Every animation serves a function.

### Duration Scale

| Name     | Duration | Easing       | Usage              |
| -------- | -------- | ------------ | ------------------ |
| Micro    | 150ms    | ease-out     | Hover, focus       |
| Standard | 200ms    | ease-in-out  | Panels, modals     |
| Emphasis | 300ms    | spring       | Page transitions   |
| Graph    | 500ms    | spring       | Layout animation   |

### Animation Classes

- `animate-float-slow` — 20s ease-in-out, gentle floating (gradient orbs)
- `animate-float-slower` — 25s ease-in-out, slower floating
- `animate-fade-in-up` — 0.8s ease-out, entrance with Y translation
- `animate-node-float` — 8s ease-in-out, subtle node floating
- `animate-edge-pulse` — 6s ease-in-out, edge opacity pulse

### Principles

- **Purposeful** — every animation serves user comprehension
- **Quick** — no animation should feel like waiting
- **Consistent** — same pattern = same duration/easing
- **Reducible** — always respect `prefers-reduced-motion: reduce`

## Accessibility

- All animations disable under `prefers-reduced-motion: reduce`
- Focus visible via `outline-ring/50` on all interactive elements
- Graph nodes use title attributes for error/warning counts
- Logo marks use `aria-hidden="true"`
- SVG icons are decorative (`aria-hidden`)

## Tech Stack

| Layer          | Technology                                       |
| -------------- | ------------------------------------------------ |
| **Framework**  | Next.js 16 (web), Electron (desktop)             |
| **UI**         | shadcn/ui + Tailwind CSS v4                      |
| **Fonts**      | Geist Sans + Geist Mono (variable)               |
| **Icons**      | Lucide React                                     |
| **Animation**  | Framer Motion (complex), CSS transitions (simple)|
| **Graph**      | React Flow (@xyflow/react) + ELK layout          |
| **State**      | Zustand                                          |
| **Markdown**   | Streamdown (streaming-optimized renderer)         |
| **Analytics**  | PostHog                                          |
| **Errors**     | Sentry                                           |
