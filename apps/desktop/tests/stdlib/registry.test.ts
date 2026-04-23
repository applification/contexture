/**
 * Stdlib registry wiring.
 *
 * Proves the singleton built from `@contexture/stdlib/registry` exposes
 * every namespace with the right type set, and that `validate()` treats
 * `common.Email`-style refs as resolved without requiring an explicit
 * `add_import` in the IR.
 */
import type { Schema } from '@renderer/model/ir';
import { buildStdlibRegistry, STDLIB_REGISTRY } from '@renderer/services/stdlib-registry';
import { validate } from '@renderer/services/validation';
import { describe, expect, it } from 'vitest';

describe('stdlib registry', () => {
  it('enumerates all five namespaces', () => {
    expect(STDLIB_REGISTRY.namespaces).toEqual(['common', 'identity', 'place', 'money', 'contact']);
  });

  it('resolves a known stdlib type', () => {
    expect(STDLIB_REGISTRY.hasType('common', 'Email')).toBe(true);
    expect(STDLIB_REGISTRY.hasType('place', 'CountryCode')).toBe(true);
    expect(STDLIB_REGISTRY.hasType('money', 'Money')).toBe(true);
  });

  it('rejects an unknown stdlib type', () => {
    expect(STDLIB_REGISTRY.hasType('common', 'NoSuch')).toBe(false);
    expect(STDLIB_REGISTRY.hasType('nope', 'Email')).toBe(false);
  });

  it('buildStdlibRegistry() returns a fresh instance', () => {
    const a = buildStdlibRegistry();
    const b = buildStdlibRegistry();
    // Independent instances, same data.
    expect(a).not.toBe(b);
    expect(a.namespaces).toEqual(b.namespaces);
  });
});

describe('validate() with stdlib registry', () => {
  const schemaWithStdlibRef: Schema = {
    version: '1',
    types: [
      {
        kind: 'object',
        name: 'User',
        fields: [
          { name: 'email', type: { kind: 'ref', typeName: 'common.Email' } },
          { name: 'country', type: { kind: 'ref', typeName: 'place.CountryCode' } },
        ],
      },
    ],
  };

  it('without stdlib: qualified refs without imports fail to resolve', () => {
    const errors = validate(schemaWithStdlibRef);
    // Legacy behaviour: unrecognised alias → unresolved_ref for both.
    // (Both legacy and new code require the alias to be known somehow —
    // without a registry and without imports it's nowhere.)
    const resolveErrors = errors.filter((e) => e.code === 'unresolved_ref');
    expect(resolveErrors).toHaveLength(2);
  });

  it('with stdlib: resolves common.Email + place.CountryCode', () => {
    const errors = validate(schemaWithStdlibRef, { stdlib: STDLIB_REGISTRY });
    expect(errors.filter((e) => e.code === 'unresolved_ref')).toHaveLength(0);
  });

  it('with stdlib: unknown qualified name still fails', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'X',
          fields: [{ name: 'bogus', type: { kind: 'ref', typeName: 'common.NoSuch' } }],
        },
      ],
    };
    const errors = validate(schema, { stdlib: STDLIB_REGISTRY });
    expect(errors.filter((e) => e.code === 'unresolved_ref')).toEqual([
      expect.objectContaining({ path: 'types.0.fields.0.type' }),
    ]);
  });
});
