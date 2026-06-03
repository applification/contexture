/**
 * Pure IR -> AI tool schema helper definitions.
 *
 * This opt-in target emits one JSON Schema function/tool definition per
 * Contexture type. It is intentionally provider-neutral: downstream apps can
 * adapt the `parameters` object into OpenAI, Anthropic, MCP, or local agent
 * tool registries without Contexture choosing a runtime.
 */
import { fieldAllowsWriter } from './derivation';
import { emit as emitJsonSchema } from './emit-json-schema';
import type { Schema } from './ir';

const GENERATED_BY = '@contexture-generated';

export interface AiToolSchemaDefinition {
  name: string;
  description: string;
  parameters: object;
}

export interface AiToolSchemasDocument {
  $contexture_generated: string;
  version: '1';
  tools: AiToolSchemaDefinition[];
}

function generatedMarker(sourcePath?: string): string {
  const base = `${GENERATED_BY} - do not edit by hand. Regenerated on every IR save.`;
  return sourcePath ? `${base} Source: ${sourcePath}` : base;
}

function slugToolName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export function emitAiToolSchemas(schema: Schema, sourcePath?: string): AiToolSchemasDocument {
  const toolNames = new Map<string, string>();
  const tools = schema.types.map((type) => {
    const name = `submit_${slugToolName(type.name)}`;
    const existing = toolNames.get(name);
    if (existing) {
      throw new Error(
        `AI tool schema name collision: "${existing}" and "${type.name}" both emit "${name}".`,
      );
    }
    toolNames.set(name, type.name);

    return {
      name,
      description: type.description
        ? `Submit a ${type.name}: ${type.description}`
        : `Submit a ${type.name} object.`,
      parameters: emitJsonSchema(schema, type.name, sourcePath, {
        omitField: (_type, field) => !fieldAllowsWriter(field, 'agent'),
      }),
    };
  });

  return {
    $contexture_generated: generatedMarker(sourcePath),
    version: '1',
    tools,
  };
}
