import { faker } from '@faker-js/faker';
import { z } from 'zod';
import type { Schema } from './ir';
import {
  buildPlaygroundContract,
  type PlaygroundControl,
  type PlaygroundEntity,
  type PlaygroundRefControl,
  type PlaygroundScalarControl,
} from './playground-contract';

export interface PlaygroundFixtureRecord {
  id: string;
  typeName: string;
  value: Record<string, unknown>;
}

export interface PlaygroundFixtureOptions {
  seed?: string;
  count?: number;
  countsByType?: Record<string, number>;
  typeNames?: readonly string[];
  existingRecordsByType?: Record<string, Array<{ id: string; value: Record<string, unknown> }>>;
}

export interface PlaygroundFixtureResult {
  recordsByType: Record<string, PlaygroundFixtureRecord[]>;
  warnings: PlaygroundFixtureWarning[];
}

export interface PlaygroundFixtureWarning {
  typeName: string;
  fieldName?: string;
  message: string;
}

const DEFAULT_COUNT = 5;

export function generatePlaygroundFixtures(
  schema: Schema,
  options: PlaygroundFixtureOptions = {},
): PlaygroundFixtureResult {
  const contract = buildPlaygroundContract(schema);
  const requestedTypeNames = new Set(
    options.typeNames ?? contract.entities.map((entity) => entity.typeName),
  );
  const entities = orderEntitiesForRefs(contract.entities).filter((entity) =>
    requestedTypeNames.has(entity.typeName),
  );
  const random = createFixtureRandom(options.seed ?? 'contexture-playground');
  const recordsByType: PlaygroundFixtureResult['recordsByType'] = {};
  const warnings: PlaygroundFixtureWarning[] = [];

  for (const entity of entities) {
    const count = options.countsByType?.[entity.typeName] ?? options.count ?? DEFAULT_COUNT;
    const generated: PlaygroundFixtureRecord[] = [];

    for (let index = 0; index < count; index += 1) {
      const record: PlaygroundFixtureRecord = {
        id: fixtureId(entity.typeName, index, random),
        typeName: entity.typeName,
        value: generateEntityValue({
          entity,
          entityCategory: inferEntityCategory(entity),
          index,
          random,
          recordsByType: { ...options.existingRecordsByType, ...recordsByType },
          warnings,
        }),
      };
      validateGeneratedRecord(entity, record, warnings);
      generated.push(record);
    }

    recordsByType[entity.typeName] = generated;
  }

  return { recordsByType, warnings };
}

interface GenerateValueContext {
  entity: PlaygroundEntity;
  entityCategory: EntityCategory;
  index: number;
  random: FixtureRandom;
  recordsByType: Record<string, Array<{ id: string; value: Record<string, unknown> }>>;
  warnings: PlaygroundFixtureWarning[];
}

interface FixtureRandom {
  stringUuid(): string;
  personName(): string;
  email(): string;
  url(): string;
  ingredient(): string;
  dish(): string;
  productName(): string;
  companyName(): string;
  city(): string;
  streetAddress(): string;
  lastName(): string;
  words(options: { min: number; max: number }): string;
  sentence(): string;
  number(options: { min: number; max: number; int?: boolean }): number;
  boolean(): boolean;
  recentDate(): string;
  soonDate(): string;
  pick<T>(items: readonly T[]): T | undefined;
  slug(value: string): string;
}

type EntityCategory =
  | 'household'
  | 'person'
  | 'pantry'
  | 'recipe'
  | 'todo'
  | 'list'
  | 'company'
  | 'place'
  | 'generic';

function createFixtureRandom(seed: string): FixtureRandom {
  faker.seed(hashSeed(seed));
  return {
    stringUuid: () => faker.string.uuid(),
    personName: () => faker.person.fullName(),
    email: () => faker.internet.email().toLowerCase(),
    url: () => faker.internet.url(),
    ingredient: () => faker.food.ingredient(),
    dish: () => faker.food.dish(),
    productName: () => faker.commerce.productName(),
    companyName: () => faker.company.name(),
    city: () => faker.location.city(),
    streetAddress: () => faker.location.streetAddress(),
    lastName: () => faker.person.lastName(),
    words: (options) => faker.lorem.words({ min: options.min, max: options.max }),
    sentence: () => faker.lorem.sentence(),
    number: (options) =>
      faker.number.float({
        min: options.min,
        max: options.max,
        fractionDigits: options.int ? 0 : 2,
      }),
    boolean: () => faker.datatype.boolean(),
    recentDate: () => faker.date.recent({ days: 21 }).toISOString().slice(0, 10),
    soonDate: () => faker.date.soon({ days: 21 }).toISOString().slice(0, 10),
    pick: (items) => (items.length > 0 ? faker.helpers.arrayElement([...items]) : undefined),
    slug: (value) => faker.helpers.slugify(value).toLowerCase(),
  };
}

function generateEntityValue(ctx: GenerateValueContext): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  for (const control of ctx.entity.fields) {
    if (control.serverDerived || control.kind === 'unsupported') continue;
    const generated = generateControlValue(control, ctx);
    if (generated === undefined && !control.required) continue;
    value[control.fieldName] = generated;
  }
  return value;
}

function generateControlValue(control: PlaygroundControl, ctx: GenerateValueContext): unknown {
  if (control.defaultValue !== undefined) return control.defaultValue;

  switch (control.kind) {
    case 'text':
      return generateText(control as PlaygroundScalarControl & { kind: 'text' }, ctx);
    case 'number':
      return ctx.random.number({
        min: control.constraints.min ?? 1,
        max: control.constraints.max ?? 100,
        int: control.constraints.int,
      });
    case 'boolean':
      return ctx.random.boolean();
    case 'date':
      return dateFieldLooksFuture(control.fieldName)
        ? ctx.random.soonDate()
        : ctx.random.recentDate();
    case 'literal':
      return control.constraints.literalValue;
    case 'enum':
      return control.options.length > 0
        ? control.options[ctx.index % control.options.length]?.value
        : undefined;
    case 'ref':
      return generateRef(control, ctx);
    case 'array':
      return [];
    case 'object': {
      const objectValue: Record<string, unknown> = {};
      for (const field of control.fields) {
        if (field.serverDerived || field.kind === 'unsupported') continue;
        const generated = generateControlValue(field, ctx);
        if (generated === undefined && !field.required) continue;
        objectValue[field.fieldName] = generated;
      }
      return objectValue;
    }
    case 'unsupported':
      return undefined;
  }
}

function generateText(
  control: PlaygroundScalarControl & { kind: 'text' },
  ctx: GenerateValueContext,
): string {
  const field = control.fieldName.toLowerCase();
  const label = control.label.toLowerCase();

  if (control.constraints.format === 'email' || field.includes('email')) return ctx.random.email();
  if (control.constraints.format === 'url' || field.includes('url')) return ctx.random.url();
  if (control.constraints.format === 'uuid' || field === 'uuid') return ctx.random.stringUuid();
  if (field.includes('slug')) return ctx.random.slug(`${ctx.entity.typeName} ${ctx.index + 1}`);
  if (isNameField(field, label)) return nameForEntity(ctx);
  if (field === 'title' || field.endsWith('title')) return titleForEntity(ctx.entity, ctx);
  if (field.includes('quantity') || field.includes('amount')) return quantityForEntity(ctx);
  if (field.includes('unit')) return unitForEntity(ctx);
  if (field.includes('address')) return ctx.random.streetAddress();
  if (field.includes('city')) return ctx.random.city();
  if (field.includes('description') || field.includes('notes') || field.includes('summary')) {
    return sentenceForEntity(ctx);
  }
  if (field.includes('status') || field.includes('state'))
    return ctx.random.pick(['draft', 'active', 'done']) ?? 'active';
  if (field.includes('priority')) return ctx.random.pick(['low', 'normal', 'high']) ?? 'normal';

  return ctx.random.words({
    min: control.constraints.min !== undefined && control.constraints.min > 10 ? 3 : 1,
    max: control.constraints.max !== undefined && control.constraints.max < 12 ? 2 : 5,
  });
}

function nameForEntity(ctx: GenerateValueContext): string {
  switch (ctx.entityCategory) {
    case 'household':
      return `The ${ctx.random.lastName()} Household`;
    case 'person':
      return ctx.random.personName();
    case 'pantry':
      return ctx.random.ingredient();
    case 'recipe':
      return ctx.random.dish();
    case 'todo':
      return titleForEntity(ctx.entity, ctx);
    case 'list':
      return (
        ctx.random.pick(['Weekly groceries', 'Weekend jobs', 'Launch checklist', 'House admin']) ??
        ctx.random.words({ min: 2, max: 4 })
      );
    case 'company':
      return ctx.random.companyName();
    case 'place':
      return ctx.random.city();
    case 'generic':
      return ctx.random.words({ min: 2, max: 4 });
  }
}

function titleForEntity(_entity: PlaygroundEntity, ctx: GenerateValueContext): string {
  if (ctx.entityCategory === 'todo') {
    return (
      ctx.random.pick([
        'Review onboarding flow',
        'Draft release notes',
        'Check supplier invoice',
        'Prepare planning notes',
        'Tidy model relationships',
      ]) ?? ctx.random.words({ min: 2, max: 5 })
    );
  }
  if (ctx.entityCategory === 'recipe') return ctx.random.dish();
  if (ctx.entityCategory === 'pantry') return ctx.random.ingredient();
  if (ctx.entityCategory === 'household') return nameForEntity(ctx);
  return ctx.random.words({ min: 2, max: 5 });
}

function sentenceForEntity(ctx: GenerateValueContext): string {
  if (ctx.entityCategory === 'pantry') {
    return (
      ctx.random.pick([
        'Stored for quick weeknight meals.',
        'Check the quantity before the next shop.',
        'Usually kept in the main pantry.',
      ]) ?? ctx.random.sentence()
    );
  }
  if (ctx.entityCategory === 'recipe') {
    return (
      ctx.random.pick([
        'Simple enough for a weeknight dinner.',
        'Works well with pantry staples.',
        'Best served fresh with a side salad.',
      ]) ?? ctx.random.sentence()
    );
  }
  return ctx.random.sentence();
}

function quantityForEntity(ctx: GenerateValueContext): string {
  if (ctx.entityCategory === 'pantry' || ctx.entityCategory === 'recipe') {
    const amount = ctx.random.pick(['1', '2', '3', '500', '750']) ?? '1';
    return `${amount} ${unitForEntity(ctx)}`;
  }
  return String(ctx.random.number({ min: 1, max: 20, int: true }));
}

function unitForEntity(ctx: GenerateValueContext): string {
  if (ctx.entityCategory === 'pantry' || ctx.entityCategory === 'recipe') {
    return ctx.random.pick(['kg', 'g', 'ml', 'jar', 'tin', 'pack']) ?? 'pack';
  }
  return ctx.random.pick(['item', 'unit', 'pack']) ?? 'item';
}

function generateRef(control: PlaygroundRefControl, ctx: GenerateValueContext): string | undefined {
  const records = ctx.recordsByType[control.targetTypeName] ?? [];
  const record = ctx.random.pick(records);
  if (!record) {
    if (control.required) {
      ctx.warnings.push({
        typeName: ctx.entity.typeName,
        fieldName: control.fieldName,
        message: `No ${control.targetTypeName} records were available for required reference.`,
      });
    }
    return undefined;
  }
  return record.id;
}

function validateGeneratedRecord(
  entity: PlaygroundEntity,
  record: PlaygroundFixtureRecord,
  warnings: PlaygroundFixtureWarning[],
): void {
  const schema = zodSchemaForEntity(entity);
  const result = schema.safeParse(record.value);
  if (result.success) return;
  warnings.push({
    typeName: entity.typeName,
    message: `Generated record ${record.id.slice(0, 8)} did not pass fixture validation.`,
  });
}

function zodSchemaForEntity(entity: PlaygroundEntity): z.ZodObject<z.ZodRawShape> {
  const shape: Record<string, z.ZodType> = {};
  for (const field of entity.fields) {
    if (field.serverDerived || field.kind === 'unsupported') continue;
    shape[field.fieldName] = zodSchemaForControl(field);
  }
  return z.object(shape);
}

function zodSchemaForControl(control: PlaygroundControl): z.ZodType {
  let schema: z.ZodType;

  switch (control.kind) {
    case 'text': {
      let stringSchema = z.string();
      if (control.constraints.min !== undefined)
        stringSchema = stringSchema.min(control.constraints.min);
      if (control.constraints.max !== undefined)
        stringSchema = stringSchema.max(control.constraints.max);
      if (control.constraints.regex)
        stringSchema = stringSchema.regex(new RegExp(control.constraints.regex));
      if (control.constraints.format === 'email') stringSchema = stringSchema.email();
      if (control.constraints.format === 'url') stringSchema = stringSchema.url();
      if (control.constraints.format === 'uuid') stringSchema = stringSchema.uuid();
      if (control.constraints.format === 'datetime') stringSchema = stringSchema.datetime();
      schema = stringSchema;
      break;
    }
    case 'number': {
      let numberSchema = z.number();
      if (control.constraints.int) numberSchema = numberSchema.int();
      if (control.constraints.min !== undefined)
        numberSchema = numberSchema.min(control.constraints.min);
      if (control.constraints.max !== undefined)
        numberSchema = numberSchema.max(control.constraints.max);
      schema = numberSchema;
      break;
    }
    case 'boolean':
      schema = z.boolean();
      break;
    case 'date':
      schema = z.string();
      break;
    case 'literal':
      schema = z.literal(control.constraints.literalValue);
      break;
    case 'enum':
      schema =
        control.options.length > 0
          ? z.enum(control.options.map((option) => option.value) as [string, ...string[]])
          : z.string();
      break;
    case 'ref':
      schema = z.string();
      break;
    case 'array':
      schema = z.array(z.unknown());
      break;
    case 'object':
      schema = z.object(
        Object.fromEntries(
          control.fields
            .filter((field) => !field.serverDerived && field.kind !== 'unsupported')
            .map((field) => [field.fieldName, zodSchemaForControl(field)]),
        ),
      );
      break;
    case 'unsupported':
      schema = z.unknown();
      break;
  }

  if (control.nullable) schema = schema.nullable();
  if (!control.required) schema = schema.optional();
  return schema;
}

function orderEntitiesForRefs(entities: readonly PlaygroundEntity[]): PlaygroundEntity[] {
  const byName = new Map(entities.map((entity) => [entity.typeName, entity]));
  const sorted: PlaygroundEntity[] = [];
  const temporary = new Set<string>();
  const permanent = new Set<string>();

  function visit(entity: PlaygroundEntity): void {
    if (permanent.has(entity.typeName)) return;
    if (temporary.has(entity.typeName)) return;
    temporary.add(entity.typeName);
    for (const refName of tableRefNames(entity.fields)) {
      const dep = byName.get(refName);
      if (dep) visit(dep);
    }
    temporary.delete(entity.typeName);
    permanent.add(entity.typeName);
    sorted.push(entity);
  }

  for (const entity of entities) visit(entity);
  return sorted;
}

function tableRefNames(fields: readonly PlaygroundControl[]): string[] {
  const refs = new Set<string>();
  for (const field of fields) {
    if (field.kind === 'ref') refs.add(field.targetTypeName);
    if (field.kind === 'object') {
      for (const nested of tableRefNames(field.fields)) refs.add(nested);
    }
  }
  return [...refs].sort();
}

function inferEntityCategory(entity: PlaygroundEntity): EntityCategory {
  const haystack =
    `${entity.typeName} ${entity.tableName} ${entity.description ?? ''}`.toLowerCase();
  if (matchesAny(haystack, ['household', 'family', 'home'])) return 'household';
  if (matchesAny(haystack, ['user', 'person', 'member', 'contact', 'assignee'])) return 'person';
  if (matchesAny(haystack, ['pantry', 'ingredient', 'grocery', 'food', 'stock', 'inventory'])) {
    return 'pantry';
  }
  if (matchesAny(haystack, ['recipe', 'meal', 'dish', 'menu'])) return 'recipe';
  if (matchesAny(haystack, ['todo', 'task', 'checklist', 'issue'])) return 'todo';
  if (matchesAny(haystack, ['list', 'collection'])) return 'list';
  if (matchesAny(haystack, ['company', 'organisation', 'organization', 'vendor', 'supplier'])) {
    return 'company';
  }
  if (matchesAny(haystack, ['place', 'address', 'location', 'venue'])) return 'place';
  return 'generic';
}

function matchesAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function isNameField(field: string, label: string): boolean {
  return field === 'name' || field.endsWith('name') || label.endsWith(' name');
}

function fixtureId(typeName: string, index: number, random: FixtureRandom): string {
  return `${typeName}_${index + 1}_${random.stringUuid().slice(0, 8)}`;
}

function dateFieldLooksFuture(fieldName: string): boolean {
  const lower = fieldName.toLowerCase();
  return lower.includes('due') || lower.includes('deadline') || lower.includes('expires');
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(31, hash) + seed.charCodeAt(index);
  }
  return Math.abs(hash);
}
