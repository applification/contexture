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
  await mkdir(join(dir, 'packages/contexture'), { recursive: true });
  await writeFile(irPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
  return irPath;
}

async function fixtureScratchIr(schema: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'contexture-mcp-scratch-'));
  const irPath = join(dir, 'scratch.contexture.json');
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
  it('lists inspect, validate, mutation, emit, and drift tools', async () => {
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
            fields: [{ name: 'name', type: 'string' }],
          },
        ],
      });
    });
  });

  it('allows read-only inspection of scratch .contexture.json files', async () => {
    const irPath = await fixtureScratchIr({
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
        checked: 5,
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

  it('rejects write-capable tools for scratch IR paths', async () => {
    const irPath = await fixtureScratchIr({
      version: '1',
      types: [{ kind: 'object', name: 'Note', fields: [] }],
    });

    await withClient(async (client) => {
      const emitResult = await client.callTool({
        name: 'emit_contexture',
        arguments: { irPath },
      });
      expect(emitResult).toMatchObject({
        isError: true,
        content: [
          expect.objectContaining({
            text: expect.stringContaining('packages/contexture/*.contexture.json'),
          }),
        ],
      });

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
      expect(applyResult).toMatchObject({
        isError: true,
        content: [
          expect.objectContaining({
            text: expect.stringContaining('packages/contexture/*.contexture.json'),
          }),
        ],
      });
    });
  });
});
