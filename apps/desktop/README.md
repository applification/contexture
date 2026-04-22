# Contexture

A modern desktop Zod schema editor with Claude AI integration. Chat to
Claude about a domain, build a closed-world schema visually, and generate
Zod + JSON Schema outputs that downstream LLM pipelines can import.

## Features

- **Visual schema editor** — types and fields on a React Flow canvas; edges
  follow field-level refs.
- **Claude AI assistant** — chat-driven schema authoring via a small op
  vocabulary (add type, add field, rename, set discriminator, …) exposed as
  an in-process MCP server.
- **IR source of truth** — `.contexture.json` is the canonical project
  file; `.schema.ts` (Zod) and `.schema.json` are generated alongside and
  git-checked so products can import them directly.
- **Curated stdlib** — common types (Email, URL, UUID, Address, Money,
  PhoneE164, …) referenced by qualified name (`common.Email`) and emitted
  as `import` statements from `@contexture/runtime/<namespace>`.
- **Eval panel** — generate sample data (realistic / minimal / edge-case /
  adversarial) against a selected root type; Zod-validate; save fixtures.
- **Auto layout** — ELK positions on load, sidecar-persisted overrides.
- **Undo/redo** — per-action for direct manipulation, per-turn for chat.
- **Cross-platform** — macOS, Windows, and Linux builds with auto-update
  via GitHub Releases.

> The Phase 2 pivot away from OWL/RDF/JSON-LD is in progress. The
> repository retains the OWL editor surface until Phase 2 lands — see
> [`plans/pivot.md`](../../plans/pivot.md) for the execution plan.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 35 |
| UI | React 19, TypeScript 5.8 |
| Build | Vite 7 via electron-vite 5 |
| Graph | @xyflow/react 12, elkjs |
| Styling | Tailwind CSS 4, shadcn/ui, Radix UI |
| State | Zustand 5 |
| Schema | Zod (runtime + IR meta-schema) |
| AI | @anthropic-ai/claude-agent-sdk |
| Testing | Vitest, Testing Library, Playwright |

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
│       ├── claude.ts       # Claude AI integration + MCP server
│       ├── eval.ts         # Evaluation panel
│       └── update.ts       # Auto-update
├── preload/
│   └── index.ts            # window.api bridge
└── renderer/src/
    ├── App.tsx             # Root component
    ├── model/              # Domain model
    │   ├── types.contexture.ts # IR shape (Phase 2 draft)
    │   └── …               # legacy OWL model (removed in Phase 2)
    ├── store/              # Zustand state management
    ├── services/           # validation, tokens
    ├── hooks/              # layout, sidecars
    └── components/         # graph, chat, detail, eval, ui
tests/                       # Vitest test suites
build/                       # App icons and resources
resources/                   # Bundled stdlib + skills (Phase 2)
```

## Releases

Releases are automated via GitHub Actions. Pushing a semver git tag
triggers the release workflow:

```bash
# Tag the release
git tag v1.2.3
git push origin v1.2.3
```

This will:

1. **Create a GitHub Release** with auto-generated release notes
2. **Build platform binaries** in parallel (macOS, Windows, Linux)
3. **Publish artifacts** to the GitHub Release — `.dmg`/`.zip` (macOS),
   NSIS installer (Windows), AppImage/`.deb` (Linux)

macOS builds are code-signed and notarized. The app's built-in
auto-updater checks GitHub Releases for new versions.

### Tag format

Tags must match `v*.*.*` (e.g. `v0.1.0`, `v1.0.0-beta.1`). Conventional
commits are required.

## License

MIT
