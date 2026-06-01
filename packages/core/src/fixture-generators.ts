import { faker } from '@faker-js/faker';

export type FixtureValueType = 'string' | 'number' | 'boolean' | 'date' | 'object' | 'unknown';

export interface FixtureGenerator {
  id: string;
  module: string;
  method: string;
  label: string;
  moduleLabel: string;
  valueType: FixtureValueType;
}

export interface FixtureModule {
  id: string;
  label: string;
  generators: FixtureGenerator[];
}

const HIDDEN_MODULES = new Set(['_randomizer', 'definitions', 'rawDefinitions', 'helpers']);
const HIDDEN_METHODS = new Set(['faker']);
const HIDDEN_GENERATORS = new Set(['date.between', 'date.betweens', 'string.fromCharacters']);

const VALUE_TYPE_OVERRIDES: Record<string, FixtureValueType> = {
  'datatype.boolean': 'boolean',
  'date.anytime': 'date',
  'date.between': 'date',
  'date.birthdate': 'date',
  'date.future': 'date',
  'date.past': 'date',
  'date.recent': 'date',
  'date.soon': 'date',
  'finance.amount': 'string',
  'location.latitude': 'number',
  'location.longitude': 'number',
  'number.bigInt': 'number',
  'number.float': 'number',
  'number.int': 'number',
};

const MODULE_VALUE_TYPES: Record<string, FixtureValueType> = {
  airline: 'string',
  animal: 'string',
  book: 'string',
  color: 'string',
  commerce: 'string',
  company: 'string',
  database: 'string',
  finance: 'string',
  food: 'string',
  git: 'string',
  hacker: 'string',
  internet: 'string',
  lorem: 'string',
  music: 'string',
  person: 'string',
  phone: 'string',
  science: 'string',
  string: 'string',
  system: 'string',
  vehicle: 'string',
  word: 'string',
};

const LABEL_OVERRIDES: Record<string, string> = {
  'commerce.productName': 'Product name',
  'datatype.boolean': 'True or false',
  'food.dish': 'Dish',
  'food.ingredient': 'Ingredient',
  'internet.email': 'Email address',
  'internet.url': 'URL',
  'location.streetAddress': 'Street address',
  'person.fullName': 'Full name',
  'phone.number': 'Phone number',
  'string.uuid': 'UUID',
};

export function listFixtureModules(): FixtureModule[] {
  const root = faker as unknown as Record<string, unknown>;
  return Object.entries(root)
    .filter(([moduleName, moduleValue]) => isPublicFakerModule(moduleName, moduleValue))
    .map(([moduleName, moduleValue]) => fixtureModuleFrom(moduleName, moduleValue))
    .filter((module) => module.generators.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function listFixtureGenerators(options: { valueType?: FixtureValueType } = {}) {
  const generators = listFixtureModules().flatMap((module) => module.generators);
  if (!options.valueType) return generators;
  return generators.filter(
    (generator) => generator.valueType === options.valueType || generator.valueType === 'unknown',
  );
}

export function fixtureGeneratorById(id: string): FixtureGenerator | undefined {
  return listFixtureGenerators().find((generator) => generator.id === id);
}

export function generateFixtureValue(id: string): unknown {
  const [moduleName, methodName] = id.split('.');
  if (!moduleName || !methodName) return undefined;
  const moduleValue = (faker as unknown as Record<string, Record<string, unknown>>)[moduleName];
  const method = moduleValue?.[methodName];
  if (typeof method !== 'function') return undefined;
  try {
    return method.call(moduleValue);
  } catch {
    return undefined;
  }
}

function fixtureModuleFrom(moduleName: string, moduleValue: unknown): FixtureModule {
  const moduleRecord = moduleValue as Record<string, unknown>;
  const generators = Object.entries(moduleRecord)
    .filter(([methodName, methodValue]) => isPublicFakerMethod(moduleName, methodName, methodValue))
    .map(([methodName]) => fixtureGeneratorFrom(moduleName, methodName))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    id: moduleName,
    label: labelFromIdentifier(moduleName),
    generators,
  };
}

function fixtureGeneratorFrom(moduleName: string, methodName: string): FixtureGenerator {
  const id = `${moduleName}.${methodName}`;
  return {
    id,
    module: moduleName,
    method: methodName,
    label: LABEL_OVERRIDES[id] ?? labelFromIdentifier(methodName),
    moduleLabel: labelFromIdentifier(moduleName),
    valueType: VALUE_TYPE_OVERRIDES[id] ?? MODULE_VALUE_TYPES[moduleName] ?? 'unknown',
  };
}

function isPublicFakerModule(moduleName: string, moduleValue: unknown): boolean {
  return (
    !HIDDEN_MODULES.has(moduleName) &&
    !moduleName.startsWith('_') &&
    typeof moduleValue === 'object' &&
    moduleValue !== null
  );
}

function isPublicFakerMethod(
  moduleName: string,
  methodName: string,
  methodValue: unknown,
): boolean {
  return (
    !HIDDEN_METHODS.has(methodName) &&
    !HIDDEN_GENERATORS.has(`${moduleName}.${methodName}`) &&
    !methodName.startsWith('_') &&
    typeof methodValue === 'function'
  );
}

function labelFromIdentifier(identifier: string): string {
  const spaced = identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
