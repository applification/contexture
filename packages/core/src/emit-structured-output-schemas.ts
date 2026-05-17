/**
 * Pure IR -> provider-neutral structured output definitions.
 *
 * Each definition wraps one Contexture type's JSON Schema with the metadata
 * most LLM SDKs need for strict structured-output calls. Runtime adapters can
 * translate this document to provider-specific response-format shapes.
 */
import { emit as emitJsonSchema } from './emit-json-schema';
import type { Schema } from './ir';

const GENERATED_BY = '@contexture-generated';

export interface StructuredOutputDefinition {
  name: string;
  description: string;
  strict: true;
  schema: object;
}

export interface StructuredOutputSchemasDocument {
  $contexture_generated: string;
  version: '1';
  schemas: StructuredOutputDefinition[];
}

function generatedMarker(sourcePath?: string): string {
  const base = `${GENERATED_BY} - do not edit by hand. Regenerated on every IR save.`;
  return sourcePath ? `${base} Source: ${sourcePath}` : base;
}

export function emitStructuredOutputSchemas(
  schema: Schema,
  sourcePath?: string,
): StructuredOutputSchemasDocument {
  return {
    $contexture_generated: generatedMarker(sourcePath),
    version: '1',
    schemas: schema.types.map((type) => ({
      name: type.name,
      description: type.description ?? `Structured output schema for ${type.name}.`,
      strict: true,
      schema: emitJsonSchema(schema, type.name, sourcePath),
    })),
  };
}
