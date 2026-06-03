import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createContextureMcpServer } from '../src/mcp-server';

async function fixtureIr(schema: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'contexture-mcp-'));
  const irPath = join(dir, 'packages/contexture/app.contexture.json');
  await mkdir(join(dir, 'packages/contexture/.contexture'), { recursive: true });
  await writeFile(irPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
  return irPath;
}

async function fixtureBareIr(schema: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'contexture-mcp-bare-'));
  const irPath = join(dir, 'bare.contexture.json');
  await writeFile(irPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
  return irPath;
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const server = createContextureMcpServer();
  const client = new Client({ name: 'contexture-mcp-test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

describe('Contexture MCP server', () => {
  it('lists inspect, validate, typed mutation, emit, drift, and guidance tools', async () => {
    await withClient(async (client) => {
      const { tools } = await client.listTools();
      expect(tools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'inspect_contexture',
            annotations: expect.objectContaining({
              readOnlyHint: true,
              destructiveHint: false,
            }),
          }),
          expect.objectContaining({
            name: 'validate_contexture',
            annotations: expect.objectContaining({
              readOnlyHint: true,
              destructiveHint: false,
            }),
          }),
          expect.objectContaining({
            name: 'apply_contexture_op',
            description: expect.stringContaining('{ irPath, op }'),
            annotations: expect.objectContaining({
              readOnlyHint: false,
              destructiveHint: true,
            }),
          }),
          expect.objectContaining({
            name: 'emit_contexture',
            annotations: expect.objectContaining({
              readOnlyHint: false,
              destructiveHint: false,
            }),
          }),
          expect.objectContaining({
            name: 'check_contexture_drift',
            annotations: expect.objectContaining({
              readOnlyHint: true,
              destructiveHint: false,
            }),
          }),
          expect.objectContaining({
            name: 'add_field',
            description: expect.stringContaining('Include irPath with this typed tool call'),
            annotations: expect.objectContaining({
              readOnlyHint: false,
              destructiveHint: true,
            }),
          }),
          expect.objectContaining({
            name: 'rename_type',
            description: expect.stringContaining(
              'do not wrap it in the generic apply_contexture_op',
            ),
            annotations: expect.objectContaining({
              readOnlyHint: false,
              destructiveHint: true,
            }),
          }),
          expect.objectContaining({
            name: 'add_index',
            annotations: expect.objectContaining({
              readOnlyHint: false,
              destructiveHint: true,
            }),
          }),
          expect.objectContaining({
            name: 'get_contexture_integration_guidance',
            annotations: expect.objectContaining({
              readOnlyHint: true,
              destructiveHint: false,
            }),
          }),
        ]),
      );
    });
  });

  it('inspects a .contexture.json file through @contexture/core', async () => {
    const irPath = await fixtureIr({
      version: '1',
      metadata: { name: 'Garden' },
      types: [
        {
          kind: 'object',
          name: 'Plot',
          table: true,
          fields: [{ name: 'name', type: { kind: 'string' } }],
        },
      ],
    });

    await withClient(async (client) => {
      const result = await client.callTool({
        name: 'inspect_contexture',
        arguments: { irPath },
      });

      expect(result.structuredContent).toMatchObject({
        path: irPath,
        version: '1',
        name: 'Garden',
        typeCount: 1,
        types: [
          {
            name: 'Plot',
            kind: 'object',
            table: true,
            tableName: 'plot',
            fields: [{ name: 'name', type: 'string' }],
          },
        ],
        generatedTargets: expect.arrayContaining([
          expect.objectContaining({
            kind: 'convex',
            path: expect.stringContaining('convex/schema.ts'),
            enabled: true,
          }),
          expect.objectContaining({
            kind: 'convex-validators',
            path: expect.stringContaining('convex/validators.ts'),
            enabled: true,
          }),
        ]),
        agent: expect.objectContaining({
          preferredMutationTools: expect.arrayContaining(['add_field', 'rename_type', 'add_index']),
        }),
      });
    });
  });

  it('typed add_type accepts a core-op-style type envelope', async () => {
    const irPath = await fixtureIr({
      version: '1',
      metadata: { name: 'Garden' },
      types: [],
    });

    await withClient(async (client) => {
      const result = await client.callTool({
        name: 'add_type',
        arguments: {
          irPath,
          type: { kind: 'enum', name: 'Season', values: [{ value: 'spring' }] },
        },
      });

      expect(result.structuredContent).toMatchObject({
        path: irPath,
        applied: true,
        opKind: 'add_type',
      });

      const updatedIr = JSON.parse(await readFile(irPath, 'utf8')) as {
        types: Array<{ kind: string; name: string }>;
      };
      expect(updatedIr.types).toEqual([expect.objectContaining({ kind: 'enum', name: 'Season' })]);
    });
  });

  it('includes indexes, descriptions, output config, and generated paths in inspect output', async () => {
    const irPath = await fixtureIr({
      version: '1',
      metadata: { name: 'Garden' },
      outputs: {
        aiPipeline: {
          mcpDefinitions: { enabled: true },
        },
      },
      types: [
        {
          kind: 'object',
          name: 'Plot',
          description: 'A rentable garden plot.',
          table: true,
          tableName: 'plots',
          fields: [
            { name: 'name', description: 'Public plot name.', type: { kind: 'string' } },
            { name: 'growerId', type: { kind: 'string' } },
          ],
          indexes: [{ name: 'by_grower', fields: ['growerId'] }],
        },
      ],
    });

    await withClient(async (client) => {
      const result = await client.callTool({
        name: 'inspect_contexture',
        arguments: { irPath },
      });

      expect(result.structuredContent).toMatchObject({
        outputConfig: expect.objectContaining({
          aiPipeline: expect.objectContaining({
            mcpDefinitions: { enabled: true },
          }),
        }),
        types: [
          expect.objectContaining({
            name: 'Plot',
            description: 'A rentable garden plot.',
            tableName: 'plots',
            indexes: [{ name: 'by_grower', fields: ['growerId'] }],
            fields: [
              expect.objectContaining({
                name: 'name',
                description: 'Public plot name.',
              }),
              expect.objectContaining({ name: 'growerId' }),
            ],
          }),
        ],
        generatedTargets: expect.arrayContaining([
          expect.objectContaining({
            kind: 'mcp-definitions',
            enabled: true,
            path: expect.stringContaining('.contexture/mcp-definitions.json'),
          }),
        ]),
      });
    });
  });

  it('allows read-only inspection of legacy bare .contexture.json files', async () => {
    const irPath = await fixtureBareIr({
      version: '1',
      types: [{ kind: 'object', name: 'Note', fields: [] }],
    });

    await withClient(async (client) => {
      const result = await client.callTool({
        name: 'inspect_contexture',
        arguments: { irPath },
      });

      expect(result.structuredContent).toMatchObject({
        path: irPath,
        types: [expect.objectContaining({ name: 'Note' })],
      });
    });
  });

  it('reports non-.contexture.json validation paths as validation failures', async () => {
    const irPath = await fixtureIr({ version: '1', types: [] });
    const badPath = irPath.replace(/\.contexture\.json$/, '.schema.json');
    await writeFile(badPath, '{}\n', 'utf8');

    await withClient(async (client) => {
      const result = await client.callTool({
        name: 'validate_contexture',
        arguments: { irPath: badPath },
      });

      expect(result.structuredContent).toMatchObject({
        path: badPath,
        valid: false,
        errors: [expect.objectContaining({ message: expect.stringContaining('.contexture.json') })],
      });
    });
  });

  it('validates structural and semantic issues without the desktop app', async () => {
    const irPath = await fixtureIr({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Order',
          fields: [{ name: 'buyer', type: { kind: 'ref', typeName: 'Buyer' } }],
        },
        { kind: 'enum', name: 'Status', values: [] },
      ],
    });

    await withClient(async (client) => {
      const result = await client.callTool({
        name: 'validate_contexture',
        arguments: { irPath },
      });

      expect(result.structuredContent).toMatchObject({
        path: irPath,
        valid: false,
        errors: expect.arrayContaining([
          expect.objectContaining({
            code: 'unresolved_ref',
            path: 'types.0.fields.0.type',
          }),
          expect.objectContaining({
            code: 'enum_empty',
            path: 'types.1.values',
          }),
        ]),
      });
    });
  });

  it('reports structural validation errors as data instead of requiring desktop IPC', async () => {
    const irPath = await fixtureIr({
      version: '1',
      types: [{ kind: 'object', name: '' }],
    });

    await withClient(async (client) => {
      const result = await client.callTool({
        name: 'validate_contexture',
        arguments: { irPath },
      });

      expect(result.structuredContent).toMatchObject({
        path: irPath,
        valid: false,
        errors: [
          expect.objectContaining({
            path: 'types.0.name',
            message: expect.any(String),
          }),
          expect.objectContaining({
            path: 'types.0.fields',
            message: expect.any(String),
          }),
        ],
      });
    });
  });

  it('validates bundled stdlib-qualified refs through the CLI MCP server', async () => {
    const irPath = await fixtureIr({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Grower',
          fields: [{ name: 'email', type: { kind: 'ref', typeName: 'common.Email' } }],
        },
      ],
    });

    await withClient(async (client) => {
      const result = await client.callTool({
        name: 'validate_contexture',
        arguments: { irPath },
      });

      expect(result.structuredContent).toMatchObject({
        path: irPath,
        valid: true,
        errors: [],
      });
    });
  });

  it('reports semantic warnings without invalidating MCP validation', async () => {
    const irPath = await fixtureIr({
      version: '1',
      types: [
        { kind: 'object', name: 'Household', table: true, fields: [] },
        {
          kind: 'object',
          name: 'Recipe',
          table: true,
          fields: [{ name: 'householdId', type: { kind: 'ref', typeName: 'Household' } }],
        },
        {
          kind: 'object',
          name: 'MealPlanMeal',
          table: true,
          fields: [
            { name: 'householdId', type: { kind: 'ref', typeName: 'Household' } },
            { name: 'recipeId', type: { kind: 'ref', typeName: 'Recipe' } },
          ],
        },
      ],
    });

    await withClient(async (client) => {
      const result = await client.callTool({
        name: 'validate_contexture',
        arguments: { irPath },
      });

      expect(result.structuredContent).toMatchObject({
        path: irPath,
        valid: true,
        errors: [],
        warnings: [
          expect.objectContaining({
            code: 'relationship_ownership_scope_missing',
            severity: 'warning',
          }),
        ],
      });
    });
  });

  it('applies typed per-op MCP tools without requiring generic op JSON', async () => {
    const irPath = await fixtureIr({
      version: '1',
      metadata: { name: 'Garden' },
      types: [
        {
          kind: 'object',
          name: 'Plot',
          table: true,
          fields: [{ name: 'name', type: { kind: 'string' } }],
        },
      ],
    });

    await withClient(async (client) => {
      const result = await client.callTool({
        name: 'add_field',
        arguments: {
          irPath,
          typeName: 'Plot',
          field: { name: 'size', type: { kind: 'number', int: true } },
        },
      });

      expect(result.structuredContent).toMatchObject({
        path: irPath,
        applied: true,
        opKind: 'add_field',
        typeCount: 1,
      });

      const updatedIr = JSON.parse(await readFile(irPath, 'utf8')) as {
        types: Array<{ name: string; fields?: Array<{ name: string }> }>;
      };
      expect(updatedIr.types[0]?.fields?.map((field) => field.name)).toEqual(['name', 'size']);
    });
  });

  it('returns structured failures from typed per-op MCP tools', async () => {
    const irPath = await fixtureIr({
      version: '1',
      types: [{ kind: 'object', name: 'Plot', fields: [] }],
    });

    await withClient(async (client) => {
      const result = await client.callTool({
        name: 'add_field',
        arguments: {
          irPath,
          typeName: 'Missing',
          field: { name: 'size', type: { kind: 'number' } },
        },
      });

      expect(result.structuredContent).toMatchObject({
        path: irPath,
        applied: false,
        opKind: 'add_field',
        error: expect.stringContaining('Missing'),
      });
    });
  });

  it('provides repo integration guidance for MCP-capable agents', async () => {
    const irPath = await fixtureIr({
      version: '1',
      types: [{ kind: 'object', name: 'Plot', table: true, fields: [] }],
    });

    await withClient(async (client) => {
      const result = await client.callTool({
        name: 'get_contexture_integration_guidance',
        arguments: { irPath },
      });

      expect(result.structuredContent).toMatchObject({
        path: irPath,
        sourceOfTruth: '.contexture.json',
        safeLoop: [
          'inspect_contexture',
          'validate_contexture',
          'emit_contexture',
          'check_contexture_drift',
        ],
        prompt: expect.stringContaining('Use the Contexture MCP server'),
        rules: expect.arrayContaining([
          expect.stringContaining('Do not hand-edit generated files'),
          expect.stringContaining('Prefer typed op tools'),
        ]),
      });
    });
  });

  it('returns structured failures for malformed mutation ops', async () => {
    const irPath = await fixtureIr({
      version: '1',
      metadata: { name: 'Garden' },
      types: [
        {
          kind: 'object',
          name: 'Plot',
          fields: [{ name: 'name', type: { kind: 'string' } }],
        },
      ],
    });

    await withClient(async (client) => {
      const result = await client.callTool({
        name: 'apply_contexture_op',
        arguments: {
          irPath,
          op: { kind: 'add_field', typeName: 'Plot' },
        },
      });

      expect(result.structuredContent).toMatchObject({
        path: irPath,
        applied: false,
        opKind: 'add_field',
        error: expect.stringContaining('invalid op'),
      });
      expect((result.structuredContent as { error?: string }).error).toContain('field');
    });
  });

  it('rejects update_type identity changes at the shared op boundary', async () => {
    const irPath = await fixtureIr({
      version: '1',
      types: [{ kind: 'object', name: 'Plot', fields: [] }],
    });

    await withClient(async (client) => {
      const result = await client.callTool({
        name: 'apply_contexture_op',
        arguments: {
          irPath,
          op: { kind: 'update_type', name: 'Plot', patch: { name: 'Garden' } },
        },
      });

      expect(result.structuredContent).toMatchObject({
        path: irPath,
        applied: false,
        opKind: 'update_type',
        error: expect.stringContaining('rename_type'),
      });
    });
  });

  it('applies an op, emits generated files, and reports generated drift', async () => {
    const irPath = await fixtureIr({
      version: '1',
      metadata: { name: 'Garden' },
      types: [
        {
          kind: 'object',
          name: 'Plot',
          fields: [{ name: 'name', type: { kind: 'string' } }],
        },
      ],
    });

    await withClient(async (client) => {
      const applyResult = await client.callTool({
        name: 'apply_contexture_op',
        arguments: {
          irPath,
          op: {
            kind: 'add_field',
            typeName: 'Plot',
            field: { name: 'size', type: { kind: 'number', int: true } },
          },
        },
      });

      expect(applyResult.structuredContent).toMatchObject({
        path: irPath,
        applied: true,
        opKind: 'add_field',
      });

      const updatedIr = JSON.parse(await readFile(irPath, 'utf8')) as {
        types: Array<{ name: string; fields?: Array<{ name: string }> }>;
      };
      expect(updatedIr.types[0]?.fields?.map((field) => field.name)).toEqual(['name', 'size']);

      const cleanResult = await client.callTool({
        name: 'check_contexture_drift',
        arguments: { irPath },
      });
      expect(cleanResult.structuredContent).toMatchObject({
        path: irPath,
        clean: true,
        checked: 7,
        drift: [],
      });

      await writeFile(
        irPath.replace(/\.contexture\.json$/, '.schema.json'),
        '{"stale":true}\n',
        'utf8',
      );

      const driftResult = await client.callTool({
        name: 'check_contexture_drift',
        arguments: { irPath },
      });
      expect(driftResult.structuredContent).toMatchObject({
        path: irPath,
        clean: false,
        drift: [
          expect.objectContaining({
            path: irPath.replace(/\.contexture\.json$/, '.schema.json'),
            status: 'drifted',
          }),
        ],
      });

      const emitResult = await client.callTool({
        name: 'emit_contexture',
        arguments: { irPath },
      });
      expect(emitResult.structuredContent).toMatchObject({
        path: irPath,
        emitted: expect.arrayContaining([irPath.replace(/\.contexture\.json$/, '.schema.json')]),
      });

      const cleanAgainResult = await client.callTool({
        name: 'check_contexture_drift',
        arguments: { irPath },
      });
      expect(cleanAgainResult.structuredContent).toMatchObject({
        clean: true,
        drift: [],
      });
    });
  });

  it('applies an op to an arbitrary bundle directory', async () => {
    const irPath = await fixtureBareIr({
      version: '1',
      types: [{ kind: 'object', name: 'Note', fields: [] }],
    });
    await mkdir(join(irPath, '..', '.contexture'), { recursive: true });

    await withClient(async (client) => {
      const applyResult = await client.callTool({
        name: 'apply_contexture_op',
        arguments: {
          irPath,
          op: {
            kind: 'add_field',
            typeName: 'Note',
            field: { name: 'body', type: { kind: 'string' } },
          },
        },
      });

      expect(applyResult.structuredContent).toMatchObject({
        path: irPath,
        applied: true,
        opKind: 'add_field',
      });
      await expect(
        readFile(join(irPath, '..', 'schema', 'bare.schema.ts'), 'utf8'),
      ).resolves.toContain('body');
    });
  });

  it('preserves relationship metadata through the typed add_field MCP tool', async () => {
    const irPath = await fixtureIr({
      version: '1',
      types: [
        { kind: 'object', name: 'Household', table: true, fields: [] },
        {
          kind: 'object',
          name: 'Recipe',
          table: true,
          fields: [{ name: 'householdId', type: { kind: 'ref', typeName: 'Household' } }],
        },
        {
          kind: 'object',
          name: 'MealPlanMeal',
          table: true,
          fields: [{ name: 'householdId', type: { kind: 'ref', typeName: 'Household' } }],
        },
      ],
    });

    await withClient(async (client) => {
      const result = await client.callTool({
        name: 'add_field',
        arguments: {
          irPath,
          typeName: 'MealPlanMeal',
          field: {
            name: 'recipeId',
            type: {
              kind: 'ref',
              typeName: 'Recipe',
              relationship: {
                onDelete: 'restrict',
                ownership: { scopeField: 'householdId' },
              },
            },
          },
        },
      });

      expect(result.structuredContent).toMatchObject({
        path: irPath,
        applied: true,
        opKind: 'add_field',
      });
      const updatedIr = JSON.parse(await readFile(irPath, 'utf8')) as {
        types: Array<{ name: string; fields?: Array<{ name: string; type: unknown }> }>;
      };
      const mealPlanMeal = updatedIr.types.find((type) => type.name === 'MealPlanMeal');
      expect(mealPlanMeal?.fields?.find((field) => field.name === 'recipeId')?.type).toEqual({
        kind: 'ref',
        typeName: 'Recipe',
        relationship: {
          onDelete: 'restrict',
          ownership: { scopeField: 'householdId' },
        },
      });
      await expect(
        readFile(join(irPath, '..', 'convex', 'relationships.ts'), 'utf8'),
      ).resolves.toContain('"onDelete": "restrict"');
    });
  });

  it('returns generated drift preflight failures as structured apply results', async () => {
    const irPath = await fixtureIr({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Plot',
          fields: [{ name: 'name', type: { kind: 'string' } }],
        },
      ],
    });

    await withClient(async (client) => {
      await client.callTool({
        name: 'apply_contexture_op',
        arguments: {
          irPath,
          op: {
            kind: 'add_field',
            typeName: 'Plot',
            field: { name: 'size', type: { kind: 'number', int: true } },
          },
        },
      });

      const schemaTsPath = irPath.replace(/\.contexture\.json$/, '.schema.ts');
      await writeFile(schemaTsPath, '// hand edit\n', 'utf8');

      const result = await client.callTool({
        name: 'apply_contexture_op',
        arguments: {
          irPath,
          op: {
            kind: 'add_field',
            typeName: 'Plot',
            field: { name: 'soil', type: { kind: 'string' } },
          },
        },
      });

      expect(result.structuredContent).toMatchObject({
        path: irPath,
        applied: false,
        opKind: 'add_field',
        error: expect.stringContaining('Generated files have drifted'),
      });
      expect(result.isError).not.toBe(true);

      const updatedIr = JSON.parse(await readFile(irPath, 'utf8')) as {
        types: Array<{ fields?: Array<{ name: string }> }>;
      };
      expect(updatedIr.types[0]?.fields?.map((field) => field.name)).toEqual(['name', 'size']);
    });
  });

  it('materializes bundle sidecars for write-capable tools against legacy bare IR paths', async () => {
    const irPath = await fixtureBareIr({
      version: '1',
      types: [{ kind: 'object', name: 'Note', fields: [] }],
    });

    await withClient(async (client) => {
      const emitResult = await client.callTool({
        name: 'emit_contexture',
        arguments: { irPath },
      });
      expect(emitResult.structuredContent).toMatchObject({
        path: irPath,
        emitted: expect.arrayContaining([join(irPath, '..', 'schema', 'bare.schema.ts')]),
      });
      await expect(
        readFile(join(irPath, '..', '.contexture/emitted.json'), 'utf8'),
      ).resolves.toContain('bare.schema.ts');

      const applyResult = await client.callTool({
        name: 'apply_contexture_op',
        arguments: {
          irPath,
          op: {
            kind: 'add_field',
            typeName: 'Note',
            field: { name: 'body', type: { kind: 'string' } },
          },
        },
      });
      expect(applyResult.structuredContent).toMatchObject({
        path: irPath,
        applied: true,
        opKind: 'add_field',
      });
      await expect(
        readFile(join(irPath, '..', 'schema', 'bare.schema.ts'), 'utf8'),
      ).resolves.toContain('body');
    });
  });
});
