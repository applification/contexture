/**
 * `scaffoldConvexEmit` (stage 7) — emits the Convex schema (and
 * per-table CRUD seeds, if the initial IR had any tables) at
 * `packages/schema/convex/`. At scaffold time the IR is empty, so
 * the convex schema is the degenerate `defineSchema({})`. The stage
 * still needs to run so `bun run dev` finds a valid schema file.
 */
import { createMemFsAdapter } from '@main/documents/mem-fs-adapter';
import { scaffoldConvexEmit } from '@main/scaffold/convex-emit';
import { beforeEach, describe, expect, it } from 'vitest';

const config = { targetDir: '/work/my-proj', projectName: 'my-proj' };
const schemaDir = '/work/my-proj/packages/schema';

let fs: ReturnType<typeof createMemFsAdapter>;

beforeEach(() => {
  fs = createMemFsAdapter();
});

describe('scaffoldConvexEmit', () => {
  it('writes packages/schema/convex/schema.ts with the contexture-generated banner', async () => {
    // Stage 6 has already written the empty IR; we read it back.
    const irPath = `${schemaDir}/my-proj.contexture.json`;
    await fs.writeFile(irPath, JSON.stringify({ version: '1', types: [] }));

    await scaffoldConvexEmit(config, { fs });

    const convexPath = `${schemaDir}/convex/schema.ts`;
    expect(fs.exists(convexPath)).toBe(true);
    const source = await fs.readFile(convexPath);
    expect(source).toContain('@contexture-generated');
    expect(source).toMatch(/defineSchema\s*\(/);
  });

  it('does not emit per-table CRUD files when the IR has no tables', async () => {
    const irPath = `${schemaDir}/my-proj.contexture.json`;
    await fs.writeFile(irPath, JSON.stringify({ version: '1', types: [] }));

    await scaffoldConvexEmit(config, { fs });

    // Empty IR means no table-flagged objects, so no CRUD files.
    // (The scaffolder only ever runs against an empty IR in v1 — stage 10
    // seeds tables afterwards, and a subsequent save writes the CRUD.)
    expect(fs.exists(`${schemaDir}/convex/Post.ts`)).toBe(false);
  });
});
