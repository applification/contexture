# Speculative ecosystem-glue emitters

Contexture will not ship emitters whose audience is hypothetical rather than evidenced. Specific examples covered here:

- **OpenAPI `components.schemas`** documents.
- **Static MCP tool-definition** JSON files.
- **Form validator adapters** (TanStack Form / React Hook Form resolvers backed by emitted Zod).

## Why this is out of scope

Both targets were proposed as ecosystem glue for hypothetical audiences. Closer inspection found:

**OpenAPI components emitter.** Contexture's audience is AI engineers using Convex + Zod + the Anthropic SDK. Convex is not an HTTP API in the OpenAPI sense; it's accessed via the Convex client. The OpenAPI emit only matters if a user is *also* exposing a separate REST API on top of their Convex data and wants the schemas to share a source. That's a narrow, hypothetical user, and there is no concrete evidence anyone wants this. Pre-building for it is the kind of "design for hypothetical future requirements" the project explicitly avoids.

**MCP tool-definition JSON files.** This rests on a misreading of the Model Context Protocol. MCP tool definitions are a *runtime* contract — an MCP server registers tools when it starts (the way `createSdkMcpServer` does it in `apps/desktop/src/main/ipc/claude.ts`), and a host queries the running server. There is no "static MCP tool-def JSON file" format that hosts import. The runtime tool surface for non-Anthropic MCP hosts is already covered by `@contexture/mcp` (#164).

**Form validator emitter (TanStack Form / RHF).** Same pattern. The original direction doc flagged this as "lowest priority but a clean win for the Next.js audience." There is no concrete user pulling for it, the glue is small enough that a user can hand-write it in minutes, and `@hookform/resolvers/zod` already exists upstream to consume the emitted Zod directly. Pre-building the adapter for hypothetical Next.js demand fails the same "don't design for hypothetical future requirements" test.

If a real user shows up wanting any of these, reopen the relevant half with concrete evidence. Until then, don't build them.

## Prior requests

- #170 — "PRD: OpenAPI / MCP-tool-defs emitter"
- #171 — "PRD: Form validator emitter (TanStack / RHF)"
