/**
 * Zod meta-schema for the Contexture IR (v1).
 *
 * `IRSchema.parse(x)` returns a typed `Schema` or throws `ZodError` with
 * path-addressable issues. Used by the loader, `replace_schema`, and the
 * ops applier to gate any input before it reaches the live store.
 *
 * Spec and TS types: `./types.ts` and `plans/pivot.md` §IR shape (v1).
 */
import { z } from 'zod';
import type { FieldType, Schema } from './types';

const StringFieldTypeSchema = z.object({
  kind: z.literal('string'),
  min: z.number().int().nonnegative().optional(),
  max: z.number().int().nonnegative().optional(),
  regex: z.string().optional(),
  format: z.enum(['email', 'url', 'uuid', 'datetime']).optional(),
});

const NumberFieldTypeSchema = z.object({
  kind: z.literal('number'),
  min: z.number().optional(),
  max: z.number().optional(),
  int: z.boolean().optional(),
});

const BooleanFieldTypeSchema = z.object({ kind: z.literal('boolean') });
const DateFieldTypeSchema = z.object({ kind: z.literal('date') });

const LiteralFieldTypeSchema = z.object({
  kind: z.literal('literal'),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const RefFieldTypeSchema = z.object({
  kind: z.literal('ref'),
  typeName: z.string().min(1),
});

const FieldTypeSchema: z.ZodType<FieldType> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    StringFieldTypeSchema,
    NumberFieldTypeSchema,
    BooleanFieldTypeSchema,
    DateFieldTypeSchema,
    LiteralFieldTypeSchema,
    RefFieldTypeSchema,
    ArrayFieldTypeSchema,
  ]),
);

const ArrayFieldTypeSchema = z.object({
  kind: z.literal('array'),
  element: FieldTypeSchema,
  min: z.number().int().nonnegative().optional(),
  max: z.number().int().nonnegative().optional(),
});

const FieldDefSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: FieldTypeSchema,
  optional: z.boolean().optional(),
  nullable: z.boolean().optional(),
  default: z.unknown().optional(),
});

const ObjectTypeDefSchema = z.object({
  kind: z.literal('object'),
  name: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(FieldDefSchema),
});

const EnumTypeDefSchema = z.object({
  kind: z.literal('enum'),
  name: z.string().min(1),
  description: z.string().optional(),
  values: z.array(
    z.object({
      value: z.string().min(1),
      description: z.string().optional(),
    }),
  ),
});

const DiscriminatedUnionTypeDefSchema = z.object({
  kind: z.literal('discriminatedUnion'),
  name: z.string().min(1),
  description: z.string().optional(),
  discriminator: z.string().min(1),
  variants: z.array(z.string().min(1)),
});

const RawTypeDefSchema = z.object({
  kind: z.literal('raw'),
  name: z.string().min(1),
  description: z.string().optional(),
  zod: z.string().min(1),
  jsonSchema: z.record(z.string(), z.unknown()),
  import: z
    .object({
      from: z.string().min(1),
      name: z.string().min(1),
    })
    .optional(),
});

const TypeDefSchema = z.discriminatedUnion('kind', [
  ObjectTypeDefSchema,
  EnumTypeDefSchema,
  DiscriminatedUnionTypeDefSchema,
  RawTypeDefSchema,
]);

const StdlibImportSchema = z.object({
  kind: z.literal('stdlib'),
  path: z.string().regex(/^@contexture\/.+/, 'stdlib imports must start with "@contexture/"'),
  alias: z.string().min(1),
});

const RelativeImportSchema = z.object({
  kind: z.literal('relative'),
  path: z.string().min(1),
  alias: z.string().min(1),
});

const ImportDeclSchema = z.discriminatedUnion('kind', [StdlibImportSchema, RelativeImportSchema]);

const MetadataSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
});

// The only structural gap between the inferred Zod output and `Schema` is the
// template-literal path on `ImportDecl.kind === 'stdlib'`: Zod reports it as
// `string`, while `Schema` narrows it to `@contexture/${string}`. The runtime
// regex enforces the same invariant, so the cast is sound.
// Raw object schema — exposes `.shape` for callers that need to pick
// a specific field's schema (`src/main/ops/index.ts` narrows to
// `types.element` and `imports.element`). The public `IRSchema` is cast
// to the hand-written `Schema` so `parse()` returns the right type.
export const IRSchemaObject = z.object({
  version: z.literal('1'),
  types: z.array(TypeDefSchema),
  imports: z.array(ImportDeclSchema).optional(),
  metadata: MetadataSchema.optional(),
});

export const IRSchema = IRSchemaObject as unknown as z.ZodType<Schema>;
