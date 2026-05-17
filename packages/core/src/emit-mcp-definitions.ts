/**
 * Pure IR -> MCP-style tool definition document.
 *
 * This is a generated interchange artifact for downstream MCP servers. It does
 * not register tools itself; it gives app code stable names, descriptions, and
 * input schemas derived from the same IR as the rest of the bundle.
 */
import { emit as emitJsonSchema } from './emit-json-schema';
import type { Schema } from './ir';

const GENERATED_BY = '@contexture-generated';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
}

export interface McpDefinitionsDocument {
  $contexture_generated: string;
  version: '1';
  tools: McpToolDefinition[];
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

export function emitMcpDefinitions(schema: Schema, sourcePath?: string): McpDefinitionsDocument {
  const emittedNames = new Map<string, string>();
  const tools = schema.types.map((type) => {
    const name = `submit_${slugToolName(type.name)}`;
    const existing = emittedNames.get(name);
    if (existing) {
      throw new Error(
        `MCP definition name collision: "${existing}" and "${type.name}" both emit "${name}".`,
      );
    }
    emittedNames.set(name, type.name);

    return {
      name,
      description: type.description
        ? `Submit a ${type.name}: ${type.description}`
        : `Submit a ${type.name} object.`,
      inputSchema: emitJsonSchema(schema, type.name, sourcePath),
    };
  });

  return {
    $contexture_generated: generatedMarker(sourcePath),
    version: '1',
    tools,
  };
}
