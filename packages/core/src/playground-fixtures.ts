import { faker } from '@faker-js/faker';
import { z } from 'zod';
import { generateFixtureValue } from './fixture-generators';
import type { Schema } from './ir';
import {
  buildPlaygroundContract,
  type PlaygroundArrayElementControl,
  type PlaygroundContractOptions,
  type PlaygroundControl,
  type PlaygroundEntity,
  type PlaygroundFieldConstraints,
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
  externalTypes?: PlaygroundContractOptions['externalTypes'];
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
  const contract = buildPlaygroundContract(schema, { externalTypes: options.externalTypes });
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
  fruit(): string;
  vegetable(): string;
  meat(): string;
  product(): string;
  productName(): string;
  productDescription(): string;
  companyName(): string;
  jobTitle(): string;
  city(): string;
  country(): string;
  streetAddress(): string;
  phoneNumber(): string;
  amount(): string;
  currencyCode(): string;
  vehicle(): string;
  bookTitle(): string;
  musicSong(): string;
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
  | 'food'
  | 'pantry'
  | 'recipe'
  | 'todo'
  | 'list'
  | 'commerce'
  | 'company'
  | 'finance'
  | 'place'
  | 'vehicle'
  | 'book'
  | 'music'
  | 'generic';

function createFixtureRandom(seed: string): FixtureRandom {
  faker.seed(hashSeed(seed));
  return {
    stringUuid: () => stringFixture('string.uuid', () => faker.string.uuid()),
    personName: () => stringFixture('person.fullName', () => faker.person.fullName()),
    email: () => stringFixture('internet.email', () => faker.internet.email()).toLowerCase(),
    url: () => stringFixture('internet.url', () => faker.internet.url()),
    ingredient: () => stringFixture('food.ingredient', () => faker.food.ingredient()),
    dish: () => stringFixture('food.dish', () => faker.food.dish()),
    fruit: () => stringFixture('food.fruit', () => faker.food.fruit()),
    vegetable: () => stringFixture('food.vegetable', () => faker.food.vegetable()),
    meat: () => stringFixture('food.meat', () => faker.food.meat()),
    product: () => stringFixture('commerce.product', () => faker.commerce.product()),
    productName: () => stringFixture('commerce.productName', () => faker.commerce.productName()),
    productDescription: () =>
      stringFixture('commerce.productDescription', () => faker.commerce.productDescription()),
    companyName: () => stringFixture('company.name', () => faker.company.name()),
    jobTitle: () => stringFixture('person.jobTitle', () => faker.person.jobTitle()),
    city: () => stringFixture('location.city', () => faker.location.city()),
    country: () => stringFixture('location.country', () => faker.location.country()),
    streetAddress: () =>
      stringFixture('location.streetAddress', () => faker.location.streetAddress()),
    phoneNumber: () => stringFixture('phone.number', () => faker.phone.number()),
    amount: () =>
      stringFixture('finance.amount', () => faker.finance.amount({ min: 10, max: 250, dec: 2 })),
    currencyCode: () => stringFixture('finance.currencyCode', () => faker.finance.currencyCode()),
    vehicle: () => stringFixture('vehicle.vehicle', () => faker.vehicle.vehicle()),
    bookTitle: () => stringFixture('book.title', () => faker.book.title()),
    musicSong: () => stringFixture('music.songName', () => faker.music.songName()),
    lastName: () => stringFixture('person.lastName', () => faker.person.lastName()),
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

function stringFixture(id: string, fallback: () => string): string {
  const generated = generateFixtureValue(id);
  return typeof generated === 'string' ? generated : fallback();
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
  const hintedValue = generateHintedValue(control);
  if (hintedValue !== undefined) return hintedValue;

  switch (control.kind) {
    case 'text':
      return generateText(control as PlaygroundScalarControl & { kind: 'text' }, ctx);
    case 'number':
      if (fieldLooksLike(control.fieldName, ['quantity', 'amount', 'count'])) {
        return entityCategoryUsesFood(ctx.entityCategory)
          ? ctx.random.number({ min: 1, max: 12, int: true })
          : ctx.random.number({
              min: control.constraints.min ?? 1,
              max: control.constraints.max ?? 20,
              int: true,
            });
      }
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
      return generateArray(control, ctx);
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

function generateArray(control: PlaygroundControl & { kind: 'array' }, ctx: GenerateValueContext) {
  const min = control.min ?? 0;
  const max = control.max ?? Math.max(min, 3);
  const count = Math.max(min, Math.min(max, defaultArrayCount(control)));
  return Array.from({ length: count }, () =>
    generateArrayElement(control.element, control.fieldName, ctx),
  ).filter((value) => value !== undefined);
}

function defaultArrayCount(control: PlaygroundControl & { kind: 'array' }): number {
  if (control.min !== undefined && control.min > 0) return control.min;
  if (fieldLooksLike(control.fieldName, ['tag', 'keyword', 'label'])) return 3;
  return 2;
}

function generateArrayElement(
  element: PlaygroundArrayElementControl,
  fieldName: string,
  ctx: GenerateValueContext,
): unknown {
  switch (element.kind) {
    case 'text':
      return generateText(arrayScalarControl(element, fieldName), ctx);
    case 'number':
      return ctx.random.number({
        min: element.constraints.min ?? 1,
        max: element.constraints.max ?? 20,
        int: element.constraints.int,
      });
    case 'boolean':
      return ctx.random.boolean();
    case 'date':
      return dateFieldLooksFuture(fieldName) ? ctx.random.soonDate() : ctx.random.recentDate();
    case 'literal':
      return element.constraints.literalValue;
    case 'enum':
      return ctx.random.pick(element.options.map((option) => option.value));
    case 'ref': {
      const record = ctx.random.pick(ctx.recordsByType[element.targetTypeName] ?? []);
      return record?.id;
    }
    case 'object': {
      const objectValue: Record<string, unknown> = {};
      for (const field of element.fields) {
        if (field.serverDerived || field.kind === 'unsupported') continue;
        const generated = generateControlValue(field, ctx);
        if (generated === undefined && !field.required) continue;
        objectValue[field.fieldName] = generated;
      }
      return objectValue;
    }
    case 'array':
      return [];
    case 'unsupported':
      return undefined;
  }
}

function arrayScalarControl(
  element: { constraints: PlaygroundFieldConstraints },
  fieldName: string,
): PlaygroundScalarControl & { kind: 'text' } {
  return {
    kind: 'text',
    fieldName: singularFieldName(fieldName),
    label: fieldName,
    required: true,
    nullable: false,
    serverDerived: false,
    constraints: element.constraints,
  };
}

function generateHintedValue(control: PlaygroundControl): unknown {
  const generator = control.sampleData?.generator;
  if (!generator) return undefined;
  const generated = generateFixtureValue(generator);
  if (generated === undefined) return undefined;
  switch (control.kind) {
    case 'text':
    case 'ref':
      return String(generated);
    case 'number': {
      const numeric = typeof generated === 'number' ? generated : Number(generated);
      return Number.isFinite(numeric) ? numeric : undefined;
    }
    case 'boolean':
      return typeof generated === 'boolean' ? generated : undefined;
    case 'date':
      return generated instanceof Date ? generated.toISOString().slice(0, 10) : String(generated);
    case 'literal':
    case 'enum':
    case 'array':
    case 'object':
    case 'unsupported':
      return generated;
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
  if (field.includes('phone') || field.includes('mobile')) return ctx.random.phoneNumber();
  if (field.includes('currency')) return ctx.random.currencyCode();
  if (field.includes('price') || field.includes('cost') || field.includes('total')) {
    return ctx.random.amount();
  }
  if (field.includes('country')) return ctx.random.country();
  if (field.includes('storagelocation') || field.includes('storage_location')) {
    return storageLocationForEntity(ctx);
  }
  if (field.includes('sourcetype') || field.includes('source_type'))
    return sourceTypeForEntity(ctx);
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
    case 'food':
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
    case 'commerce':
      return ctx.random.productName();
    case 'company':
      return ctx.random.companyName();
    case 'finance':
      return ctx.random.amount();
    case 'place':
      return ctx.random.city();
    case 'vehicle':
      return ctx.random.vehicle();
    case 'book':
      return ctx.random.bookTitle();
    case 'music':
      return ctx.random.musicSong();
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
  if (entityCategoryUsesFood(ctx.entityCategory)) return ctx.random.ingredient();
  if (ctx.entityCategory === 'commerce') return ctx.random.productName();
  if (ctx.entityCategory === 'household') return nameForEntity(ctx);
  return ctx.random.words({ min: 2, max: 5 });
}

function sentenceForEntity(ctx: GenerateValueContext): string {
  if (ctx.entityCategory === 'pantry' || ctx.entityCategory === 'food') {
    return (
      ctx.random.pick([
        'Stored for quick weeknight meals.',
        'Check the quantity before the next shop.',
        'Usually kept in the main pantry.',
      ]) ?? ctx.random.sentence()
    );
  }
  if (ctx.entityCategory === 'commerce') return ctx.random.productDescription();
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
  if (entityCategoryUsesFood(ctx.entityCategory)) {
    const amount = ctx.random.pick(['1', '2', '3', '500', '750']) ?? '1';
    return `${amount} ${unitForEntity(ctx)}`;
  }
  return String(ctx.random.number({ min: 1, max: 20, int: true }));
}

function unitForEntity(ctx: GenerateValueContext): string {
  if (entityCategoryUsesFood(ctx.entityCategory)) {
    return ctx.random.pick(['kg', 'g', 'ml', 'jar', 'tin', 'pack']) ?? 'pack';
  }
  return ctx.random.pick(['item', 'unit', 'pack']) ?? 'item';
}

function storageLocationForEntity(ctx: GenerateValueContext): string {
  if (entityCategoryUsesFood(ctx.entityCategory)) {
    return (
      ctx.random.pick(['Pantry', 'Fridge', 'Freezer', 'Cupboard', 'Allotment shed']) ?? 'Pantry'
    );
  }
  return ctx.random.pick(['Main storage', 'Back room', 'Archive']) ?? 'Main storage';
}

function sourceTypeForEntity(ctx: GenerateValueContext): string {
  if (entityCategoryUsesFood(ctx.entityCategory)) {
    return ctx.random.pick(['manual', 'shopping-list', 'recipe-leftover']) ?? 'manual';
  }
  return ctx.random.pick(['manual', 'imported', 'system']) ?? 'manual';
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
      schema = z.array(zodSchemaForArrayElement(control.element));
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

function zodSchemaForArrayElement(element: PlaygroundArrayElementControl): z.ZodType {
  switch (element.kind) {
    case 'text': {
      let stringSchema = z.string();
      if (element.constraints.min !== undefined)
        stringSchema = stringSchema.min(element.constraints.min);
      if (element.constraints.max !== undefined)
        stringSchema = stringSchema.max(element.constraints.max);
      if (element.constraints.regex)
        stringSchema = stringSchema.regex(new RegExp(element.constraints.regex));
      if (element.constraints.format === 'email') stringSchema = stringSchema.email();
      if (element.constraints.format === 'url') stringSchema = stringSchema.url();
      if (element.constraints.format === 'uuid') stringSchema = stringSchema.uuid();
      if (element.constraints.format === 'datetime') stringSchema = stringSchema.datetime();
      return stringSchema;
    }
    case 'number': {
      let numberSchema = z.number();
      if (element.constraints.int) numberSchema = numberSchema.int();
      if (element.constraints.min !== undefined)
        numberSchema = numberSchema.min(element.constraints.min);
      if (element.constraints.max !== undefined)
        numberSchema = numberSchema.max(element.constraints.max);
      return numberSchema;
    }
    case 'boolean':
      return z.boolean();
    case 'date':
    case 'ref':
      return z.string().min(1);
    case 'literal':
      return z.literal(element.constraints.literalValue);
    case 'enum':
      return element.options.length > 0
        ? z.enum(element.options.map((option) => option.value) as [string, ...string[]])
        : z.string();
    case 'array':
      return z.array(zodSchemaForArrayElement(element.element));
    case 'object':
      return z.object(
        Object.fromEntries(
          element.fields
            .filter((field) => !field.serverDerived && field.kind !== 'unsupported')
            .map((field) => [field.fieldName, zodSchemaForControl(field)]),
        ),
      );
    case 'unsupported':
      return z.unknown();
  }
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
  const hintedCategory = entityCategoryFromFixtureModule(entity.sampleData?.category);
  if (hintedCategory) return hintedCategory;

  const identity = `${entity.typeName} ${entity.tableName}`.toLowerCase();
  const haystack = `${identity} ${entity.description ?? ''}`.toLowerCase();
  const compactIdentity = identity.replace(/[^a-z0-9]/g, '');
  const fieldNames = entity.fields.map((field) => field.fieldName.toLowerCase());

  if (
    matchesAny(compactIdentity, [
      'shoppinglistitem',
      'groceryitem',
      'ingredientitem',
      'pantryitem',
      'fooditem',
      'stockitem',
      'produceitem',
    ])
  ) {
    return 'food';
  }
  if (matchesAny(identity, ['pantry', 'ingredient', 'grocery', 'food', 'stock', 'inventory'])) {
    return 'pantry';
  }
  if (identity.includes('shopping') && entityLooksLikeFoodItem(fieldNames)) return 'food';
  if (matchesAny(identity, ['recipe', 'meal', 'dish', 'menu'])) return 'recipe';
  if (matchesAny(identity, ['todo', 'task', 'checklist', 'issue'])) return 'todo';
  if (matchesAny(identity, ['household', 'family', 'home'])) return 'household';
  if (matchesAny(identity, ['user', 'person', 'member', 'contact', 'assignee'])) return 'person';
  if (matchesAny(identity, ['product', 'order', 'cart', 'catalogue', 'catalog', 'sku'])) {
    return 'commerce';
  }
  if (matchesAny(identity, ['company', 'organisation', 'organization', 'vendor', 'supplier'])) {
    return 'company';
  }
  if (matchesAny(identity, ['invoice', 'payment', 'transaction', 'account', 'budget'])) {
    return 'finance';
  }
  if (matchesAny(identity, ['place', 'address', 'location', 'venue'])) return 'place';
  if (matchesAny(identity, ['vehicle', 'car', 'bike', 'bicycle'])) return 'vehicle';
  if (matchesAny(identity, ['book', 'author', 'publisher'])) return 'book';
  if (matchesAny(identity, ['song', 'album', 'artist', 'playlist', 'track'])) return 'music';
  if (matchesAny(identity, ['list', 'collection'])) return 'list';
  if (matchesAny(haystack, ['pantry', 'ingredient', 'grocery', 'food', 'stock', 'inventory'])) {
    return 'food';
  }
  if (matchesAny(haystack, ['recipe', 'meal', 'dish', 'menu'])) return 'recipe';
  if (matchesAny(haystack, ['household', 'family', 'home'])) return 'household';
  if (matchesAny(haystack, ['product', 'order', 'cart', 'catalogue', 'catalog'])) {
    return 'commerce';
  }
  return 'generic';
}

function entityCategoryFromFixtureModule(moduleName: string | undefined): EntityCategory | null {
  switch (moduleName) {
    case 'person':
      return 'person';
    case 'food':
      return 'food';
    case 'commerce':
      return 'commerce';
    case 'company':
      return 'company';
    case 'finance':
      return 'finance';
    case 'location':
      return 'place';
    case 'vehicle':
      return 'vehicle';
    case 'book':
      return 'book';
    case 'music':
      return 'music';
    default:
      return null;
  }
}

function entityLooksLikeFoodItem(fieldNames: readonly string[]): boolean {
  const hasName = fieldNames.some((field) => field === 'name' || field.endsWith('name'));
  const hasFoodShape = fieldNames.some((field) =>
    matchesAny(field, ['quantity', 'unit', 'ingredient', 'pantry', 'purchased', 'checked']),
  );
  return hasName && hasFoodShape;
}

function entityCategoryUsesFood(category: EntityCategory): boolean {
  return category === 'food' || category === 'pantry' || category === 'recipe';
}

function matchesAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function isNameField(field: string, label: string): boolean {
  return field === 'name' || field.endsWith('name') || label.endsWith(' name');
}

function fieldLooksLike(fieldName: string, needles: readonly string[]): boolean {
  const field = fieldName.toLowerCase();
  return needles.some((needle) => field.includes(needle));
}

function singularFieldName(fieldName: string): string {
  if (fieldName.endsWith('ies')) return `${fieldName.slice(0, -3)}y`;
  if (fieldName.endsWith('s') && fieldName.length > 1) return fieldName.slice(0, -1);
  return fieldName;
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
