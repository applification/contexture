import { PassThrough } from 'node:stream';
import {
  CodexJsonRpcClient,
  type JsonRpcNotificationMessage,
  type JsonRpcRequestMessage,
} from '@main/providers/codex/json-rpc';
import { describe, expect, it, vi } from 'vitest';

function makeClient(
  options: {
    onNotification?: (message: JsonRpcNotificationMessage) => void;
    onServerRequest?: (message: JsonRpcRequestMessage, client: CodexJsonRpcClient) => void;
  } = {},
) {
  const serverToClient = new PassThrough();
  const clientToServer = new PassThrough();
  const writes: string[] = [];
  clientToServer.on('data', (chunk) => writes.push(chunk.toString('utf8')));
  const client = new CodexJsonRpcClient({
    input: serverToClient,
    output: clientToServer,
    ...options,
  });
  return { client, serverToClient, writes };
}

describe('CodexJsonRpcClient', () => {
  it('writes requests and resolves matching responses', async () => {
    const { client, serverToClient, writes } = makeClient();

    const promise = client.request<{ ok: boolean }>('initialize', { clientInfo: { name: 'test' } });
    expect(JSON.parse(writes[0])).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'test' } },
    });

    serverToClient.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } })}\n`);

    await expect(promise).resolves.toEqual({ ok: true });
  });

  it('rejects failed responses', async () => {
    const { client, serverToClient } = makeClient();

    const promise = client.request('thread/start', {});
    serverToClient.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'bad' } })}\n`,
    );

    await expect(promise).rejects.toThrow('bad');
  });

  it('routes notifications and server requests', async () => {
    const onNotification = vi.fn();
    const onServerRequest = vi.fn((message: JsonRpcRequestMessage, client: CodexJsonRpcClient) => {
      client.respond(message.id, { success: true });
    });
    const { serverToClient, writes } = makeClient({ onNotification, onServerRequest });

    serverToClient.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'thread/started', params: { threadId: 't1' } })}\n`,
    );
    serverToClient.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'item/tool/call', params: {} })}\n`,
    );

    expect(onNotification).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      method: 'thread/started',
      params: { threadId: 't1' },
    });
    expect(onServerRequest).toHaveBeenCalledOnce();
    expect(JSON.parse(writes[0])).toEqual({
      jsonrpc: '2.0',
      id: 99,
      result: { success: true },
    });
  });

  it('stops routing server requests after the first runtime handler accepts them', () => {
    const { client, serverToClient, writes } = makeClient();
    const first = vi.fn((message: JsonRpcRequestMessage, rpc: CodexJsonRpcClient) => {
      rpc.respond(message.id, { handledBy: 'first' });
      return true;
    });
    const second = vi.fn(() => true);
    client.onServerRequest(first);
    client.onServerRequest(second);

    serverToClient.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 100, method: 'item/tool/call', params: {} })}\n`,
    );

    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
    expect(writes.map((write) => JSON.parse(write))).toEqual([
      { jsonrpc: '2.0', id: 100, result: { handledBy: 'first' } },
    ]);
  });
});
