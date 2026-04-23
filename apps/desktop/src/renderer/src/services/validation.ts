/**
 * Semantic validators for the IR.
 *
 * The Zod meta-schema (`model/ir.ts`) enforces structural correctness
 * at load time. This module layers the 7 semantic rules on top:
 *
 * 1. Structural parse (enforced by the loader; not re-checked here).
 * 2. Every `ref.typeName` resolves — local type OR `alias.Name` with a
 *    matching import alias.
 * 3. No duplicate type names within a file.
 * 4. Discriminated unions — every variant must reference a local `object`
 *    type whose fields include the discriminator.
 * 5. Enums — non-empty `values`, no duplicate values.
 * 6. Imports — every alias unique. (Cycles are the loader's concern.)
 * 7. Emitted Zod compiles — deferred sandboxed eval, wired up alongside
 *    the Zod emitter in #83.
 *
 * Each returned `ValidationError` carries a stable `code` and a dotted
 * `path` so the UI can map the message back to the offending field.
 */
import type { FieldType, Schema } from '../model/ir';
import type { StdlibRegistry } from './stdlib-registry';

export interface ValidationError {
  code: string;
  path: string;
  message: string;
}

export interface ValidateOptions {
  /**
   * Optional stdlib registry used by Rule 2 to resolve qualified refs
   * (`<namespace>.<TypeName>`) against bundled stdlib namespaces when
   * no matching `add_import` has been declared. Callers that want
   * strict import-only resolution (historical behaviour) pass nothing.
   */
  stdlib?: StdlibRegistry;
}

export function validate(schema: Schema, options: ValidateOptions = {}): ValidationError[] {
  if (!schema || schema.version !== '1') return [];
  const errors: ValidationError[] = [];
  errors.push(...checkDuplicateTypeNames(schema));
  errors.push(...checkRefsResolve(schema, options.stdlib));
  errors.push(...checkDiscriminatedUnions(schema));
  errors.push(...checkEnums(schema));
  errors.push(...checkImportAliases(schema));
  errors.push(...checkEmittedZodCompiles(schema));
  return errors;
}

/**
 * Rule 7: emitted Zod source must compile cleanly. The production
 * implementation will render the schema to Zod via the emitter (#83) and
 * evaluate the source in a sandboxed worker (#83 wires the worker; #82
 * only registers the hook). Until that lands this is a no-op so callers
 * can rely on the final rule slot being present.
 */
function checkEmittedZodCompiles(_schema: Schema): ValidationError[] {
  // TODO(#83): emit Zod for `_schema`, eval in sandboxed worker,
  // surface `zod_compile_failed` with the offending type path.
  return [];
}

function checkImportAliases(schema: Schema): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Set<string>();
  (schema.imports ?? []).forEach((imp, i) => {
    if (seen.has(imp.alias)) {
      errors.push({
        code: 'dup_import_alias',
        path: `imports.${i}`,
        message: `Duplicate import alias "${imp.alias}".`,
      });
    } else {
      seen.add(imp.alias);
    }
  });
  return errors;
}

function checkEnums(schema: Schema): ValidationError[] {
  const errors: ValidationError[] = [];
  schema.types.forEach((type, ti) => {
    if (type.kind !== 'enum') return;
    if (type.values.length === 0) {
      errors.push({
        code: 'enum_empty',
        path: `types.${ti}.values`,
        message: `Enum "${type.name}" must have at least one value.`,
      });
      return;
    }
    const seen = new Set<string>();
    type.values.forEach((v, vi) => {
      if (seen.has(v.value)) {
        errors.push({
          code: 'enum_duplicate_value',
          path: `types.${ti}.values.${vi}`,
          message: `Duplicate enum value "${v.value}" in "${type.name}".`,
        });
      } else {
        seen.add(v.value);
      }
    });
  });
  return errors;
}

function checkDiscriminatedUnions(schema: Schema): ValidationError[] {
  const errors: ValidationError[] = [];
  const byName = new Map(schema.types.map((t) => [t.name, t]));

  schema.types.forEach((type, ti) => {
    if (type.kind !== 'discriminatedUnion') return;
    type.variants.forEach((variantName, vi) => {
      const path = `types.${ti}.variants.${vi}`;
      const variant = byName.get(variantName);
      if (!variant) {
        errors.push({
          code: 'discriminator_variant_not_found',
          path,
          message: `Discriminated union variant "${variantName}" is not defined.`,
        });
        return;
      }
      if (variant.kind !== 'object') {
        errors.push({
          code: 'discriminator_variant_not_object',
          path,
          message: `Discriminated union variant "${variantName}" must be an object type.`,
        });
        return;
      }
      if (!variant.fields.some((f) => f.name === type.discriminator)) {
        errors.push({
          code: 'discriminator_missing_on_variant',
          path,
          message: `Variant "${variantName}" is missing discriminator field "${type.discriminator}".`,
        });
      }
    });
  });
  return errors;
}

function checkRefsResolve(schema: Schema, stdlib?: StdlibRegistry): ValidationError[] {
  const errors: ValidationError[] = [];
  const localNames = new Set(schema.types.map((t) => t.name));
  const aliases = new Set((schema.imports ?? []).map((i) => i.alias));

  const walkField = (t: FieldType, path: string) => {
    if (t.kind === 'ref') {
      if (!resolves(t.typeName, localNames, aliases, stdlib)) {
        errors.push({
          code: 'unresolved_ref',
          path,
          message: `Unresolved ref "${t.typeName}".`,
        });
      }
    } else if (t.kind === 'array') {
      walkField(t.element, `${path}.element`);
    }
  };

  schema.types.forEach((type, ti) => {
    if (type.kind !== 'object') return;
    type.fields.forEach((f, fi) => {
      walkField(f.type, `types.${ti}.fields.${fi}.type`);
    });
  });
  return errors;
}

function resolves(
  typeName: string,
  locals: Set<string>,
  aliases: Set<string>,
  stdlib?: StdlibRegistry,
): boolean {
  const dot = typeName.indexOf('.');
  if (dot === -1) return locals.has(typeName);
  const ns = typeName.slice(0, dot);
  const name = typeName.slice(dot + 1);
  // An explicit `add_import` alias satisfies the ref without looking
  // inside the target module (matches legacy behaviour). A bundled
  // stdlib namespace satisfies it by name lookup — that's what
  // `common.Email` without an explicit import relies on.
  if (aliases.has(ns)) return true;
  return stdlib?.hasType(ns, name) ?? false;
}

function checkDuplicateTypeNames(schema: Schema): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Set<string>();
  schema.types.forEach((type, i) => {
    if (seen.has(type.name)) {
      errors.push({
        code: 'dup_type_name',
        path: `types.${i}`,
        message: `Duplicate type name "${type.name}".`,
      });
    } else {
      seen.add(type.name);
    }
  });
  return errors;
}
