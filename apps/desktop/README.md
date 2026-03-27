# Ontograph

A modern desktop ontology editor with Claude AI integration. Create, visualize, and edit OWL ontologies in Turtle format through an interactive graph interface.

## Features

- **Visual Graph Editor** — Interactive node-based visualization of classes, properties, and relationships using React Flow
- **OWL Ontology Support** — Classes (with subClassOf, disjointWith), Object Properties (domain, range, inverseOf, cardinality), and Datatype Properties
- **Claude AI Assistant** — Chat-driven ontology creation and modification via the Claude Agent SDK
- **Real-time Validation** — Detects circular inheritance, missing references, and best-practice violations
- **Auto Layout** — Force-directed graph layout powered by ELK (Eclipse Layout Kernel) with adaptive algorithms
- **Graph Filtering** — Toggle visibility of relationship types (inheritance, disjoint, object/datatype properties)
- **File Management** — Open, save, and export `.ttl` (Turtle) files with recent-file tracking
- **Undo/Redo** — Full history support (Cmd/Ctrl+Z)
- **Cross-platform** — macOS, Windows, and Linux builds with auto-update via GitHub Releases

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 35 |
| UI | React 19, TypeScript 5.8 |
| Build | Vite 7 via electron-vite 5 |
| Graph | @xyflow/react 12, elkjs |
| Styling | Tailwind CSS 4, shadcn/ui, Radix UI |
| State | Zustand 5 |
| Ontology | n3 (Turtle parser/serializer) |
| AI | @anthropic-ai/claude-agent-sdk |
| Validation | Zod |
| Testing | Vitest, Testing Library, jsdom |

## Prerequisites

- [Bun](https://bun.sh) (package manager and script runner)
- [Node.js](https://nodejs.org) 18+

## Getting Started

```bash
# Install dependencies
bun install

# Run in development mode (hot reload)
bun run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start in dev mode with hot reload |
| `bun run build` | Build the application |
| `bun run start` | Preview the built application |
| `bun run typecheck` | Run TypeScript checks (main + renderer) |
| `bun run test` | Run tests once |
| `bun run test:watch` | Run tests in watch mode |
| `bun run build:mac` | Package for macOS (.dmg, .zip) |
| `bun run build:win` | Package for Windows (NSIS installer) |
| `bun run build:linux` | Package for Linux (AppImage, .deb) |

## Project Structure

```
src/
├── main/                   # Electron main process
│   ├── index.ts            # Entry point, window management
│   ├── menu.ts             # Application menu
│   └── ipc/                # IPC handlers
│       ├── file.ts         # File open/save
│       ├── claude.ts       # Claude AI integration
│       ├── eval.ts         # Evaluation panel
│       └── update.ts       # Auto-update
├── preload/
│   └── index.ts            # window.api bridge
└── renderer/src/
    ├── App.tsx              # Root component
    ├── model/               # Domain model
    │   ├── types.ts         # Ontology type definitions
    │   ├── parse.ts         # Turtle → internal model
    │   ├── serialize.ts     # Internal model → Turtle
    │   └── reactflow.ts     # Model → React Flow elements
    ├── store/               # Zustand state management
    │   ├── ontology.ts      # Ontology data + mutations
    │   ├── ui.ts            # UI state (selection, theme, sidebar)
    │   ├── eval.ts          # Evaluation panel state
    │   └── history.ts       # Undo/redo snapshots
    ├── services/
    │   ├── validation.ts    # Ontology validation rules
    │   └── tokens.ts        # Token counting
    ├── hooks/
    │   ├── useELKLayout.ts  # Graph auto-layout
    │   └── useLayoutSidecar.ts  # Persist node positions
    └── components/
        ├── graph/           # Graph canvas, nodes, edges, context menu
        ├── chat/            # Claude AI chat panel
        ├── detail/          # Properties editor panel
        ├── eval/            # Evaluation/query panel
        ├── validation/      # Validation error display
        ├── toolbar/         # File/edit controls, graph filters
        ├── activity-bar/    # Sidebar tab switcher
        ├── status-bar/      # Bottom status info
        └── ui/              # shadcn/ui primitives
tests/                       # Vitest test suites
build/                       # App icons and resources
resources/                   # Sample ontologies
```

## Architecture

### State Management

Three Zustand stores manage application state:

- **ontologyStore** — Core ontology data (classes, object properties, datatype properties), file operations, and dirty tracking. Supports undo/redo via the history store.
- **uiStore** — Selection, theme, sidebar visibility, graph filters, and layout settings.
- **historyStore** — Undo stack with up to 50 snapshots, triggered by ontology mutations.

### IPC Architecture

Electron's main and renderer processes communicate via typed IPC channels:

1. **Renderer** calls methods on `window.api` (exposed by the preload script)
2. **Main process** handles file I/O, Claude sessions, evaluation, and app updates
3. Results and events flow back to the renderer via IPC responses

### Graph Pipeline

1. **Parse** — Turtle files are parsed into an internal ontology model (Maps of classes and properties)
2. **Convert** — `ontologyToReactFlowElements` transforms the model into React Flow nodes and edges
3. **Layout** — ELK algorithm positions nodes (stress layout for small graphs, layered for large)
4. **Render** — Custom React components render each node and edge type with distinct styling

### Claude AI Integration

The AI assistant uses the Claude Agent SDK with tools that can:
- Read the current ontology state
- Create, update, and delete classes and properties
- Load entire ontologies from Turtle
- Run validation checks

Sessions support extended thinking and can be reset between conversations.

## Ontology Model

Ontograph works with [OWL](https://www.w3.org/OWL/) ontologies serialized in [Turtle](https://www.w3.org/TR/turtle/) format (`.ttl`). The core elements are:

- **Classes** — Concepts with optional labels, comments, `subClassOf` (inheritance), and `disjointWith` relationships
- **Object Properties** — Relations between classes with domain, range, optional `inverseOf`, and cardinality constraints
- **Datatype Properties** — Relations from classes to XSD data types (string, integer, etc.) with domain, range, and cardinality

## Releases

Releases are automated via GitHub Actions. Pushing a semver git tag triggers the [release workflow](../../.github/workflows/release.yml):

```bash
# Tag the release
git tag v1.2.3
git push origin v1.2.3
```

This will:

1. **Create a GitHub Release** with auto-generated release notes
2. **Build platform binaries** in parallel (macOS, Windows, Linux)
3. **Publish artifacts** to the GitHub Release — `.dmg`/`.zip` (macOS), NSIS installer (Windows), AppImage/`.deb` (Linux)

macOS builds are code-signed and notarized. The app's built-in auto-updater checks GitHub Releases for new versions.

### Tag format

Tags must match `v*.*.*` (e.g. `v0.1.0`, `v1.0.0-beta.1`). Conventional commits are required.

## License

MIT
