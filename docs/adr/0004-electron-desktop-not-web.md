# ADR 0004: Desktop editor is Electron, not Tauri or browser-only

- **Status:** Accepted (backfilled)
- **Date:** 2026-05-01

## Context

The editor needs:

- Direct filesystem access (read/write a `.contexture.json` bundle, watch sidecars for drift, and open the bundle folder in an editor).
- Long-lived process spawning (Codex and Claude CLI sessions, generated-target emits, and validation/check workflows).
- Native menus, window chrome, auto-update, and OS-keychain-style integration for credentials.
- A graph canvas with React Flow and ELK that benefits from a real Node runtime for layout work.

A pure browser app cannot do filesystem or process spawning without a separate backend. A desktop wrapper is required.

## Decision

Ship the editor as Electron, with React 19 + Vite (`electron-vite`) in the renderer and Node in the main process. Auto-update via `electron-updater`; releases distributed through GitHub Releases on tag.

## Consequences

- One codebase, one binary, one update channel. Sentry wired up for both main and renderer.
- Provider runtimes for Codex and Claude run in main, including CLI/app-server
  process management that would not be available in a browser-only app.
- Cost: bundle size, security model (sandbox: false in webPreferences for IPC ergonomics — accepted because we ship our own renderer code and validate everything that crosses IPC).
- Cost: cross-platform packaging (electron-builder for win/mac/linux).

## Alternatives considered

- **Tauri:** smaller binary, Rust backend. Rejected because the team's primary language is TypeScript; rewriting the agent integrations and document-store workflow in Rust would dwarf the binary-size win.
- **Browser app + local backend daemon:** two binaries, two update paths, harder onboarding.
- **VS Code extension:** ties us to one host editor and limits the canvas UX.
