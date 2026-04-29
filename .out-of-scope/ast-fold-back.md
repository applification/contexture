# Per-target AST fold-back parsers

Contexture will not build per-target AST fold-back parsers (e.g. a Zod-AST → IR diff inferrer, a Convex-schema-AST → IR diff inferrer) to reconcile drifted emitted files back into the IR.

## Why this is out of scope

The reconcile flow is already implemented using a different architecture: `useClaudeReconcile` sends `(IR, on-disk source)` to a one-shot Claude call, which returns a list of structured IR `Op`s with labels and a `lossy` flag. The `ReconcileModal` displays these as a selectable checklist and uses `@pierre/diffs` `MultiFileDiff` to show a split between "what Contexture would emit if the selected ops applied" and "the on-disk file", with a residual changed-line counter underneath.

This LLM-driven approach has properties that per-target AST parsers cannot match:

- **One implementation, all targets.** The same flow generalises to Zod, JSON Schema, Anthropic tool-call schemas, and any future emit target — only the prompt and the emit-projection change.
- **No construct registry to maintain.** AST fold-back requires an explicit list of recognised constructs per target; novel constructs hit an "unhandled" path. The LLM has no such ceiling.
- **Structured ops, not freeform diffs.** Returned ops are validated by attempting to apply them; invalid entries are dropped. Apply runs through the undo store as one transaction.
- **Chat fallback is built in.** "Open in chat" seeds a thread with the IR + source + proposed ops when ops alone aren't enough — a path that doesn't exist in an AST-based design.

Building Zod and Convex AST parsers in addition to the LLM flow would add maintenance burden for no user-visible benefit. The reconcile slice that **does** matter is generalising the existing modal beyond `convex/schema.ts` (#161) so it works against any drifted emitted file.

## Prior requests

- #162 — "PRD: Drift fold-back for Zod"
- #163 — "PRD: Drift fold-back for Convex schema"
