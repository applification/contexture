# ADR 0014: Vitest as the test runner; `bun test` is actively rejected

- **Status:** Accepted (backfilled)
- **Date:** 2026-05-01

## Context

Bun is the package manager and script runner. Bun also ships its own test runner (`bun test`). Mixing test runners across packages would mean inconsistent assertion APIs, inconsistent mocking semantics, and inconsistent watch behaviour.

Vitest matches Jest's API surface, integrates with the Vite-based renderer toolchain, supports DOM testing via jsdom, has first-class TypeScript and ESM support, and works identically in CI and locally.

`bun test` lacks parity with Vitest's mock and DOM stories at the time of writing; tests written against `bun test` would not run under Vitest without rewrites.

## Decision

Vitest is the test runner across the entire repo. `*.test.ts` / `*.test.tsx` in `tests/` per package. Run via `bun run test` (which delegates to `turbo test`, which delegates to `vitest run`). Watch via `bun run test:watch`.

`scripts/reject-bun-test.ts` actively rejects accidental `bun test` invocations, because the binary will silently run a different runner and produce confusing results.

## Consequences

- One assertion API, one mocking API, one watch UX everywhere.
- The renderer's Vite config is reused for tests — same path aliases, same plugins, same module resolution.
- Cost: Bun's test runner is faster on raw startup, but `vitest run` with Turbo cache is comparable in practice and the consistency win is worth the tradeoff.

## Alternatives considered

- **`bun test` everywhere:** API gaps for DOM and mocks; would require migration if/when Bun closes them.
- **Mixed runners (Bun for packages, Vitest for the renderer):** confusing and breaks shared test utilities.
- **Jest:** slower, separate config from the Vite-based renderer toolchain.
