import { fieldIsRuntimeDerived } from './derivation';
import type { FieldDef, FieldType, SampleDataHint, Schema, TypeDef } from './ir';

export type PlaygroundControlKind =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'literal'
  | 'enum'
  | 'ref'
  | 'array'
  | 'object'
  | 'unsupported';

export type PlaygroundControl =
  | PlaygroundScalarControl
  | PlaygroundEnumControl
  | PlaygroundRefControl
  | PlaygroundArrayControl
  | PlaygroundObjectControl
  | PlaygroundUnsupportedControl;

type PlaygroundControlShape =
  | Pick<PlaygroundScalarControl, 'kind' | 'constraints'>
  | Pick<PlaygroundEnumControl, 'kind' | 'options'>
  | Pick<PlaygroundRefControl, 'kind' | 'targetTypeName' | 'targetTableName'>
  | Pick<PlaygroundArrayControl, 'kind' | 'element' | 'min' | 'max'>
  | Pick<PlaygroundObjectControl, 'kind' | 'typeName' | 'fields'>
  | Pick<PlaygroundUnsupportedControl, 'kind' | 'reason'>;

export interface PlaygroundFieldBase {
  kind: PlaygroundControlKind;
  fieldName: string;
  label: string;
  description?: string;
  required: boolean;
  nullable: boolean;
  defaultValue?: unknown;
  serverDerived: boolean;
  sampleData?: SampleDataHint;
}

export interface PlaygroundScalarControl extends PlaygroundFieldBase {
  kind: 'text' | 'number' | 'boolean' | 'date' | 'literal';
  constraints: PlaygroundFieldConstraints;
}

export interface PlaygroundEnumControl extends PlaygroundFieldBase {
  kind: 'enum';
  options: PlaygroundEnumOption[];
}

export interface PlaygroundRefControl extends PlaygroundFieldBase {
  kind: 'ref';
  targetTypeName: string;
  targetTableName?: string;
}

export interface PlaygroundArrayControl extends PlaygroundFieldBase {
  kind: 'array';
  element: PlaygroundArrayElementControl;
  min?: number;
  max?: number;
}

export interface PlaygroundObjectControl extends PlaygroundFieldBase {
  kind: 'object';
  typeName: string;
  fields: PlaygroundControl[];
}

export interface PlaygroundUnsupportedControl extends PlaygroundFieldBase {
  kind: 'unsupported';
  reason: string;
}

export type PlaygroundArrayElementControl = PlaygroundControlShape;

export interface PlaygroundFieldConstraints {
  min?: number;
  max?: number;
  int?: boolean;
  regex?: string;
  format?: 'email' | 'url' | 'uuid' | 'datetime';
  literalValue?: string | number | boolean;
}

export interface PlaygroundEnumOption {
  value: string;
  label: string;
  description?: string;
}

export interface PlaygroundEntity {
  typeName: string;
  tableName: string;
  description?: string;
  sampleData?: SampleDataHint;
  fields: PlaygroundControl[];
  indexes: readonly string[];
  displayFieldName?: string;
}

export interface PlaygroundContract {
  entities: PlaygroundEntity[];
  embeddedTypes: PlaygroundObjectControl[];
  enums: Array<{ typeName: string; options: PlaygroundEnumOption[] }>;
}

export interface PlaygroundContractOptions {
  externalTypes?: ReadonlyMap<string, TypeDef> | Record<string, TypeDef>;
}

type ObjectType = Extract<TypeDef, { kind: 'object' }>;
type EnumType = Extract<TypeDef, { kind: 'enum' }>;
type RawType = Extract<TypeDef, { kind: 'raw' }>;

const DISPLAY_FIELD_CANDIDATES = ['name', 'title', 'label', 'slug', 'email', 'key'];

export function buildPlaygroundContract(
  schema: Schema,
  options: PlaygroundContractOptions = {},
): PlaygroundContract {
  const typeByName = new Map([
    ...externalTypeEntries(options.externalTypes),
    ...schema.types.map((type) => [type.name, type] as const),
  ]);
  const entities = schema.types
    .filter((type): type is ObjectType => type.kind === 'object' && type.table === true)
    .map((type) => buildEntity(type, typeByName, [type.name]));

  const embeddedTypes = schema.types
    .filter((type): type is ObjectType => type.kind === 'object' && type.table !== true)
    .map((type) => buildObjectControl(type.name, type.fields, typeByName, [type.name]));

  const enums = schema.types
    .filter((type): type is EnumType => type.kind === 'enum')
    .map((type) => ({ typeName: type.name, options: enumOptions(type) }));

  return { entities, embeddedTypes, enums };
}

export function emptyPlaygroundValue(control: PlaygroundControl): unknown {
  if (control.defaultValue !== undefined) return control.defaultValue;
  if (!control.required) return undefined;

  switch (control.kind) {
    case 'text':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'date':
      return new Date().toISOString().slice(0, 10);
    case 'literal':
      return control.constraints.literalValue;
    case 'enum':
      return control.options[0]?.value ?? '';
    case 'ref':
      return '';
    case 'array':
      return [];
    case 'object':
      return emptyObjectValue(control.fields);
    case 'unsupported':
      return undefined;
  }
}

export function emptyEntityValue(entity: PlaygroundEntity): Record<string, unknown> {
  return emptyObjectValue(entity.fields);
}

function emptyObjectValue(fields: readonly PlaygroundControl[]): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.serverDerived) continue;
    const empty = emptyPlaygroundValue(field);
    if (empty !== undefined) value[field.fieldName] = empty;
  }
  return value;
}

function buildEntity(
  type: ObjectType,
  typeByName: ReadonlyMap<string, TypeDef>,
  stack: readonly string[],
): PlaygroundEntity {
  return {
    typeName: type.name,
    tableName: tableName(type),
    description: type.description,
    sampleData: type.sampleData,
    fields: type.fields.map((field) => buildControl(field, typeByName, stack)),
    indexes: (type.indexes ?? []).map((index) => index.name),
    displayFieldName: displayFieldName(type),
  };
}

function buildControl(
  field: FieldDef,
  typeByName: ReadonlyMap<string, TypeDef>,
  stack: readonly string[],
): PlaygroundControl {
  const base = {
    fieldName: field.name,
    label: labelFor(field.name),
    description: field.description,
    required: field.optional !== true && !fieldIsRuntimeDerived(field),
    nullable: field.nullable === true,
    defaultValue: field.default,
    serverDerived: fieldIsRuntimeDerived(field),
    sampleData: field.sampleData,
  };
  return { ...base, ...buildControlShape(field.type, typeByName, stack) } as PlaygroundControl;
}

function buildControlShape(
  fieldType: FieldType,
  typeByName: ReadonlyMap<string, TypeDef>,
  stack: readonly string[],
): PlaygroundControlShape {
  switch (fieldType.kind) {
    case 'string':
      return {
        kind: 'text',
        constraints: {
          min: fieldType.min,
          max: fieldType.max,
          regex: fieldType.regex,
          format: fieldType.format,
        },
      };
    case 'number':
      return {
        kind: 'number',
        constraints: { min: fieldType.min, max: fieldType.max, int: fieldType.int },
      };
    case 'boolean':
      return { kind: 'boolean', constraints: {} };
    case 'date':
      return { kind: 'date', constraints: {} };
    case 'literal':
      return { kind: 'literal', constraints: { literalValue: fieldType.value } };
    case 'ref':
      return refControlShape(fieldType.typeName, typeByName, stack);
    case 'array':
      return {
        kind: 'array',
        element: buildArrayElement(fieldType.element, typeByName, stack),
        min: fieldType.min,
        max: fieldType.max,
      };
  }
}

function buildArrayElement(
  fieldType: FieldType,
  typeByName: ReadonlyMap<string, TypeDef>,
  stack: readonly string[],
): PlaygroundArrayElementControl {
  return buildControlShape(fieldType, typeByName, stack);
}

function refControlShape(
  typeName: string,
  typeByName: ReadonlyMap<string, TypeDef>,
  stack: readonly string[],
): PlaygroundControlShape {
  const target = typeByName.get(typeName);
  if (target?.kind === 'enum') return { kind: 'enum', options: enumOptions(target) };
  if (target?.kind === 'raw') return rawControlShape(target);
  if (target?.kind === 'object' && target.table === true) {
    return {
      kind: 'ref',
      targetTypeName: target.name,
      targetTableName: tableName(target),
    };
  }
  if (target?.kind === 'object') {
    if (stack.includes(target.name)) {
      return { kind: 'unsupported', reason: `Recursive embedded reference: ${target.name}` };
    }
    return buildObjectShape(target, typeByName, [...stack, target.name]);
  }
  return { kind: 'unsupported', reason: `Unknown reference target: ${typeName}` };
}

function rawControlShape(type: RawType): PlaygroundControlShape {
  const jsonSchema = type.jsonSchema;
  const jsonType = typeof jsonSchema.type === 'string' ? jsonSchema.type : null;
  if (jsonType === 'number' || jsonType === 'integer') {
    return {
      kind: 'number',
      constraints: {
        min: numericConstraint(jsonSchema.minimum ?? jsonSchema.exclusiveMinimum),
        max: numericConstraint(jsonSchema.maximum ?? jsonSchema.exclusiveMaximum),
        int: jsonType === 'integer',
      },
    };
  }
  if (jsonType === 'boolean') return { kind: 'boolean', constraints: {} };
  if (jsonType === 'string') {
    const format = stringFormat(jsonSchema.format);
    return {
      kind: format === 'date' ? 'date' : 'text',
      constraints: {
        min: numericConstraint(jsonSchema.minLength),
        max: numericConstraint(jsonSchema.maxLength),
        regex: typeof jsonSchema.pattern === 'string' ? jsonSchema.pattern : undefined,
        ...(format && format !== 'date' ? { format } : {}),
      },
    };
  }
  return { kind: 'unsupported', reason: `Unsupported raw reference target: ${type.name}` };
}

function externalTypeEntries(
  externalTypes: PlaygroundContractOptions['externalTypes'],
): Array<readonly [string, TypeDef]> {
  if (!externalTypes) return [];
  return externalTypes instanceof Map
    ? [...externalTypes.entries()]
    : Object.entries(externalTypes);
}

function numericConstraint(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function stringFormat(value: unknown): PlaygroundFieldConstraints['format'] | 'date' | undefined {
  if (value === 'email' || value === 'uuid' || value === 'datetime' || value === 'date') {
    return value;
  }
  if (value === 'uri') return 'url';
  return undefined;
}

function buildObjectControl(
  typeName: string,
  fields: FieldDef[],
  typeByName: ReadonlyMap<string, TypeDef>,
  stack: readonly string[],
): PlaygroundObjectControl {
  return {
    kind: 'object',
    typeName,
    fieldName: typeName,
    label: labelFor(typeName),
    required: true,
    nullable: false,
    serverDerived: false,
    fields: fields.map((field) => buildControl(field, typeByName, stack)),
  };
}

function buildObjectShape(
  type: ObjectType,
  typeByName: ReadonlyMap<string, TypeDef>,
  stack: readonly string[],
): Pick<PlaygroundObjectControl, 'kind' | 'typeName' | 'fields'> {
  return {
    kind: 'object',
    typeName: type.name,
    fields: type.fields.map((field) => buildControl(field, typeByName, stack)),
  };
}

function enumOptions(type: EnumType): PlaygroundEnumOption[] {
  return type.values.map((value) => ({
    value: value.value,
    label: labelFor(value.value),
    description: value.description,
  }));
}

function tableName(type: ObjectType): string {
  return type.tableName ?? lowerFirst(type.name);
}

function displayFieldName(type: ObjectType): string | undefined {
  return DISPLAY_FIELD_CANDIDATES.find((candidate) =>
    type.fields.some((field) => field.name === candidate && field.type.kind === 'string'),
  );
}

function labelFor(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!words) return name;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function lowerFirst(name: string): string {
  return `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
}
