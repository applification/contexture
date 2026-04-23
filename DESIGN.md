# Contexture Design System

> AI-readable design system specification for Contexture — the visual Zod schema editor with LLM support.
> Derived from existing Figma design system, shadcn/ui components, and production code.

## Brand

- **Product:** Contexture — visual Zod schema editor that pairs a graph canvas with LLM-driven edits
- **Tagline:** "Where schemas take shape."
- **Voice:** Precise, confident, approachable, builder-oriented. Never academic, never dismissive.
- **Logo:** Three connected nodes in a triangle. Always title-case: "Contexture".
- **Default theme:** Dark — the graph canvas renders best on dark backgrounds.

## Color Tokens

All colors use OKLCH for perceptual uniformity. The palette is built around deep indigo (intelligence, depth) with electric cyan as an accent (data, interactivity). All neutrals carry a subtle cool tint at hue 270.

### Core Palette

| Token                    | Light Mode                | Dark Mode                 | Usage                              |
| ------------------------ | ------------------------- | ------------------------- | ---------------------------------- |
| `--background`           | `oklch(0.98 0.005 270)`   | `oklch(0.14 0.02 270)`    | Page background                    |
| `--foreground`           | `oklch(0.13 0.03 270)`    | `oklch(0.93 0.01 270)`    | Primary text                       |
| `--card`                 | `oklch(1 0 0)`            | `oklch(0.18 0.02 270)`    | Card / surface background          |
| `--card-foreground`      | `oklch(0.13 0.03 270)`    | `oklch(0.93 0.01 270)`    | Card text                          |
| `--popover`              | `oklch(1 0 0)`            | `oklch(0.18 0.02 270)`    | Popover / dropdown background      |
| `--popover-foreground`   | `oklch(0.13 0.03 270)`    | `oklch(0.93 0.01 270)`    | Popover text                       |
| `--primary`              | `oklch(0.45 0.15 270)`    | `oklch(0.65 0.12 280)`    | Primary actions, brand indigo      |
| `--primary-foreground`   | `oklch(1 0 0)`            | `oklch(1 0 0)`            | Text on primary                    |
| `--secondary`            | `oklch(0.95 0.01 270)`    | `oklch(0.2 0.02 270)`     | Secondary surfaces                 |
| `--secondary-foreground` | `oklch(0.13 0.03 270)`    | `oklch(0.93 0.01 270)`    | Text on secondary                  |
| `--muted`                | `oklch(0.95 0.01 270)`    | `oklch(0.2 0.02 270)`     | Muted backgrounds                  |
| `--muted-foreground`     | `oklch(0.5 0.03 270)`     | `oklch(0.6 0.02 270)`     | Subdued text, labels, descriptions |
| `--accent`               | `oklch(0.75 0.15 195)`    | `oklch(0.75 0.15 195)`    | Electric cyan — data, interactivity|
| `--accent-foreground`    | `oklch(0.13 0.03 270)`    | `oklch(0.93 0.01 270)`    | Text on accent surfaces            |
| `--border`               | `oklch(0.9 0.01 270)`     | `oklch(0.25 0.02 270)`    | Borders and dividers               |
| `--input`                | `oklch(0.9 0.01 270)`     | `oklch(0.25 0.02 270)`    | Input field borders                |
| `--ring`                 | `oklch(0.45 0.15 270)`    | `oklch(0.65 0.12 280)`    | Focus ring                         |

### Semantic Colors

| Token                       | Light Mode                | Dark Mode                 | Usage           |
| --------------------------- | ------------------------- | ------------------------- | --------------- |
| `--destructive`             | `oklch(0.55 0.2 25)`      | `oklch(0.6 0.2 25)`       | Errors, danger  |
| `--destructive-foreground`  | `oklch(1 0 0)`            | `oklch(1 0 0)`            | Text on danger  |
| `--success`                 | `oklch(0.6 0.2 145)`      | `oklch(0.65 0.2 145)`     | Success states  |
| `--success-foreground`      | `oklch(1 0 0)`            | `oklch(1 0 0)`            | Text on success |
| `--warning`                 | `oklch(0.7 0.15 75)`      | `oklch(0.7 0.15 75)`      | Warning states  |
| `--warning-foreground`      | `oklch(0.13 0.03 270)`    | `oklch(0.93 0.01 270)`    | Text on warning |

### Chart Colors (Desktop App)

| Token       | Light Mode              | Dark Mode               |
| ----------- | ----------------------- | ----------------------- |
| `--chart-1` | `oklch(0.55 0.15 270)`  | `oklch(0.65 0.12 280)`  |
| `--chart-2` | `oklch(0.75 0.15 195)`  | `oklch(0.75 0.15 195)`  |
| `--chart-3` | `oklch(0.80 0.16 80)`   | `oklch(0.80 0.16 80)`   |
| `--chart-4` | `oklch(0.55 0.17 155)`  | `oklch(0.55 0.17 155)`  |
| `--chart-5` | `oklch(0.60 0.22 15)`   | `oklch(0.65 0.20 15)`   |

### Graph-Specific Tokens (Desktop App)

| Token                       | Light Mode                       | Dark Mode                        | Usage                        |
| --------------------------- | -------------------------------- | -------------------------------- | ---------------------------- |
| `--graph-bg`                | `oklch(0.95 0.01 270)`           | `oklch(0.18 0.02 270)`           | Canvas background            |
| `--graph-node-class`        | `oklch(0.45 0.15 270)`           | `oklch(0.65 0.12 280)`           | Class node color             |
| `--graph-node-header-bg`    | `oklch(0.45 0.15 270 / 0.9)`     | `oklch(0.45 0.15 270 / 0.9)`     | Node header background       |
| `--graph-node-header-text`  | `oklch(1 0 0)`                   | `oklch(1 0 0)`                   | Node header text             |
| `--graph-node-body-bg`      | `oklch(0.95 0.01 270 / 0.85)`    | `oklch(0.18 0.02 270 / 0.92)`    | Node body background         |
| `--graph-node-border`       | `oklch(0.45 0.15 270 / 0.25)`    | `oklch(0.25 0.02 270)`           | Node default border          |
| `--graph-node-selected`     | `oklch(0.75 0.15 195)`           | `oklch(0.75 0.15 195)`           | Selected node border (cyan)  |
| `--graph-node-selected-bg`  | `oklch(0.75 0.15 195 / 0.1)`     | `oklch(0.75 0.15 195 / 0.1)`     | Selected node fill           |
| `--graph-node-adjacent`     | `oklch(0.75 0.15 195 / 0.45)`    | `oklch(0.75 0.15 195 / 0.45)`    | Adjacent node border         |
| `--graph-edge-property`     | `oklch(0.65 0.12 280)`           | `oklch(0.65 0.08 280)`           | Object property edges        |
| `--graph-edge-disjoint`     | `oklch(0.60 0.12 15)`            | `oklch(0.65 0.12 15)`            | Disjoint-with edges          |
| `--graph-edge-subclass`     | `oklch(0.50 0.02 270)`           | `oklch(0.65 0.015 270)`          | SubClassOf edges             |

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
- **Graph:** ReactFlowCanvas, ClassNode, GroupNode, GraphBackground, GraphLegend, ContextMenu
- **Graph edges:** ObjectPropertyEdge, SubClassOfEdge, DisjointWithEdge
- **Detail panels:** ClassDetail, EdgeDetail, DetailPanel
- **Chat:** ChatPanel, ChatThreadList
- **Toolbar:** Toolbar, GraphSearchBar, GraphControlsPanel
- **App:** UpdateBanner

### Button Patterns

```
Primary:    bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity
Secondary:  bg-secondary text-secondary-foreground border border-border/60 rounded-lg hover:bg-secondary/80 transition-colors
Ghost:      text-muted-foreground rounded-lg hover:text-foreground hover:bg-muted/50 transition-colors
Destructive: bg-destructive text-destructive-foreground rounded-lg hover:opacity-90 transition-opacity
```

### Card Patterns

```
Standard:   rounded-xl border border-border/60 bg-card/50 p-6 sm:p-8 hover:border-primary/30 transition-colors
Subtle:     rounded-xl border border-border/60 bg-card/30 p-8
```

### Badge / Pill Patterns

```
Accent:     text-xs font-medium px-3 py-1 rounded-full border border-accent/20 bg-accent/5 text-accent
Neutral:    text-xs font-medium px-3 py-1 rounded-full border border-border/60 text-muted-foreground
Success:    text-xs font-medium px-3 py-1 rounded-full bg-success/10 text-success border border-success/20
Warning:    text-xs font-medium px-3 py-1 rounded-full bg-warning/10 text-warning border border-warning/20
```

### Graph Node Pattern

Class nodes use inline styles for React Flow compatibility:
- **Header:** Indigo background (`--graph-node-header-bg`), white text, 12px bold, ellipsis overflow
- **Body:** Semi-transparent background (`--graph-node-body-bg`), lists datatype properties
- **Selection:** Cyan border (`--graph-node-selected`), tinted background
- **Adjacent:** Dimmed cyan border, no background tint
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
