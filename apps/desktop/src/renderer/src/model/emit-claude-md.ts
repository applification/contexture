/**
 * Pure emitter for the root `CLAUDE.md` that Contexture writes once at
 * project-scaffold time. Coding agents (Claude Code, Cursor, …) read it
 * on first open to learn the project's source-of-truth rule and the
 * edit contract for the emitted Convex schema.
 *
 * After the initial emit the file is user-owned — Contexture never
 * regenerates it, and the output intentionally carries no
 * `@contexture-generated` banner so the drift detector ignores it.
 */

const TEMPLATE = `# {{PROJECT_NAME}}

A Convex + Next.js monorepo scaffolded by Contexture. The schema is the
source of truth at \`packages/contexture/{{PROJECT_NAME}}.contexture.json\` and
is re-emitted automatically to \`packages/contexture/convex/schema.ts\` on every
edit. \`apps/web\` imports the workspace package \`@{{PROJECT_NAME}}/contexture\`
rather than owning its own \`convex/\` folder.

## Layout

\`\`\`
{{PROJECT_NAME}}/
  apps/web/             Next.js app (App Router, Tailwind, shadcn)
                        imports @{{PROJECT_NAME}}/contexture
  packages/contexture/      Shared schema package (Zod + JSON + Convex)
    {{PROJECT_NAME}}.contexture.json   source of truth
    {{PROJECT_NAME}}.schema.ts          @contexture-generated (Zod)
    {{PROJECT_NAME}}.schema.json        @contexture-generated (JSON Schema)
    index.ts            @contexture-generated barrel
    convex/
      schema.ts         @contexture-generated — regenerated from the IR
      <table>.ts        @contexture-seeded — edit freely
    .contexture/        Contexture internal state (off-limits)
\`\`\`

## Source of truth

Do NOT edit \`packages/contexture/convex/schema.ts\` directly — it is regenerated
on every IR save. To change the schema, edit
\`packages/contexture/{{PROJECT_NAME}}.contexture.json\` (or ask the user to
use Contexture's editor).

If you do edit the generated file by mistake, Contexture detects the
drift and offers the user a reconcile flow that folds your edits back
into the IR. Your work is never silently clobbered.

## CRUD files are yours

\`packages/contexture/convex/<table>.ts\` files are seeded once by the scaffolder and
are \`@contexture-seeded\`, not \`@contexture-generated\`. Add queries,
mutations, and indexes as the app requires — Contexture does not
regenerate them.

## Using the schema from app code

Import Zod schemas from \`@{{PROJECT_NAME}}/contexture\` for runtime
validation and inferred types:

\`\`\`ts
import { Post } from '@{{PROJECT_NAME}}/contexture';

const parsed = Post.parse(input);
type Post = z.infer<typeof Post>;
\`\`\`

The Convex validators in \`packages/contexture/convex/schema.ts\` are derived from
the same source, so field shape is guaranteed to match.

## Conventions

- Use Zod for all user-input validation.
- Prefer \`z.infer<typeof X>\` over hand-written TypeScript interfaces.
- Convex runs as a local-only deployment (\`convex dev --local\`). Data
  lives under \`~/.convex/\` on this machine — do not assume a cloud
  deployment unless the user sets one up explicitly.

## Adding a table

1. Open the IR (\`packages/contexture/{{PROJECT_NAME}}.contexture.json\`) or
   Contexture.
2. Add the object type, set \`"table": true\`.
3. Save. Contexture re-emits \`packages/contexture/convex/schema.ts\`.
4. Add CRUD handlers in \`packages/contexture/convex/<table>.ts\` as needed.

## What NOT to touch

\`packages/contexture/.contexture/\` — Contexture's internal state (graph
layout, chat history, emit manifest). The directory is gitignored.

## Commands

\`\`\`
bun run dev      # Next.js + Convex together
bun run build    # Next.js production build
bun run test     # workspace tests
bun run lint     # biome check
\`\`\`

## Contexture

This project is edited with Contexture. If the user mentions "the
canvas" or "the graph," they mean Contexture's visual schema editor.
`;

export function emit(projectName: string): string {
  return TEMPLATE.replaceAll('{{PROJECT_NAME}}', projectName);
}
