/**
 * Sample schema sanity checks.
 *
 * Validates `samples/allotment.contexture.json` against the IR
 * meta-schema + semantic validators so the bundled sample never drifts
 * out of spec with the rest of the editor.
 */
import { load } from '@renderer/model/load';
import { STDLIB_REGISTRY } from '@renderer/services/stdlib-registry';
import { validate } from '@renderer/services/validation';
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
});
