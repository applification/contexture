/**
 * Semantic validators for the IR.
 *
 * The Zod meta-schema (`model/ir.ts`) enforces structural correctness
 * at load time. This module layers the semantic rules on top:
 *
 * 1. Structural parse (enforced by the loader; not re-checked here).
 * 2. Refs + imports + duplicate type names — delegated to core's
 *    `checkSemantic` so the validation panel and the op-layer gate
 *    share one implementation.
 * 3. Discriminated unions — every variant must reference a local `object`
 *    type whose fields include the discriminator.
 * 4. Enums — non-empty `values`, no duplicate values.
 * 5. Emitted Zod compiles — deferred sandboxed eval, wired up alongside
 *    the Zod emitter in #83.
 *
 * Each returned `ValidationError` carries a stable `code` and a dotted
 * `path` so the UI can map the message back to the offending field.
 */
import { checkSemantic, type SemanticIssue } from '@contexture/core';
import type { Schema } from '../model/ir';
import type { StdlibRegistry } from './stdlib-registry';

export interface ValidationError {
  code: string;
  path: string;
  message: string;
}

export interface ValidateOptions {
  /**
   * Optional stdlib registry used to resolve qualified refs
   * (`<namespace>.<TypeName>`) against bundled stdlib namespaces when
   * no matching `add_import` has been declared, and to validate that
   * stdlib imports point at known namespaces with matching aliases.
   */
  stdlib?: StdlibRegistry;
}

export function validate(schema: Schema, options: ValidateOptions = {}): ValidationError[] {
  if (!schema || schema.version !== '1') return [];
  const errors: ValidationError[] = [];
  errors.push(...checkSemantic(schema, options.stdlib).map(toValidationError));
  errors.push(...checkDiscriminatedUnions(schema));
  errors.push(...checkEnums(schema));
  errors.push(...checkEmittedZodCompiles(schema));
  return errors;
}

function toValidationError(issue: SemanticIssue): ValidationError {
  return {
    code: issue.code,
    path: issue.path,
    message: issue.hint ? `${issue.message} ${issue.hint}` : issue.message,
  };
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
