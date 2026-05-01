import { describe, expect, it } from 'vitest';
import { emit as emitJsonSchema } from '../src/emit-json-schema';
import { emit as emitZod } from '../src/emit-zod';
import type { Schema } from '../src/ir';

const STDLIB_NAMESPACES = ['common', 'identity', 'place', 'money', 'contact'] as const;

const schemaWithBareStdlibQualifiedRefs: Schema = {
  version: '1',
  types: [
    {
      kind: 'object',
      name: 'Order',
      fields: [
        { name: 'country', type: { kind: 'ref', typeName: 'place.CountryCode' } },
        { name: 'price', type: { kind: 'ref', typeName: 'money.Money' } },
      ],
    },
  ],
};

describe('emit-zod stdlib auto-import', () => {
  it('synthesises an import line for a stdlib-qualified ref with no add_import', () => {
    const out = emitZod(schemaWithBareStdlibQualifiedRefs, '/x.contexture.json', {
      stdlibNamespaces: STDLIB_NAMESPACES,
    });
    expect(out).toContain(`import { CountryCode } from '@contexture/runtime/place';`);
    expect(out).toContain(`import { Money } from '@contexture/runtime/money';`);
    // Field uses the bare imported identifier
    expect(out).toContain('country: CountryCode,');
    expect(out).toContain('price: Money,');
  });

  it('does not duplicate an explicit stdlib import', () => {
    const schema: Schema = {
      ...schemaWithBareStdlibQualifiedRefs,
      imports: [{ kind: 'stdlib', path: '@contexture/place', alias: 'place' }],
    };
    const out = emitZod(schema, '/x.contexture.json', {
      stdlibNamespaces: STDLIB_NAMESPACES,
    });
    const placeImports = out.match(/from '@contexture\/runtime\/place'/g) ?? [];
    expect(placeImports.length).toBe(1);
  });

  it('respects user-renamed aliases for stdlib namespaces', () => {
    const schema: Schema = {
      version: '1',
      imports: [{ kind: 'stdlib', path: '@contexture/place', alias: 'p' }],
      types: [
        {
          kind: 'object',
          name: 'Order',
          fields: [{ name: 'country', type: { kind: 'ref', typeName: 'p.CountryCode' } }],
        },
      ],
    };
    const out = emitZod(schema, '/x.contexture.json', {
      stdlibNamespaces: STDLIB_NAMESPACES,
    });
    expect(out).toContain(`import { CountryCode } from '@contexture/runtime/place';`);
    // The synthetic step must NOT also add an unaliased `place` import
    expect(out).not.toMatch(
      /from '@contexture\/runtime\/place'.*\n.*from '@contexture\/runtime\/place'/,
    );
  });

  it('does not synthesise imports for non-stdlib qualified refs', () => {
    const schema: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Order',
          fields: [{ name: 'foo', type: { kind: 'ref', typeName: 'unknownNs.Foo' } }],
        },
      ],
    };
    const out = emitZod(schema, '/x.contexture.json', {
      stdlibNamespaces: STDLIB_NAMESPACES,
    });
    expect(out).not.toContain('@contexture/runtime/unknownNs');
  });
});

describe('emit-json-schema stdlib auto-import', () => {
  it('emits a runtime $ref for a stdlib-qualified ref with no add_import', () => {
    const out = emitJsonSchema(schemaWithBareStdlibQualifiedRefs, undefined, undefined, {
      stdlibNamespaces: STDLIB_NAMESPACES,
    });
    expect(out).toMatchObject({
      $defs: {
        Order: {
          properties: {
            country: { $ref: '@contexture/runtime/place#/$defs/CountryCode' },
            price: { $ref: '@contexture/runtime/money#/$defs/Money' },
          },
        },
      },
    });
  });

  it('still emits relative ./alias.schema.json for relative imports', () => {
    const schema: Schema = {
      version: '1',
      imports: [{ kind: 'relative', path: './shared.contexture.json', alias: 'shared' }],
      types: [
        {
          kind: 'object',
          name: 'Order',
          fields: [{ name: 'tag', type: { kind: 'ref', typeName: 'shared.Tag' } }],
        },
      ],
    };
    const out = emitJsonSchema(schema, undefined, undefined, {
      stdlibNamespaces: STDLIB_NAMESPACES,
    });
    expect(out).toMatchObject({
      $defs: {
        Order: {
          properties: {
            tag: { $ref: './shared.schema.json#/$defs/Tag' },
          },
        },
      },
    });
  });
});
