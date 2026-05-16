import type { OpToolDescriptor } from '@main/ops';
import type { ExecFileFn } from '@main/providers/claude/cli';
import {
  ClaudeProviderRuntime,
  type ClaudeProviderRuntimeOptions,
} from '@main/providers/claude/runtime';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

function supportedExec(): ExecFileFn {
  return vi.fn<ExecFileFn>(async (file) => {
    if (file === 'which') return { stdout: '/opt/bin/claude\n' };
    return { stdout: '' };
  });
}

function interruptibleQuery(messages: unknown[], supportedModels: unknown[] = []) {
  return vi.fn(() => {
    const iterator = (async function* () {
      for (const message of messages) yield message;
    })();
    return Object.assign(iterator, {
      close: vi.fn(() => undefined),
      interrupt: vi.fn(async () => undefined),
      supportedModels: vi.fn(async () => supportedModels),
    });
  }) as unknown as NonNullable<ClaudeProviderRuntimeOptions['queryFn']>;
}

function descriptor(): OpToolDescriptor {
  return {
    name: 'add_type',
    description: 'Add type.',
    inputSchema: { payload: z.object({ name: z.string() }) },
    handler: vi.fn(async () => ({ schema: { version: '1', types: [] } })),
  };
}

describe('ClaudeProviderRuntime', () => {
  it('reports Claude CLI readiness and supports API-key login', async () => {
    const runtime = new ClaudeProviderRuntime({
      execFile: supportedExec(),
      queryFn: interruptibleQuery([]),
      skillsPluginPath: null,
    });

    await expect(runtime.getStatus()).resolves.toMatchObject({
      provider: 'claude',
      readiness: 'authenticated_cli',
    });
    await expect(runtime.startLogin({ mode: 'api-key', apiKey: 'sk-ant-test' })).resolves.toEqual({
      id: 'api-key',
      mode: 'api-key',
    });
    await expect(runtime.getStatus()).resolves.toMatchObject({
      provider: 'claude',
      readiness: 'authenticated_api_key',
    });
  });

  it('exposes Claude model effort options through model descriptors', async () => {
    const runtime = new ClaudeProviderRuntime({
      execFile: supportedExec(),
      queryFn: interruptibleQuery(
        [],
        [
          {
            value: 'sonnet',
            displayName: 'Sonnet',
            supportsEffort: true,
            supportedEffortLevels: ['low', 'medium', 'high', 'max'],
          },
          {
            value: 'haiku',
            displayName: 'Haiku',
            description: 'Haiku 4.5 · Fastest for quick answers',
          },
        ],
      ),
      skillsPluginPath: null,
    });

    await expect(runtime.listModels()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'sonnet',
          optionDescriptors: [
            expect.objectContaining({
              id: 'reasoningEffort',
              type: 'select',
              options: expect.arrayContaining([
                { id: 'medium', label: 'Medium', isDefault: true },
                { id: 'xhigh', label: 'Ultrathink' },
              ]),
            }),
            expect.objectContaining({ id: 'contextWindow', type: 'select' }),
          ],
        }),
        expect.objectContaining({
          id: 'haiku',
          label: 'Haiku',
          optionDescriptors: [
            expect.objectContaining({ id: 'thinking', type: 'boolean', defaultValue: false }),
          ],
        }),
      ]),
    );
  });

  it('maps Claude Agent SDK messages to provider events and persists session refs', async () => {
    const queryFn = interruptibleQuery([
      { type: 'system', subtype: 'init', session_id: 'session-1' },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Sure.' }] } },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'tool-1', name: 'add_type', input: { payload: {} } }],
        },
      },
      { type: 'result', subtype: 'success', is_error: false },
    ]);
    const runtime = new ClaudeProviderRuntime({
      execFile: supportedExec(),
      queryFn,
      opToolDescriptors: [descriptor()],
      skillsPluginPath: null,
    });
    const thread = await runtime.startThread({ schema: { version: '1', types: [] } });

    const events = [];
    for await (const event of runtime.sendTurn({
      thread,
      schema: { version: '1', types: [] },
      message: 'hello',
      model: 'claude-sonnet-4-6',
      effort: 'med',
    })) {
      events.push(event);
    }

    expect(thread).toMatchObject({
      provider: 'claude',
      threadId: 'session-1',
      opaque: { sessionId: 'session-1' },
    });
    expect(events).toEqual([
      { type: 'turn_started', thread },
      { type: 'thread_resumed', thread },
      { type: 'assistant_delta', text: 'Sure.' },
      { type: 'tool_call_started', id: 'tool-1', name: 'add_type', input: { payload: {} } },
      { type: 'turn_completed' },
      { type: 'assistant_final', text: 'Sure.' },
    ]);
    expect(queryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'hello',
        options: expect.objectContaining({
          allowedTools: ['mcp__contexture-ops__add_type'],
          disallowedTools: expect.arrayContaining(['Read', 'Write', 'Bash']),
          effort: 'medium',
          model: 'claude-sonnet-4-6',
        }),
      }),
    );
  });

  it('translates model option descriptors into Claude query options', async () => {
    const queryFn = interruptibleQuery([{ type: 'result', subtype: 'success', is_error: false }]);
    const runtime = new ClaudeProviderRuntime({
      execFile: supportedExec(),
      queryFn,
      skillsPluginPath: null,
    });
    const thread = await runtime.startThread({ schema: { version: '1', types: [] } });

    for await (const _event of runtime.sendTurn({
      thread,
      schema: { version: '1', types: [] },
      message: 'hello',
      model: 'sonnet',
      options: {
        contextWindow: '1m',
        reasoningEffort: 'xhigh',
        thinking: false,
        fastMode: true,
      },
    })) {
      // drain
    }

    expect(queryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          model: 'sonnet[1m]',
          effort: 'xhigh',
          thinking: { type: 'disabled' },
          settings: { fastMode: true, fastModePerSessionOptIn: true },
        }),
      }),
    );
  });

  it('runs one-shot text generation without MCP tools for reconcile proposals', async () => {
    const queryFn = interruptibleQuery([
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: '[{"op":{"kind":"add_type"},"label":"Add","lossy":false}]' },
          ],
        },
      },
      { type: 'result', subtype: 'success', is_error: false },
    ]);
    const runtime = new ClaudeProviderRuntime({
      execFile: supportedExec(),
      queryFn,
      opToolDescriptors: [descriptor()],
      skillsPluginPath: null,
    });

    await expect(
      runtime.generateText({
        systemPrompt: 'Return JSON.',
        message: 'reconcile',
        schema: { version: '1', types: [] },
        model: 'claude-sonnet-4-6',
        effort: 'high',
      }),
    ).resolves.toContain('"label":"Add"');

    expect(queryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'reconcile',
        options: expect.objectContaining({
          systemPrompt: 'Return JSON.',
          allowedTools: [],
          disallowedTools: expect.arrayContaining(['Read', 'Write', 'Bash']),
          model: 'claude-sonnet-4-6',
          effort: 'high',
        }),
      }),
    );
    expect(queryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.not.objectContaining({
          mcpServers: expect.anything(),
        }),
      }),
    );
  });
});
