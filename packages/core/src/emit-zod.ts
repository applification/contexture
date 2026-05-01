/**
 * Pure IR → Zod TypeScript source emitter.
 *
 * `emit(schema, sourcePath)` returns TypeScript source that re-creates the IR
 * as a set of Zod schemas. The output starts with a stable header that marks
 * the file as generated and names the source, so downstream tooling (and
 * humans) know not to edit it by hand.
 *
 * Import handling follows the plan's uniform mechanism:
 *   - Stdlib aliases (`@contexture/<ns>`) become runtime imports from
 *     `@contexture/runtime/<ns>`, importing only the names actually used.
 *     If `options.stdlibNamespaces` is provided, qualified refs whose
 *     namespace matches a known stdlib namespace synthesise an import even
 *     when `schema.imports` doesn't declare one — this matches the
 *     validator, which treats stdlib namespaces as ambient.
 *   - Relative aliases map to `./<alias>.schema` (the emitted sibling of the
 *     referenced `.contexture.json`), importing only the names used.
 *   - Local refs emit as bare identifiers.
 *   - `raw` TypeDefs with an `import` hint emit an import from that module
 *     and re-export the name; otherwise the `zod` expression is inlined.
 *
 * Rule 7 of the semantic validator (`services/validation.ts`) will ultimately
 * sandbox-eval this output to catch emit regressions.
 */
import type { FieldDef, FieldType, ImportDecl, Schema, TypeDef } from './ir';

export interface EmitOptions {
  /** Namespaces (e.g. `'place'`, `'money'`) treated as ambient stdlib. */
  stdlibNamespaces?: readonly string[];
}

export function emit(schema: Schema, sourcePath: string, options: EmitOptions = {}): string {
  const ctx = buildContext(schema, options);
  const header = `// @contexture-generated — do not edit by hand. Regenerated on every IR save. Source: ${sourcePath}\n`;
  const zodImport = `import { z } from 'zod';\n`;
  const externalImports = renderExternalImports(ctx);
  const body = schema.types.map((t) => emitTypeDef(t, ctx)).join('');
  return header + zodImport + externalImports + body;
}

interface EmitContext {
  /** alias → ImportDecl (for resolving qualified refs). */
  aliases: Map<string, ImportDecl>;
  /**
   * Ordered list of imports to render. Includes `schema.imports` plus any
   * synthetic stdlib imports derived from qualified refs whose namespace
   * matches `options.stdlibNamespaces`.
   */
  imports: ImportDecl[];
  /** alias → set of imported names that were actually referenced. */
  usedByAlias: Map<string, Set<string>>;
  /** `raw` types with an external import hint, keyed by name. */
  rawExternal: Map<string, { from: string; name: string }>;
}

function buildContext(schema: Schema, options: EmitOptions): EmitContext {
  const aliases = new Map<string, ImportDecl>();
  const imports: ImportDecl[] = [];
  (schema.imports ?? []).forEach((imp) => {
    aliases.set(imp.alias, imp);
    imports.push(imp);
  });

  const stdlibNs = new Set(options.stdlibNamespaces ?? []);
  const usedByAlias = new Map<string, Set<string>>();
  const rawExternal = new Map<string, { from: string; name: string }>();

  const walkField = (t: FieldType) => {
    if (t.kind === 'ref') {
      const dot = t.typeName.indexOf('.');
      if (dot !== -1) {
        const alias = t.typeName.slice(0, dot);
        const name = t.typeName.slice(dot + 1);
        if (!aliases.has(alias) && stdlibNs.has(alias)) {
          const synthetic: ImportDecl = {
            kind: 'stdlib',
            path: `@contexture/${alias}`,
            alias,
          };
          aliases.set(alias, synthetic);
          imports.push(synthetic);
        }
        if (aliases.has(alias)) {
          const set = usedByAlias.get(alias) ?? new Set<string>();
          set.add(name);
          usedByAlias.set(alias, set);
        }
      }
    } else if (t.kind === 'array') {
      walkField(t.element);
    }
  };

  schema.types.forEach((type) => {
    if (type.kind === 'object') {
      type.fields.forEach((f) => {
        walkField(f.type);
      });
    } else if (type.kind === 'raw' && type.import) {
      rawExternal.set(type.name, type.import);
    }
  });

  return { aliases, imports, usedByAlias, rawExternal };
}

function renderExternalImports(ctx: EmitContext): string {
  const lines: string[] = [];

  ctx.imports.forEach((imp) => {
    const used = ctx.usedByAlias.get(imp.alias);
    if (!used || used.size === 0) return;
    const names = [...used].sort().join(', ');
    const module = moduleForImport(imp);
    lines.push(`import { ${names} } from '${module}';`);
  });

  ctx.rawExternal.forEach((imp) => {
    lines.push(`import { ${imp.name} } from '${imp.from}';`);
  });

  return lines.length ? `${lines.join('\n')}\n` : '';
}

function moduleForImport(imp: ImportDecl): string {
  if (imp.kind === 'stdlib') {
    // `@contexture/common` → `@contexture/runtime/common`
    const ns = imp.path.slice('@contexture/'.length);
    return `@contexture/runtime/${ns}`;
  }
  // Relative: emit as `./<alias>.schema` (sibling of the original file).
  return `./${imp.alias}.schema`;
}

function emitTypeDef(type: TypeDef, ctx: EmitContext): string {
  const infer = `export type ${type.name} = z.infer<typeof ${type.name}>;\n`;

  if (type.kind === 'object') {
    const fields = type.fields.map((f) => `  ${f.name}: ${emitField(f, ctx)},\n`).join('');
    const body = fields ? `{\n${fields}}` : `{}`;
    return `\nexport const ${type.name} = z.object(${body});\n${infer}`;
  }

  if (type.kind === 'enum') {
    const values = type.values.map((v) => `'${v.value}'`).join(', ');
    return `\nexport const ${type.name} = z.enum([${values}]);\n${infer}`;
  }

  if (type.kind === 'discriminatedUnion') {
    const variants = type.variants.join(', ');
    return (
      `\nexport const ${type.name} = z.discriminatedUnion('${type.discriminator}', [${variants}]);\n` +
      infer
    );
  }

  // raw
  if (type.import) {
    // External: re-export the imported symbol under the IR name and mirror
    // the inferred TS type for consumer ergonomics.
    return `\nexport { ${type.name} };\n${infer}`;
  }
  return `\nexport const ${type.name} = ${type.zod};\n${infer}`;
}

function emitField(field: FieldDef, ctx: EmitContext): string {
  let s = emitFieldType(field.type, ctx);
  if (field.optional) s += `.optional()`;
  if (field.nullable) s += `.nullable()`;
  if (field.default !== undefined) s += `.default(${renderLiteral(field.default)})`;
  return s;
}

function renderLiteral(value: unknown): string {
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return JSON.stringify(value);
}

function emitFieldType(t: FieldType, ctx: EmitContext): string {
  switch (t.kind) {
    case 'string': {
      let s = `z.string()`;
      if (t.format === 'email') s += `.email()`;
      else if (t.format === 'url') s += `.url()`;
      else if (t.format === 'uuid') s += `.uuid()`;
      else if (t.format === 'datetime') s += `.datetime()`;
      if (t.min !== undefined) s += `.min(${t.min})`;
      if (t.max !== undefined) s += `.max(${t.max})`;
      if (t.regex !== undefined) s += `.regex(/${t.regex}/)`;
      return s;
    }
    case 'number': {
      let s = `z.number()`;
      if (t.int) s += `.int()`;
      if (t.min !== undefined) s += `.min(${t.min})`;
      if (t.max !== undefined) s += `.max(${t.max})`;
      return s;
    }
    case 'boolean':
      return `z.boolean()`;
    case 'date':
      return `z.date()`;
    case 'literal':
      return `z.literal(${renderLiteral(t.value)})`;
    case 'ref': {
      const dot = t.typeName.indexOf('.');
      if (dot === -1) return t.typeName;
      // Qualified: render as the bare imported name (import line already emitted).
      return t.typeName.slice(dot + 1);
    }
    case 'array': {
      let s = `z.array(${emitFieldType(t.element, ctx)})`;
      if (t.min !== undefined) s += `.min(${t.min})`;
      if (t.max !== undefined) s += `.max(${t.max})`;
      return s;
    }
  }
}
