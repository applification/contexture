import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
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
  it('lists read-only inspect and validate tools', async () => {
    await withClient(async (client) => {
      const { tools } = await client.listTools();
      expect(tools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'inspect_contexture',
            annotations: expect.objectContaining({ readOnlyHint: true, destructiveHint: false }),
          }),
          expect.objectContaining({
            name: 'validate_contexture',
            annotations: expect.objectContaining({ readOnlyHint: true, destructiveHint: false }),
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

  it('validates structural and semantic issues without the desktop app', async () => {
    const irPath = await fixtureIr({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Order',
          fields: [{ name: 'buyer', type: { kind: 'ref', typeName: 'Buyer' } }],
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
        valid: false,
        errors: [
          expect.objectContaining({
            code: 'unresolved_ref',
            path: 'types.0.fields.0.type',
          }),
        ],
      });
    });
  });

  it('reports structural validation errors as data instead of requiring desktop IPC', async () => {
    const irPath = await fixtureIr({ version: '1', types: [{ kind: 'object', name: '' }] });

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
});
