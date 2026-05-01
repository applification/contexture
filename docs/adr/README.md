# Architectural Decision Records

Load-bearing decisions in Contexture's architecture. New ADRs append; existing ADRs are superseded rather than rewritten.

Format: Context → Decision → Consequences → Alternatives. Status is `Proposed` / `Accepted` / `Superseded by NNNN`.

| # | Title | Status |
|---|---|---|
| [0001](0001-turborepo-bun-monorepo.md) | Turborepo monorepo with Bun workspaces | Accepted |
| [0002](0002-stdlib-runtime-package-boundary.md) | `stdlib` owns implementation; `runtime` is a thin re-export | Accepted |
| [0003](0003-core-package-with-renderer-model-mirror.md) | `@contexture/core` as the shared IR kernel, mirrored under `renderer/src/model/` | Accepted |
| [0004](0004-electron-desktop-not-web.md) | Desktop editor is Electron, not Tauri or browser-only | Accepted |
| [0005](0005-zod-meta-schema-as-ir.md) | Zod meta-schema is the authoritative IR; TS types via `z.infer` | Accepted |
| [0006](0006-versioned-ir-with-migration-chain.md) | Versioned IR with a migration chain, even when empty | Accepted |
| [0007](0007-closed-world-op-vocabulary.md) | Closed-world schema edited via a small op vocabulary | Accepted |
| [0008](0008-pure-ops-reducer-no-exceptions.md) | Ops reducer is pure and returns `{schema} \| {error}` | Accepted |
| [0009](0009-file-bundle-and-sidecar-layout.md) | `.contexture.json` + `.contexture/` sidecars + emitted `.schema.{ts,json}` | Accepted |
| [0010](0010-sha256-manifest-for-drift-detection.md) | SHA-256 manifest of emitted artefacts for drift detection | Accepted |
| [0011](0011-claude-agent-sdk-with-mcp-op-tools.md) | Chat→IR channel uses Claude Agent SDK + MCP `op_tools` | Accepted |
| [0012](0012-claude-cli-detection-for-max-mode.md) | Detect a local `claude` CLI to enable Max-mode auth fallback | Accepted |
| [0013](0013-biome-over-eslint-prettier.md) | Biome instead of ESLint + Prettier | Accepted |
| [0014](0014-vitest-not-bun-test.md) | Vitest as the test runner; `bun test` rejected | Accepted |
| [0015](0015-conventional-commits-one-pr-per-issue.md) | Conventional commits and one PR per issue | Accepted |
| [0016](0016-tdd-behaviour-only-no-internal-mocks.md) | TDD; behaviour-only tests; mock only at system boundaries | Accepted |
| [0017](0017-sandcastle-deterministic-eligibility-then-llm-subset.md) | Sandcastle: deterministic eligibility, then LLM subset selector | Accepted |
| [0018](0018-docker-sandboxed-afk-with-pr-link-claim.md) | AFK agents in Docker sandboxes; PR body links claim issues | Accepted |
| [0019](0019-separate-marketing-site-on-vercel.md) | Marketing site is a separate Next.js app on Vercel | Accepted |
| [0020](0020-shadcn-tailwind-v4-oklch.md) | shadcn/ui + Tailwind v4 + OKLCH design tokens | Accepted |

## Adding a new ADR

1. Pick the next number.
2. Use the existing files as a template — Context → Decision → Consequences → Alternatives.
3. Add a row to the table above.
4. Reference the ADR from code comments where it's load-bearing (e.g. "see ADR 0007").
