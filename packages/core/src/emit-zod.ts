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
 *   - Local refs to value-object types emit as bare identifiers.
 *   - Local refs to table types emit as branded string ids, matching the
 *     stored Convex document shape.
 *   - `raw` TypeDefs with an `import` hint emit an import from that module
 *     and re-export the name; otherwise the `zod` expression is inlined.
 *
 * Rule 7 of the semantic validator (`services/validation.ts`) will ultimately
 * sandbox-eval this output to catch emit regressions.
 */
import type { FieldDef, FieldType, ImportDecl, ObjectInvariant, Schema, TypeDef } from './ir';

export interface EmitOptions {
  /** Namespaces (e.g. `'place'`, `'money'`) treated as ambient stdlib. */
  stdlibNamespaces?: readonly string[];
  /** Override module specifiers for stdlib namespace imports. */
  stdlibModuleForNamespace?: (namespace: string) => string | null | undefined;
}

export function emit(schema: Schema, sourcePath: string, options: EmitOptions = {}): string {
  const ctx = buildContext(schema, options);
  const header = `// @contexture-generated — do not edit by hand. Regenerated on every IR save. Source: ${sourcePath}\n`;
  const zodImport = `import { z } from 'zod';\n`;
  const externalImports = renderExternalImports(ctx);
  const body = sortTypeDefs(schema.types, ctx)
    .map((t) => emitTypeDef(t, ctx))
    .join('');
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
  /** Local types by name, used to order declarations before consumers. */
  types: Map<string, TypeDef>;
  stdlibModuleForNamespace?: (namespace: string) => string | null | undefined;
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
  const types = new Map(schema.types.map((type) => [type.name, type]));

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

  return {
    aliases,
    imports,
    usedByAlias,
    rawExternal,
    types,
    stdlibModuleForNamespace: options.stdlibModuleForNamespace,
  };
}

function renderExternalImports(ctx: EmitContext): string {
  const lines: string[] = [];

  ctx.imports.forEach((imp) => {
    const used = ctx.usedByAlias.get(imp.alias);
    if (!used || used.size === 0) return;
    const names = [...used].sort().join(', ');
    const module = moduleForImport(imp, ctx);
    lines.push(`import { ${names} } from '${module}';`);
  });

  ctx.rawExternal.forEach((imp) => {
    lines.push(`import { ${imp.name} } from '${imp.from}';`);
  });

  return lines.length ? `${lines.join('\n')}\n` : '';
}

function moduleForImport(imp: ImportDecl, ctx: EmitContext): string {
  if (imp.kind === 'stdlib') {
    // `@contexture/common` → `@contexture/runtime/common`
    const ns = imp.path.slice('@contexture/'.length);
    const localModule = ctx.stdlibModuleForNamespace?.(ns);
    if (localModule) return localModule;
    return `@contexture/runtime/${ns}`;
  }
  // Relative: emit as `./<alias>.schema` (sibling of the original file).
  return `./${imp.alias}.schema`;
}

function emitTypeDef(type: TypeDef, ctx: EmitContext): string {
  const infer = `export type ${type.name} = z.infer<typeof ${type.name}>;\n`;

  if (type.kind === 'object') {
    const fields = effectiveFields(type, ctx)
      .map((f) => `  ${f.name}: ${emitField(f, ctx)},\n`)
      .join('');
    const body = fields ? `{\n${fields}}` : `{}`;
    const base = `z.object(${body})`;
    return `\nexport const ${type.name} = ${emitInvariantRefinements(base, type)};\n${infer}`;
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

function emitInvariantRefinements(
  base: string,
  type: Extract<TypeDef, { kind: 'object' }>,
): string {
  const invariants = type.invariants ?? [];
  if (invariants.length === 0) return base;
  const checks = invariants.map((invariant) => emitInvariantCheck(invariant)).join('\n');
  return `${base}.superRefine((value, ctx) => {\n${checks}\n})`;
}

function emitInvariantCheck(invariant: ObjectInvariant): string {
  switch (invariant.kind) {
    case 'requiresWhen': {
      const lines: string[] = [];
      lines.push(
        `  if (value.${invariant.when.field} === ${renderLiteral(invariant.when.equals)}) {`,
      );
      for (const field of invariant.requires ?? []) {
        lines.push(
          `    if (value.${field} === undefined || value.${field} === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['${field}'], message: 'Invariant "${invariant.name}" requires "${field}".' });`,
        );
      }
      for (const field of invariant.forbids ?? []) {
        lines.push(
          `    if (value.${field} !== undefined && value.${field} !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['${field}'], message: 'Invariant "${invariant.name}" forbids "${field}".' });`,
        );
      }
      lines.push('  }');
      return lines.join('\n');
    }
    case 'exactlyOneOf': {
      const fields = invariant.fields.map((field) => `'${field}'`).join(', ');
      return `  if ([${fields}].filter((field) => (value as Record<string, unknown>)[field] !== undefined && (value as Record<string, unknown>)[field] !== null).length !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [], message: 'Invariant "${invariant.name}" requires exactly one of: ${invariant.fields.join(', ')}.' });`;
    }
    case 'mutuallyExclusive': {
      const fields = invariant.fields.map((field) => `'${field}'`).join(', ');
      return `  if ([${fields}].filter((field) => (value as Record<string, unknown>)[field] !== undefined && (value as Record<string, unknown>)[field] !== null).length > 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [], message: 'Invariant "${invariant.name}" allows at most one of: ${invariant.fields.join(', ')}.' });`;
    }
    case 'fieldPredicate':
      return emitFieldPredicateCheck(invariant);
    case 'uniqueInArray':
      return emitUniqueInArrayCheck(invariant);
  }
}

function emitFieldPredicateCheck(
  invariant: Extract<ObjectInvariant, { kind: 'fieldPredicate' }>,
): string {
  if (invariant.predicate.kind === 'nonEmptyTrimmedString') {
    return `  if (typeof value.${invariant.field} !== 'string' || value.${invariant.field}.trim().length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['${invariant.field}'], message: 'Invariant "${invariant.name}" requires a non-empty trimmed string.' });`;
  }
  const weekday = weekdayIndex(invariant.predicate.value);
  return [
    `  {`,
    `    const candidate = value.${invariant.field};`,
    `    const date = candidate instanceof Date ? candidate : new Date(candidate);`,
    `    if (Number.isNaN(date.getTime()) || date.getUTCDay() !== ${weekday}) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['${invariant.field}'], message: 'Invariant "${invariant.name}" requires ${invariant.field} to fall on ${invariant.predicate.value}.' });`,
    `  }`,
  ].join('\n');
}

function emitUniqueInArrayCheck(
  invariant: Extract<ObjectInvariant, { kind: 'uniqueInArray' }>,
): string {
  const lines: string[] = [];
  const where = invariant.where
    ? `item?.${invariant.where.field} === ${renderLiteral(invariant.where.equals)}`
    : 'true';
  lines.push(`  {`);
  lines.push(`    const seen = new Set();`);
  lines.push(`    for (let index = 0; index < value.${invariant.arrayField}.length; index += 1) {`);
  lines.push(`      const item = value.${invariant.arrayField}[index] as Record<string, unknown>;`);
  lines.push(`      if (!(${where})) continue;`);
  lines.push(`      const key = item?.${invariant.uniqueField};`);
  lines.push(`      if (key === undefined || key === null) continue;`);
  lines.push(
    `      if (seen.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['${invariant.arrayField}', index, '${invariant.uniqueField}'], message: 'Invariant "${invariant.name}" requires unique "${invariant.uniqueField}" values.' });`,
  );
  lines.push(`      seen.add(key);`);
  lines.push(`    }`);
  lines.push(`  }`);
  return lines.join('\n');
}

function weekdayIndex(value: string): number {
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(
    String(value),
  );
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
      return `z.number()`;
    case 'literal':
      return `z.literal(${renderLiteral(t.value)})`;
    case 'ref': {
      const dot = t.typeName.indexOf('.');
      if (dot === -1) {
        const target = ctx.types.get(t.typeName);
        if (target?.kind === 'object' && target.table === true) {
          return `z.string().brand<'${target.name}Id'>()`;
        }
        return t.typeName;
      }
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

function sortTypeDefs(types: TypeDef[], ctx: EmitContext): TypeDef[] {
  const localByName = new Map(types.map((type) => [type.name, type]));
  const sorted: TypeDef[] = [];
  const temporary = new Set<string>();
  const permanent = new Set<string>();

  function visit(type: TypeDef): void {
    if (permanent.has(type.name)) return;
    if (temporary.has(type.name)) return;

    temporary.add(type.name);
    for (const depName of localDependencyNames(type, ctx)) {
      const dep = localByName.get(depName);
      if (dep) visit(dep);
    }
    temporary.delete(type.name);
    permanent.add(type.name);
    sorted.push(type);
  }

  for (const type of types) visit(type);
  return sorted;
}

function localDependencyNames(type: TypeDef, ctx: EmitContext): string[] {
  const dependencies = new Set<string>();

  if (type.kind === 'object') {
    for (const baseName of type.extends ?? []) {
      if (ctx.types.has(baseName)) dependencies.add(baseName);
    }
    for (const field of type.fields) {
      collectLocalDependenciesForType(field.type, ctx, dependencies);
    }
  }

  if (type.kind === 'discriminatedUnion') {
    for (const variantName of type.variants) {
      if (ctx.types.has(variantName)) dependencies.add(variantName);
    }
  }

  dependencies.delete(type.name);
  return [...dependencies].sort();
}

function effectiveFields(type: Extract<TypeDef, { kind: 'object' }>, ctx: EmitContext): FieldDef[] {
  const fields = new Map<string, FieldDef>();
  const seen = new Set<string>();

  function addFrom(current: Extract<TypeDef, { kind: 'object' }>): void {
    if (seen.has(current.name)) return;
    seen.add(current.name);
    for (const baseName of current.extends ?? []) {
      const base = ctx.types.get(baseName);
      if (base?.kind === 'object') addFrom(base);
    }
    for (const field of current.fields) fields.set(field.name, field);
  }

  addFrom(type);
  return [...fields.values()];
}

function collectLocalDependenciesForType(
  t: FieldType,
  ctx: EmitContext,
  dependencies: Set<string>,
): void {
  if (t.kind === 'array') {
    collectLocalDependenciesForType(t.element, ctx, dependencies);
    return;
  }
  if (t.kind !== 'ref') return;
  const target = ctx.types.get(t.typeName);
  if (target?.kind === 'object' && target.table === true) return;
  if (ctx.types.has(t.typeName)) dependencies.add(t.typeName);
}
