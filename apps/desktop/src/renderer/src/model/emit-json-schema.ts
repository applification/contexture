/**
 * Pure IR → JSON Schema emitter.
 *
 * `emit(schema, rootTypeName?)` returns a Draft 2020-12 JSON Schema document.
 *
 *   - No `rootTypeName`: a document of the form `{ $schema, $defs: {...} }`
 *     where every IR type appears as a definition. Used for the generated
 *     `.schema.json` sidecar artifact.
 *   - `rootTypeName` given: the returned document is the JSON Schema for that
 *     type inlined at the top level, with the remaining types carried in
 *     `$defs`. Used to build tool input schemas (the Eval panel's
 *     `emit_sample` tool takes a schema object directly).
 *
 * Ref handling mirrors the Zod emitter's uniform import mechanism:
 *   - Local refs → `{ $ref: '#/$defs/<Name>' }`
 *   - Stdlib `alias.Name` with a matching import → points at the runtime's
 *     sibling schema: `{ $ref: '@contexture/runtime/<ns>#/$defs/<Name>' }`
 *   - Relative `alias.Name` → `{ $ref: './<alias>.schema.json#/$defs/<Name>' }`
 *
 * The emitter is intentionally total and pure; semantic concerns (unresolved
 * refs, duplicate names, …) belong to `services/validation.ts`.
 */
import type { FieldDef, FieldType, ImportDecl, Schema, TypeDef } from './ir';

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';

export function emit(schema: Schema, rootTypeName?: string): object {
  const aliases = new Map<string, ImportDecl>();
  (schema.imports ?? []).forEach((imp) => {
    aliases.set(imp.alias, imp);
  });

  const defs: Record<string, object> = {};
  for (const type of schema.types) {
    if (type.name === rootTypeName) continue;
    defs[type.name] = emitTypeDef(type, aliases);
  }

  if (rootTypeName) {
    const root = schema.types.find((t) => t.name === rootTypeName);
    if (!root) {
      throw new Error(`Root type "${rootTypeName}" not found in schema.`);
    }
    const rootSchema = emitTypeDef(root, aliases) as Record<string, unknown>;
    return {
      $schema: DRAFT,
      ...rootSchema,
      ...(Object.keys(defs).length > 0 ? { $defs: defs } : {}),
    };
  }

  return { $schema: DRAFT, $defs: defs };
}

function emitTypeDef(type: TypeDef, aliases: Map<string, ImportDecl>): object {
  switch (type.kind) {
    case 'object': {
      const properties: Record<string, object> = {};
      const required: string[] = [];
      for (const field of type.fields) {
        properties[field.name] = emitField(field, aliases);
        if (!field.optional) required.push(field.name);
      }
      return {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      };
    }
    case 'enum':
      return { type: 'string', enum: type.values.map((v) => v.value) };
    case 'discriminatedUnion':
      return {
        oneOf: type.variants.map((v) => ({ $ref: `#/$defs/${v}` })),
        discriminator: { propertyName: type.discriminator },
      };
    case 'raw':
      return type.jsonSchema as object;
  }
}

function emitField(field: FieldDef, aliases: Map<string, ImportDecl>): object {
  let body = emitFieldType(field.type, aliases) as Record<string, unknown>;
  if (field.nullable) {
    const current = body.type;
    if (typeof current === 'string') {
      body = { ...body, type: [current, 'null'] };
    } else if (Array.isArray(current)) {
      body = { ...body, type: [...current, 'null'] };
    } else {
      // No plain `type` (e.g. const, oneOf, $ref): represent null via anyOf.
      body = { anyOf: [body, { type: 'null' }] };
    }
  }
  if (field.default !== undefined) {
    body = { ...body, default: field.default };
  }
  return body;
}

function emitFieldType(t: FieldType, aliases: Map<string, ImportDecl>): object {
  switch (t.kind) {
    case 'string': {
      const out: Record<string, unknown> = { type: 'string' };
      if (t.format === 'email') out.format = 'email';
      else if (t.format === 'url') out.format = 'uri';
      else if (t.format === 'uuid') out.format = 'uuid';
      else if (t.format === 'datetime') out.format = 'date-time';
      if (t.min !== undefined) out.minLength = t.min;
      if (t.max !== undefined) out.maxLength = t.max;
      if (t.regex !== undefined) out.pattern = t.regex;
      return out;
    }
    case 'number': {
      const out: Record<string, unknown> = { type: t.int ? 'integer' : 'number' };
      if (t.min !== undefined) out.minimum = t.min;
      if (t.max !== undefined) out.maximum = t.max;
      return out;
    }
    case 'boolean':
      return { type: 'boolean' };
    case 'date':
      return { type: 'string', format: 'date-time' };
    case 'literal':
      return { const: t.value };
    case 'ref': {
      const dot = t.typeName.indexOf('.');
      if (dot === -1) return { $ref: `#/$defs/${t.typeName}` };
      const alias = t.typeName.slice(0, dot);
      const name = t.typeName.slice(dot + 1);
      const imp = aliases.get(alias);
      if (!imp) {
        // Unresolved qualified ref — validator reports it; emit a best-effort
        // external $ref so the shape stays well-formed.
        return { $ref: `${alias}#/$defs/${name}` };
      }
      if (imp.kind === 'stdlib') {
        const ns = imp.path.slice('@contexture/'.length);
        return { $ref: `@contexture/runtime/${ns}#/$defs/${name}` };
      }
      return { $ref: `./${imp.alias}.schema.json#/$defs/${name}` };
    }
    case 'array': {
      const out: Record<string, unknown> = {
        type: 'array',
        items: emitFieldType(t.element, aliases),
      };
      if (t.min !== undefined) out.minItems = t.min;
      if (t.max !== undefined) out.maxItems = t.max;
      return out;
    }
  }
}
