/**
 * Pure emitter for `packages/schema/index.ts` — the workspace re-export that
 * lets `apps/*` import schemas as `import { Post } from '@<project>/schema'`
 * without caring which sibling `.schema.ts` module a name lives in.
 *
 * With a single IR per project the output is trivial: one re-export from
 * the sibling `<base>.schema` module. When Contexture grows multi-IR
 * support the same function extends to emitting one `export *` per base.
 */

const HEADER = '// @contexture-generated — do not edit by hand. Regenerated on every IR save.\n';

export function emit(baseName: string): string {
  return `${HEADER}export * from './${baseName}.schema';\n`;
}
