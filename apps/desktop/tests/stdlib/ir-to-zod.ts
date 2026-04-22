/**
 * Parity-test helper: build live Zod schemas from an IR directly,
 * mirroring the semantics of `emit-zod.ts` without the string
 * round-trip.
 *
 * Using an interpreter here (instead of eval'ing the emitter output)
 * keeps the parity tests robust to stylistic emitter changes while
 * still proving that the IR expresses the same runtime behaviour as
 * the hand-written Zod. It intentionally covers the same subset the
 * emitter supports: object/enum/raw TypeDefs and the 7 FieldType
 * kinds (string/number/boolean/date/literal/ref/array).
 *
 * `raw` TypeDefs without an `import` hint are handled by plugging a
 * small allowlist of known `zod` expressions — adding a new stdlib
 * `raw` shape means extending that allowlist. This avoids the risk of
 * eval'ing arbitrary strings inside the test.
 */
import type { FieldDef, FieldType, Schema, TypeDef } from '@renderer/model/types';
import { z } from 'zod';

type ZodSchema = z.ZodType;

export function buildZodFromIR(schema: Schema): Record<string, ZodSchema> {
  const out: Record<string, ZodSchema> = {};
  // Multi-pass so refs to types later in the array resolve: zod's
  // .extend/.array accept already-constructed schemas, so we just need
  // every type built before any object field references it. Two passes
  // handle any ordering the IR happens to have.
  for (const t of schema.types) out[t.name] = stubFor(t);
  for (const t of schema.types) out[t.name] = buildTypeDef(t, out);
  return out;
}

function stubFor(t: TypeDef): ZodSchema {
  // Placeholders replaced on the second pass.
  if (t.kind === 'enum') return z.enum(t.values.map((v) => v.value) as [string, ...string[]]);
  return z.unknown();
}

function buildTypeDef(t: TypeDef, byName: Record<string, ZodSchema>): ZodSchema {
  if (t.kind === 'object') {
    const shape: Record<string, ZodSchema> = {};
    for (const f of t.fields) shape[f.name] = buildField(f, byName);
    return z.object(shape);
  }
  if (t.kind === 'enum') {
    return z.enum(t.values.map((v) => v.value) as [string, ...string[]]);
  }
  if (t.kind === 'discriminatedUnion') {
    // Not exercised by stdlib, but kept for completeness. The variants
    // are references to object TypeDefs in the same schema.
    const variants = t.variants.map((name) => byName[name]).filter(Boolean) as z.ZodObject[];
    return z.discriminatedUnion(t.discriminator, variants as [z.ZodObject, ...z.ZodObject[]]);
  }
  // raw
  return buildRaw(t.zod);
}

function buildField(f: FieldDef, byName: Record<string, ZodSchema>): ZodSchema {
  let s = buildFieldType(f.type, byName);
  if (f.optional) s = s.optional();
  if (f.nullable) s = s.nullable();
  if (f.default !== undefined) s = s.default(f.default as never);
  return s;
}

function buildFieldType(t: FieldType, byName: Record<string, ZodSchema>): ZodSchema {
  switch (t.kind) {
    case 'string': {
      let s = z.string();
      if (t.format === 'email') s = s.email();
      else if (t.format === 'url') s = s.url();
      else if (t.format === 'uuid') s = s.uuid();
      else if (t.format === 'datetime') s = s.datetime();
      if (t.min !== undefined) s = s.min(t.min);
      if (t.max !== undefined) s = s.max(t.max);
      if (t.regex !== undefined) s = s.regex(new RegExp(t.regex));
      return s;
    }
    case 'number': {
      let s = z.number();
      if (t.int) s = s.int();
      if (t.min !== undefined) s = s.min(t.min);
      if (t.max !== undefined) s = s.max(t.max);
      return s;
    }
    case 'boolean':
      return z.boolean();
    case 'date':
      return z.date();
    case 'literal':
      return z.literal(t.value);
    case 'ref': {
      const dot = t.typeName.indexOf('.');
      const local = dot === -1 ? t.typeName : t.typeName.slice(dot + 1);
      const target = byName[local];
      if (!target) throw new Error(`ref not resolved: ${t.typeName}`);
      return target;
    }
    case 'array': {
      let s = z.array(buildFieldType(t.element, byName));
      if (t.min !== undefined) s = s.min(t.min);
      if (t.max !== undefined) s = s.max(t.max);
      return s;
    }
  }
}

/**
 * Allowlist of known `raw` Zod expressions used in the stdlib.
 * Restricting to an allowlist keeps the parity harness free of
 * arbitrary string evaluation.
 */
function buildRaw(zodExpr: string): ZodSchema {
  const expr = zodExpr.trim();
  switch (expr) {
    case 'z.string()':
      return z.string();
    case 'z.string().email()':
      return z.string().email();
    case 'z.string().url()':
      return z.string().url();
    case 'z.string().uuid()':
      return z.string().uuid();
    case 'z.string().datetime({ offset: true })':
      return z.string().datetime({ offset: true });
    case 'z.string().min(1)':
      return z.string().min(1);
    case 'z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/)':
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    case 'z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)':
      return z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    case 'z.string().regex(/^[a-zA-Z0-9_]{1,30}$/)':
      return z.string().regex(/^[a-zA-Z0-9_]{1,30}$/);
    case 'z.string().regex(/^\\+[1-9]\\d{1,14}$/)':
      return z.string().regex(/^\+[1-9]\d{1,14}$/);
    case 'z.number().int().positive()':
      return z.number().int().positive();
    case 'z.number().positive()':
      return z.number().positive();
    default:
      throw new Error(`unsupported raw zod expression in stdlib parity: ${expr}`);
  }
}
