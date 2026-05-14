import type { OpToolDescriptor } from '@main/ops';
import {
  CODEX_CONTEXTURE_TOOL_NAMESPACE,
  handleCodexDynamicToolCall,
  toCodexDynamicTools,
} from '@main/providers/codex/tools';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

function descriptor(): OpToolDescriptor {
  return {
    name: 'add_type',
    description: 'Add a type.',
    inputSchema: {
      payload: z.object({
        kind: z.literal('object'),
        name: z.string(),
        fields: z.array(z.unknown()),
      }),
    },
    handler: vi.fn(async () => ({ schema: { version: '1', types: [] } })),
  };
}

describe('Codex dynamic tool adapter', () => {
  it('generates namespaced Codex dynamic tools from op descriptors', () => {
    const [tool] = toCodexDynamicTools([descriptor()]);

    expect(tool).toMatchObject({
      namespace: CODEX_CONTEXTURE_TOOL_NAMESPACE,
      name: 'add_type',
      description: 'Add a type.',
    });
    expect(tool.inputSchema).toMatchObject({
      type: 'object',
      properties: {
        payload: expect.objectContaining({ type: 'object' }),
      },
    });
  });

  it('dispatches Codex tool calls to the shared descriptor handler', async () => {
    const tool = descriptor();

    const response = await handleCodexDynamicToolCall(
      {
        threadId: 'thread-1',
        turnId: 'turn-1',
        callId: 'call-1',
        namespace: CODEX_CONTEXTURE_TOOL_NAMESPACE,
        tool: 'add_type',
        arguments: { payload: { kind: 'object', name: 'Plot', fields: [] } },
      },
      [tool],
    );

    expect(tool.handler).toHaveBeenCalledWith({
      payload: { kind: 'object', name: 'Plot', fields: [] },
    });
    expect(response).toEqual({
      success: true,
      contentItems: [{ type: 'inputText', text: '{"schema":{"version":"1","types":[]}}' }],
    });
  });

  it('returns a failed tool response for unknown tools', async () => {
    const response = await handleCodexDynamicToolCall(
      {
        threadId: 'thread-1',
        turnId: 'turn-1',
        callId: 'call-1',
        namespace: CODEX_CONTEXTURE_TOOL_NAMESPACE,
        tool: 'missing',
        arguments: {},
      },
      [descriptor()],
    );

    expect(response.success).toBe(false);
    expect(response.contentItems[0].text).toContain('Unknown Contexture tool');
  });
});
