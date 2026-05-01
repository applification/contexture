# ADR 0004: Desktop editor is Electron, not Tauri or browser-only

- **Status:** Accepted (backfilled)
- **Date:** 2026-05-01

## Context

The editor needs:

- Direct filesystem access (read/write a `.contexture.json` bundle, watch sidecars for drift, scaffold a project directory with git init and turbo skeleton).
- Long-lived process spawning (Claude Agent SDK CLI, Convex emit, scaffold runners).
- Native menus, window chrome, auto-update, and OS-keychain-style integration for credentials.
- A graph canvas with React Flow and ELK that benefits from a real Node runtime for layout work.

A pure browser app cannot do filesystem or process spawning without a separate backend. A desktop wrapper is required.

## Decision

Ship the editor as Electron, with React 19 + Vite (`electron-vite`) in the renderer and Node in the main process. Auto-update via `electron-updater`; releases distributed through GitHub Releases on tag.

## Consequences

- One codebase, one binary, one update channel. Sentry wired up for both main and renderer.
- The Claude Agent SDK runs in main, calling out to the user's local `claude` CLI when no API key is set — possible because we're a real Node process.
- Cost: bundle size, security model (sandbox: false in webPreferences for IPC ergonomics — accepted because we ship our own renderer code and validate everything that crosses IPC).
- Cost: cross-platform packaging (electron-builder for win/mac/linux).

## Alternatives considered

- **Tauri:** smaller binary, Rust backend. Rejected because the team's primary language is TypeScript; rewriting the scaffold pipeline, Claude integration, and document store in Rust would dwarf the binary-size win.
- **Browser app + local backend daemon:** two binaries, two update paths, harder onboarding.
- **VS Code extension:** ties us to one host editor and limits the canvas UX.
