/**
 * `scaffoldConvexEmit` (stage 7) — emits the Convex schema (and
 * per-table CRUD seeds, if the initial IR had any tables) at
 * `packages/contexture/convex/`. The stage uses the shared generated
 * bundle writer so the emitted manifest remains complete.
 */
import { createMemFsAdapter } from '@main/documents/mem-fs-adapter';
import { scaffoldConvexEmit } from '@main/scaffold/convex-emit';
import { beforeEach, describe, expect, it } from 'vitest';

const config = { targetDir: '/work/my-proj', projectName: 'my-proj', apps: ['web'] as const };
const schemaDir = '/work/my-proj/packages/contexture';

let fs: ReturnType<typeof createMemFsAdapter>;

beforeEach(() => {
  fs = createMemFsAdapter();
});

describe('scaffoldConvexEmit', () => {
  it('writes packages/contexture/convex/schema.ts with the contexture-generated banner', async () => {
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

  it('keeps emitted.json complete instead of narrowing it to the Convex schema', async () => {
    const irPath = `${schemaDir}/my-proj.contexture.json`;
    await fs.writeFile(irPath, JSON.stringify({ version: '1', types: [] }));

    await scaffoldConvexEmit(config, { fs });

    const manifest = JSON.parse(await fs.readFile(`${schemaDir}/.contexture/emitted.json`)) as {
      files: Record<string, string>;
    };
    expect(Object.keys(manifest.files).sort()).toEqual(
      [
        `${schemaDir}/my-proj.schema.ts`,
        `${schemaDir}/my-proj.schema.json`,
        `${schemaDir}/index.ts`,
        `${schemaDir}/convex/schema.ts`,
      ].sort(),
    );
  });
});
