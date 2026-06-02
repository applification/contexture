/**
 * Pure IR -> tiny dependency-free form validator helpers.
 *
 * The generated module imports the sibling Zod schemas and exposes one
 * `createFormValidator` instance per type. It avoids framework-specific
 * dependencies while still giving React Hook Form, TanStack Form, and custom
 * form code a stable `validate(value)` contract.
 */
import type { Schema, TypeDef } from './ir';

function header(sourcePath?: string): string {
  const base = '// @contexture-generated — do not edit by hand. Regenerated on every IR save.';
  return sourcePath ? `${base} Source: ${sourcePath}\n` : `${base}\n`;
}

export function emitFormValidators(
  schema: Schema,
  baseName: string,
  sourcePath?: string,
  schemaModule = `./${baseName}.schema`,
): string {
  const names = schema.types.map((type) => type.name).sort();
  const imports =
    names.length > 0 ? `import { ${names.join(', ')} } from '${schemaModule}';\n` : '';
  const validators = names
    .map((name) => `export const ${name}Validator = createFormValidator(${name});\n`)
    .join('');
  const createValidators = schema.types
    .filter(hasServerDerivedFields)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((type) => {
      const omitted = type.fields
        .filter((field) => field.serverDerived === true)
        .map((field) => `${field.name}: true`)
        .join(', ');
      return `export const ${type.name}CreateValidator = createFormValidator(${type.name}.omit({ ${omitted} }));\n`;
    })
    .join('');

  return `${header(sourcePath)}${imports}
export interface FormValidationSuccess<T> {
  ok: true;
  value: T;
  errors: Record<string, never>;
}

export interface FormValidationFailure {
  ok: false;
  value: undefined;
  errors: Record<string, string[]>;
}

export type FormValidationResult<T> = FormValidationSuccess<T> | FormValidationFailure;

interface SafeParseIssue {
  path: Array<string | number>;
  message: string;
}

interface SafeParseSchema<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: SafeParseIssue[] } };
}

export function createFormValidator<T>(schema: SafeParseSchema<T>) {
  return {
    validate(value: unknown): FormValidationResult<T> {
      const result = schema.safeParse(value);
      if (result.success) return { ok: true, value: result.data, errors: {} };
      return { ok: false, value: undefined, errors: groupIssues(result.error.issues) };
    },
  };
}

function groupIssues(issues: SafeParseIssue[]): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_form';
    errors[key] = [...(errors[key] ?? []), issue.message];
  }
  return errors;
}

${validators}${createValidators}`;
}

type ObjectType = Extract<TypeDef, { kind: 'object' }>;

function hasServerDerivedFields(type: TypeDef): type is ObjectType {
  return type.kind === 'object' && type.fields.some((field) => field.serverDerived === true);
}
