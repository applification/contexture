/**
 * Sample schema sanity checks.
 *
 * Validates `samples/allotment.contexture.json` against the IR
 * meta-schema + semantic validators so the bundled sample never drifts
 * out of spec with the rest of the editor.
 */
import { emitGeneratedTarget } from '@contexture/core/generated-targets';
import { load } from '@contexture/core/load';
import { validate } from '@renderer/services/validation';
import { STDLIB_REGISTRY } from '@shared/stdlib-registry';
import { describe, expect, it } from 'vitest';
import allotment from '../../src/renderer/src/samples/allotment.contexture.json' with {
  type: 'json',
};

describe('samples/allotment', () => {
  it('parses via the loader', () => {
    const result = load(JSON.stringify(allotment));
    expect(result.warnings).toEqual([]);
    expect(result.schema.types.length).toBeGreaterThan(0);
  });

  it('passes all semantic rules with stdlib resolution', () => {
    const { schema } = load(JSON.stringify(allotment));
    const errors = validate(schema, { stdlib: STDLIB_REGISTRY });
    expect(errors).toEqual([]);
  });

  it('demonstrates Convex tables and indexes', () => {
    const { schema } = load(JSON.stringify(allotment));
    const convex = emitGeneratedTarget(schema, 'convex', 'allotment.contexture.json', {});

    expect(convex).toContain('sowings: defineTable');
    expect(convex).toContain('.index("by_crop_and_season", ["crop", "season"])');
  });
});
