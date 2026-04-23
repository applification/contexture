/**
 * IR loader and serializer.
 *
 * `load(raw)` parses the JSON text of a `.contexture.json` file, walks the
 * migration chain (if any apply), validates with the meta-schema, and
 * returns the live typed `Schema`. All applied migrations contribute a
 * warning string so the UI can surface "we upgraded this file" notices.
 *
 * `save(schema)` is the canonical pretty-printed counterpart, so
 * `load(save(x))` round-trips structurally.
 */

import type { Schema } from './ir';
import { IRSchema } from './ir';
import { type Migration, migrations, runMigrations } from './migrations';

export interface LoadResult {
  schema: Schema;
  warnings: string[];
}

export function load(raw: string, chain: readonly Migration[] = migrations): LoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON: ${detail}`);
  }
  const { ir, warnings } = runMigrations(parsed, chain);
  const schema = IRSchema.parse(ir);
  return { schema, warnings };
}

export function save(schema: Schema): string {
  return JSON.stringify(schema, null, 2);
}
