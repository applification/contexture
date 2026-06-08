import { buildDomainBrief } from '@contexture/core/domain-brief';
import { describeEvolutionPolicy } from '@contexture/core/evolution-policy';
import type { Schema, TypeDef } from '@contexture/core/ir';
import { analyzeModelingHints } from '@contexture/core/modeling-hints';
import { z } from 'zod';
import type { OpToolDescriptor } from '../ops';

export type GetCurrentSchema = () => Schema | null;

export function createSchemaReadTools(getCurrentSchema: GetCurrentSchema): OpToolDescriptor[] {
  return [
    {
      name: 'inspect_current_schema',
      description:
        'Inspect the current in-memory Contexture schema. Returns a compact summary by default; set includeSchema true only when the full IR is necessary.',
      inputSchema: {
        includeSchema: z.boolean().optional(),
      },
      handler: async ({ includeSchema }) => {
        const schema = readSchema(getCurrentSchema);
        return {
          ...schemaSummary(schema),
          ...(includeSchema === true ? { schema } : {}),
        };
      },
    },
    {
      name: 'list_types',
      description:
        'List all current Contexture types with compact metadata. Use this before choosing targeted get_type calls.',
      inputSchema: {},
      handler: async () => {
        const schema = readSchema(getCurrentSchema);
        return {
          typeCount: schema.types.length,
          types: schema.types.map(typeListItem),
        };
      },
    },
    {
      name: 'get_type',
      description:
        'Get the exact current definition for one Contexture type by name, including fields, values, variants, table flags, indexes, and invariants.',
      inputSchema: {
        typeName: z.string().min(1),
      },
      handler: async ({ typeName }) => {
        const schema = readSchema(getCurrentSchema);
        const type = schema.types.find((item) => item.name === typeName);
        if (!type) {
          return {
            found: false,
            typeName,
            availableTypes: schema.types.map((item) => item.name),
          };
        }
        return {
          found: true,
          type,
        };
      },
    },
    {
      name: 'inspect_domain_brief',
      description:
        'Inspect unresolved domain-model decisions and declared domain contracts for the current schema.',
      inputSchema: {},
      handler: async () => {
        const schema = readSchema(getCurrentSchema);
        return {
          evolutionPolicy: describeEvolutionPolicy(schema),
          brief: buildDomainBrief(schema),
        };
      },
    },
  ];
}

function readSchema(getCurrentSchema: GetCurrentSchema): Schema {
  return getCurrentSchema() ?? { version: '1', types: [] };
}

function schemaSummary(schema: Schema): Record<string, unknown> {
  return {
    version: schema.version,
    name: schema.metadata?.name,
    evolutionPolicy: describeEvolutionPolicy(schema),
    typeCount: schema.types.length,
    types: schema.types.map(typeListItem),
    imports: schema.imports ?? [],
    outputs: schema.outputs,
    modelingHints: analyzeModelingHints(schema),
  };
}

function typeListItem(type: TypeDef): Record<string, unknown> {
  return {
    name: type.name,
    kind: type.kind,
    description: type.description,
    ...(type.kind === 'object'
      ? {
          table: type.table === true,
          fieldCount: type.fields.length,
          fields: type.fields.map((field) => field.name),
          indexes: type.indexes?.map((index) => index.name) ?? [],
          invariants: type.invariants?.map((invariant) => invariant.name) ?? [],
        }
      : {}),
    ...(type.kind === 'enum'
      ? {
          valueCount: type.values.length,
          values: type.values.map((value) => value.value),
        }
      : {}),
    ...(type.kind === 'discriminatedUnion'
      ? {
          discriminator: type.discriminator,
          variants: type.variants,
        }
      : {}),
  };
}
