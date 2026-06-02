/**
 * Desktop stdlib registry adapters.
 *
 * The canonical data lives in `@contexture/stdlib/registry`. This module
 * converts those namespace-indexed IR sidecars into the small lookup surfaces
 * used by core validation, emitters, and chat prompts.
 */

import type { StdlibRuntimeModule } from '@contexture/core/generated-targets';
import type { Schema, TypeDef } from '@contexture/core/ir';
import type { StdlibCatalog } from '@contexture/core/semantic-validation';
import { IR_BY_NAMESPACE, NAMESPACES, type Namespace } from '@contexture/stdlib/registry';
import type { StdlibRegistry as SystemPromptStdlibRegistry } from './system-prompt';

/**
 * Desktop-facing stdlib registry. Identical shape to the core
 * `StdlibCatalog` so callers can pass it straight into `apply()` and
 * `checkSemantic()`.
 */
export type StdlibRegistry = StdlibCatalog;

export const STDLIB_NAMESPACES = NAMESPACES;

export interface StdlibTypeOption {
  namespace: Namespace;
  name: string;
  qualifiedName: string;
  description: string;
  example: string;
}

export function buildStdlibRegistry(): StdlibRegistry {
  const typeNamesByNamespace: Record<string, ReadonlySet<string>> = Object.fromEntries(
    NAMESPACES.map((ns) => [ns, new Set(IR_BY_NAMESPACE[ns].types.map((t) => t.name))]),
  );

  return {
    namespaces: NAMESPACES,
    hasType: (namespace, typeName) => typeNamesByNamespace[namespace]?.has(typeName) ?? false,
  };
}

/** Singleton for app runtime; tests build their own via `buildStdlibRegistry`. */
export const STDLIB_REGISTRY: StdlibRegistry = buildStdlibRegistry();

export const STDLIB_RUNTIME_MODULES: readonly StdlibRuntimeModule[] = NAMESPACES.map(
  (namespace) => ({
    namespace,
    schema: IR_BY_NAMESPACE[namespace] as Schema,
  }),
);

export function buildStdlibTypeDefinitions(): ReadonlyMap<string, TypeDef> {
  const types = new Map<string, TypeDef>();
  for (const ns of NAMESPACES) {
    for (const type of IR_BY_NAMESPACE[ns].types) {
      types.set(`${ns}.${type.name}`, type as TypeDef);
    }
  }
  return types;
}

export const STDLIB_TYPE_DEFINITIONS = buildStdlibTypeDefinitions();

/**
 * Adapter for the system-prompt builder's registry shape, which expects a flat
 * `entries` array rather than the namespace lookup surface.
 */
export function buildSystemPromptStdlibRegistry(): SystemPromptStdlibRegistry {
  const entries: SystemPromptStdlibRegistry['entries'] = [];
  for (const ns of NAMESPACES) {
    for (const t of IR_BY_NAMESPACE[ns].types) {
      const description =
        (typeof t.description === 'string' && t.description) ||
        IR_BY_NAMESPACE[ns].metadata?.description ||
        '';
      entries.push({ namespace: ns, name: t.name, description });
    }
  }
  return { entries };
}

/** System-prompt registry singleton — same data as STDLIB_REGISTRY, flat shape. */
export const SYSTEM_PROMPT_STDLIB: SystemPromptStdlibRegistry = buildSystemPromptStdlibRegistry();

export function buildStdlibTypeOptions(): StdlibTypeOption[] {
  return NAMESPACES.flatMap((ns) =>
    IR_BY_NAMESPACE[ns].types.map((type) => ({
      namespace: ns,
      name: type.name,
      qualifiedName: `${ns}.${type.name}`,
      description:
        (typeof type.description === 'string' && type.description) ||
        IR_BY_NAMESPACE[ns].metadata?.description ||
        '',
      example: stdlibExample(type),
    })),
  );
}

export const STDLIB_TYPE_OPTIONS = buildStdlibTypeOptions();

export type { Namespace };

interface StdlibExampleType {
  kind: string;
  name: string;
  fields?: readonly {
    name: string;
    optional?: boolean;
    type: { kind: string };
  }[];
  values?: readonly { value: string }[];
  jsonSchema?: { type?: unknown };
}

function stdlibExample(type: StdlibExampleType): string {
  const namedExample = stdlibNamedExample(type.name);
  if (namedExample) return namedExample;

  if (type.kind === 'object' && type.fields) {
    const fields = Object.fromEntries(
      type.fields
        .filter((field) => field.optional !== true)
        .slice(0, 3)
        .map((field) => [field.name, exampleForFieldType(field.type.kind)]),
    );
    return JSON.stringify(fields, null, 2);
  }
  if (type.kind === 'enum') return type.values?.[0]?.value ?? 'value';
  if (type.kind !== 'raw') return type.name;

  return type.jsonSchema?.type === 'number' || type.jsonSchema?.type === 'integer' ? '1' : 'value';
}

function stdlibNamedExample(typeName: string): string | undefined {
  switch (typeName) {
    case 'Email':
      return 'user@example.com';
    case 'URL':
      return 'https://example.com';
    case 'UUID':
      return '550e8400-e29b-41d4-a716-446655440000';
    case 'ISODate':
      return '2026-05-28';
    case 'ISODateTime':
      return '2026-05-28T12:00:00Z';
    case 'Slug':
      return 'my-record';
    case 'CountryCode':
      return 'GB';
    case 'CurrencyCode':
      return 'GBP';
    case 'PhoneNumber':
      return '+447700900123';
    case 'PositiveInt':
      return '1';
    case 'PositiveNumber':
      return '1.5';
    default:
      return undefined;
  }
}

function exampleForFieldType(kind: string): string | number | boolean {
  if (kind === 'number') return 1;
  if (kind === 'boolean') return true;
  return 'value';
}
