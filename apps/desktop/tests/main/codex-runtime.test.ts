import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { OpToolDescriptor } from '@main/ops';
import type { CodexAppServerConnection } from '@main/providers/codex/app-server';
import type { ExecFileFn } from '@main/providers/codex/cli';
import type {
  JsonRpcNotificationMessage,
  JsonRpcRequestMessage,
} from '@main/providers/codex/json-rpc';
import { CodexProviderRuntime } from '@main/providers/codex/runtime';
import { CODEX_CONTEXTURE_TOOL_NAMESPACE } from '@main/providers/codex/tools';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

interface FakeConnection extends CodexAppServerConnection {
  emitNotification(message: JsonRpcNotificationMessage): void;
  emitServerRequest(message: JsonRpcRequestMessage): void;
}

function supportedExec(): ExecFileFn {
  return vi.fn<ExecFileFn>(async (file) => {
    if (file === 'which') return { stdout: '/opt/bin/codex\n' };
    return { stdout: 'codex-cli 0.130.0\n' };
  });
}

function rateLimitSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    limitId: 'codex',
    limitName: 'Codex',
    primary: null,
    secondary: null,
    credits: { hasCredits: true, unlimited: false, balance: '10' },
    planType: 'plus',
    rateLimitReachedType: null,
    ...overrides,
  };
}

function fakeConnection(request: CodexAppServerConnection['client']['request']): FakeConnection {
  const process = new EventEmitter() as CodexAppServerConnection['process'];
  process.stdin = new PassThrough();
  process.stdout = new PassThrough();
  process.stderr = new PassThrough();
  process.killed = false;
  process.kill = vi.fn(() => true);
  const notifications = new Set<(message: JsonRpcNotificationMessage) => void>();
  const serverRequests = new Set<
    (
      message: JsonRpcRequestMessage,
      client: CodexAppServerConnection['client'],
    ) => boolean | undefined
  >();
  const client = {
    request,
    notify: vi.fn(),
    respond: vi.fn(),
    respondError: vi.fn(),
    dispose: vi.fn(),
    onNotification: vi.fn((listener) => {
      notifications.add(listener);
      return () => notifications.delete(listener);
    }),
    onServerRequest: vi.fn((listener) => {
      serverRequests.add(listener);
      return () => serverRequests.delete(listener);
    }),
  } as unknown as CodexAppServerConnection['client'];
  return {
    process,
    client,
    dispose: vi.fn(),
    emitNotification: (message: JsonRpcNotificationMessage) => {
      for (const listener of notifications) listener(message);
    },
    emitServerRequest: (message: JsonRpcRequestMessage) => {
      for (const listener of serverRequests) listener(message, client);
    },
  } as unknown as FakeConnection;
}

describe('CodexProviderRuntime', () => {
  it('reports ChatGPT readiness from Codex account state', async () => {
    const request = vi.fn<CodexAppServerConnection['client']['request']>(async (method) => {
      if (method === 'initialize') {
        return {
          userAgent: 'codex',
          codexHome: '/tmp/codex',
          platformFamily: 'unix',
          platformOs: 'macos',
        };
      }
      if (method === 'account/read') {
        return {
          account: { type: 'chatgpt', email: 'user@example.com', planType: 'plus' },
          requiresOpenaiAuth: false,
        };
      }
      if (method === 'account/rateLimits/read') {
        return { rateLimits: rateLimitSnapshot(), rateLimitsByLimitId: null };
      }
      throw new Error(`unexpected method ${method}`);
    });
    const appServerFactory = vi.fn(() => fakeConnection(request));
    const runtime = new CodexProviderRuntime({
      execFile: supportedExec(),
      appServerFactory,
    });

    await expect(runtime.getStatus()).resolves.toMatchObject({
      provider: 'codex',
      readiness: 'authenticated_chatgpt',
      cliVersion: '0.130.0',
    });
    expect(appServerFactory).toHaveBeenCalledWith('/opt/bin/codex');
  });

  it('reports authenticated ChatGPT accounts as rate-limited when Codex says the Codex bucket is exhausted', async () => {
    const request = vi.fn<CodexAppServerConnection['client']['request']>(async (method) => {
      if (method === 'initialize') {
        return {
          userAgent: 'codex',
          codexHome: '/tmp/codex',
          platformFamily: 'unix',
          platformOs: 'macos',
        };
      }
      if (method === 'account/read') {
        return {
          account: { type: 'chatgpt', email: 'user@example.com', planType: 'plus' },
          requiresOpenaiAuth: false,
        };
      }
      if (method === 'account/rateLimits/read') {
        return {
          rateLimits: rateLimitSnapshot(),
          rateLimitsByLimitId: {
            codex: rateLimitSnapshot({ rateLimitReachedType: 'rate_limit_reached' }),
          },
        };
      }
      throw new Error(`unexpected method ${method}`);
    });
    const runtime = new CodexProviderRuntime({
      execFile: supportedExec(),
      appServerFactory: vi.fn(() => fakeConnection(request)),
    });

    await expect(runtime.getStatus()).resolves.toMatchObject({
      provider: 'codex',
      readiness: 'rate_limited',
      detail: 'rate limit reached',
      cliVersion: '0.130.0',
    });
  });

  it('keeps ChatGPT accounts ready when credits are empty but Codex has not reached a limit', async () => {
    const request = vi.fn<CodexAppServerConnection['client']['request']>(async (method) => {
      if (method === 'initialize') {
        return {
          userAgent: 'codex',
          codexHome: '/tmp/codex',
          platformFamily: 'unix',
          platformOs: 'macos',
        };
      }
      if (method === 'account/read') {
        return {
          account: { type: 'chatgpt', email: 'user@example.com', planType: 'plus' },
          requiresOpenaiAuth: false,
        };
      }
      if (method === 'account/rateLimits/read') {
        return {
          rateLimits: rateLimitSnapshot({
            credits: { hasCredits: false, unlimited: false, balance: '0' },
            primary: { usedPercent: 22, windowDurationMins: 300, resetsAt: 1778772745 },
            secondary: { usedPercent: 3, windowDurationMins: 10080, resetsAt: 1779359545 },
          }),
          rateLimitsByLimitId: null,
        };
      }
      throw new Error(`unexpected method ${method}`);
    });
    const runtime = new CodexProviderRuntime({
      execFile: supportedExec(),
      appServerFactory: vi.fn(() => fakeConnection(request)),
    });

    await expect(runtime.getStatus()).resolves.toMatchObject({
      provider: 'codex',
      readiness: 'authenticated_chatgpt',
      cliVersion: '0.130.0',
    });
  });

  it('reports not-signed-in when Codex has no account', async () => {
    const request = vi.fn<CodexAppServerConnection['client']['request']>(async (method) => {
      if (method === 'initialize') {
        return {
          userAgent: 'codex',
          codexHome: '/tmp/codex',
          platformFamily: 'unix',
          platformOs: 'macos',
        };
      }
      if (method === 'account/read') return { account: null, requiresOpenaiAuth: true };
      throw new Error(`unexpected method ${method}`);
    });
    const runtime = new CodexProviderRuntime({
      execFile: supportedExec(),
      appServerFactory: vi.fn(() => fakeConnection(request)),
    });

    await expect(runtime.getStatus()).resolves.toMatchObject({
      provider: 'codex',
      readiness: 'not_signed_in',
      cliVersion: '0.130.0',
    });
  });

  it('restarts app-server after the cached Codex connection exits', async () => {
    const connections: FakeConnection[] = [];
    const request = vi.fn<CodexAppServerConnection['client']['request']>(async (method) => {
      if (method === 'initialize') {
        return {
          userAgent: 'codex',
          codexHome: '/tmp/codex',
          platformFamily: 'unix',
          platformOs: 'macos',
        };
      }
      if (method === 'account/read') return { account: null, requiresOpenaiAuth: true };
      throw new Error(`unexpected method ${method}`);
    });
    const appServerFactory = vi.fn(() => {
      const connection = fakeConnection(request);
      connections.push(connection);
      return connection;
    });
    const runtime = new CodexProviderRuntime({
      execFile: supportedExec(),
      appServerFactory,
    });

    await expect(runtime.getStatus()).resolves.toMatchObject({
      provider: 'codex',
      readiness: 'not_signed_in',
    });
    connections[0].process.emit('exit', 1, null);
    await expect(runtime.getStatus()).resolves.toMatchObject({
      provider: 'codex',
      readiness: 'not_signed_in',
    });

    expect(appServerFactory).toHaveBeenCalledTimes(2);
  });

  it('starts and cancels ChatGPT login through app-server', async () => {
    const request = vi.fn<CodexAppServerConnection['client']['request']>(async (method) => {
      if (method === 'initialize') {
        return {
          userAgent: 'codex',
          codexHome: '/tmp/codex',
          platformFamily: 'unix',
          platformOs: 'macos',
        };
      }
      if (method === 'account/login/start') {
        return { type: 'chatgpt', loginId: 'login-1', authUrl: 'https://auth.example.test' };
      }
      if (method === 'account/login/cancel') return {};
      throw new Error(`unexpected method ${method}`);
    });
    const runtime = new CodexProviderRuntime({
      execFile: supportedExec(),
      appServerFactory: vi.fn(() => fakeConnection(request)),
    });

    await expect(runtime.startLogin({ mode: 'chatgpt' })).resolves.toEqual({
      id: 'login-1',
      mode: 'chatgpt',
      url: 'https://auth.example.test',
    });
    await runtime.cancelLogin({ flowId: 'login-1' });
    expect(request).toHaveBeenNthCalledWith(2, 'account/login/start', {
      type: 'chatgpt',
      codexStreamlinedLogin: true,
    });
    expect(request).toHaveBeenNthCalledWith(3, 'account/login/cancel', {
      loginId: 'login-1',
    });
  });

  it('supports API-key login and logout through app-server', async () => {
    const request = vi.fn<CodexAppServerConnection['client']['request']>(async (method) => {
      if (method === 'initialize') {
        return {
          userAgent: 'codex',
          codexHome: '/tmp/codex',
          platformFamily: 'unix',
          platformOs: 'macos',
        };
      }
      if (method === 'account/login/start') return { type: 'apiKey' };
      if (method === 'account/logout') return {};
      throw new Error(`unexpected method ${method}`);
    });
    const runtime = new CodexProviderRuntime({
      execFile: supportedExec(),
      appServerFactory: vi.fn(() => fakeConnection(request)),
    });

    await expect(runtime.startLogin({ mode: 'api-key', apiKey: 'sk-test' })).resolves.toEqual({
      id: 'api-key',
      mode: 'api-key',
    });
    await runtime.logout();
    expect(request).toHaveBeenNthCalledWith(2, 'account/login/start', {
      type: 'apiKey',
      apiKey: 'sk-test',
    });
    expect(request).toHaveBeenNthCalledWith(3, 'account/logout', undefined);
  });

  it('normalizes model/list results after initializing app-server', async () => {
    const request = vi.fn<CodexAppServerConnection['client']['request']>(async (method) => {
      if (method === 'initialize') {
        return {
          userAgent: 'codex',
          codexHome: '/tmp/codex',
          platformFamily: 'unix',
          platformOs: 'macos',
        };
      }
      if (method === 'model/list') {
        return {
          data: [
            {
              id: 'gpt-5.4-id',
              model: 'gpt-5.4',
              displayName: 'gpt-5.4',
              supportedReasoningEfforts: [{ reasoningEffort: 'high', description: 'High' }],
              upgrade: null,
              upgradeInfo: null,
              availabilityNux: null,
              description: '',
              hidden: false,
              defaultReasoningEffort: 'high',
              inputModalities: ['text'],
              supportsPersonality: false,
              additionalSpeedTiers: [],
              serviceTiers: [],
              isDefault: true,
            },
          ],
          nextCursor: null,
        };
      }
      throw new Error(`unexpected method ${method}`);
    });
    const appServerFactory = vi.fn(() => fakeConnection(request));
    const runtime = new CodexProviderRuntime({
      execFile: supportedExec(),
      appServerFactory,
    });

    await expect(runtime.listModels()).resolves.toEqual([
      {
        id: 'gpt-5.4',
        label: 'GPT-5.4',
        supportsReasoningEffort: true,
        optionDescriptors: [
          {
            id: 'reasoningEffort',
            type: 'select',
            label: 'Effort',
            options: [{ id: 'high', label: 'High', isDefault: true }],
          },
          {
            id: 'fastMode',
            type: 'boolean',
            label: 'Fast',
            defaultValue: false,
          },
        ],
      },
    ]);
    expect(appServerFactory).toHaveBeenCalledWith('/opt/bin/codex');
    expect(request).toHaveBeenNthCalledWith(1, 'initialize', {
      clientInfo: { name: 'contexture', title: 'Contexture', version: '0.14.0' },
      capabilities: { experimentalApi: true },
    });
    expect(request).toHaveBeenNthCalledWith(2, 'model/list', {
      cursor: null,
      includeHidden: false,
    });
  });

  it('does not start app-server when Codex CLI is unsupported', async () => {
    const exec = vi.fn<ExecFileFn>(async (file) => {
      if (file === 'which') return { stdout: '/opt/bin/codex\n' };
      return { stdout: 'codex-cli 0.129.0\n' };
    });
    const appServerFactory = vi.fn(() =>
      fakeConnection(vi.fn<CodexAppServerConnection['client']['request']>()),
    );
    const runtime = new CodexProviderRuntime({ execFile: exec, appServerFactory });

    await expect(runtime.listModels()).rejects.toThrow('Codex CLI version is not supported');
    expect(appServerFactory).not.toHaveBeenCalled();
  });

  it('starts and rolls back Codex threads through app-server', async () => {
    const request = vi.fn<CodexAppServerConnection['client']['request']>(async (method) => {
      if (method === 'initialize') {
        return {
          userAgent: 'codex',
          codexHome: '/tmp/codex',
          platformFamily: 'unix',
          platformOs: 'macos',
        };
      }
      if (method === 'thread/start') {
        return {
          thread: {
            id: 'thread-123',
            sessionId: 'session-123',
            forkedFromId: null,
            preview: '',
            ephemeral: false,
            modelProvider: 'openai',
            createdAt: 1,
            updatedAt: 1,
            status: 'idle',
            path: null,
            cwd: '/tmp',
            cliVersion: '0.130.0',
            source: 'app-server',
            threadSource: null,
            agentNickname: null,
            agentRole: null,
            gitInfo: null,
            name: null,
            turns: [],
          },
          model: 'gpt-5.4',
          modelProvider: 'openai',
          serviceTier: null,
          cwd: '/tmp',
          instructionSources: [],
          approvalPolicy: 'never',
          approvalsReviewer: 'client',
          sandbox: 'read-only',
          permissionProfile: null,
          activePermissionProfile: null,
          reasoningEffort: null,
        };
      }
      if (method === 'thread/rollback') return {};
      throw new Error(`unexpected method ${method}`);
    });
    const runtime = new CodexProviderRuntime({
      execFile: supportedExec(),
      appServerFactory: vi.fn(() => fakeConnection(request)),
    });

    const thread = await runtime.startThread({
      schema: { version: '1', types: [] },
      model: 'gpt-5.4',
    });
    await runtime.rollbackThread({ thread, turns: 1 });

    expect(thread).toMatchObject({ provider: 'codex', threadId: 'thread-123' });
    expect(request).toHaveBeenNthCalledWith(
      2,
      'thread/start',
      expect.objectContaining({
        model: 'gpt-5.4',
        cwd: expect.any(String),
        approvalPolicy: expect.objectContaining({
          granular: expect.objectContaining({
            sandbox_approval: true,
            rules: true,
            skill_approval: true,
            request_permissions: true,
            mcp_elicitations: true,
          }),
        }),
        sandbox: 'read-only',
        environments: [],
        config: {
          web_search: 'disabled',
          tools: { view_image: false },
        },
        dynamicTools: [],
        experimentalRawEvents: false,
        persistExtendedHistory: false,
      }),
    );
    expect(request).toHaveBeenNthCalledWith(3, 'thread/rollback', {
      threadId: 'thread-123',
      numTurns: 1,
    });
  });

  it('resumes persisted Codex threads before reuse', async () => {
    const request = vi.fn<CodexAppServerConnection['client']['request']>(async (method) => {
      if (method === 'initialize') {
        return {
          userAgent: 'codex',
          codexHome: '/tmp/codex',
          platformFamily: 'unix',
          platformOs: 'macos',
        };
      }
      if (method === 'thread/resume') {
        return {
          thread: {
            id: 'thread-123',
            sessionId: 'session-123',
            forkedFromId: null,
            preview: '',
            ephemeral: false,
            modelProvider: 'openai',
            createdAt: 1,
            updatedAt: 2,
            status: 'idle',
            path: null,
            cwd: '/tmp',
            cliVersion: '0.130.0',
            source: 'app-server',
            threadSource: null,
            agentNickname: null,
            agentRole: null,
            gitInfo: null,
            name: null,
            turns: [],
          },
          model: 'gpt-5.4',
          modelProvider: 'openai',
          serviceTier: null,
          cwd: '/tmp',
          instructionSources: [],
          approvalPolicy: 'never',
          approvalsReviewer: 'client',
          sandbox: 'read-only',
          permissionProfile: null,
          activePermissionProfile: null,
          reasoningEffort: null,
        };
      }
      throw new Error(`unexpected method ${method}`);
    });
    const runtime = new CodexProviderRuntime({
      execFile: supportedExec(),
      appServerFactory: vi.fn(() => fakeConnection(request)),
      opToolDescriptors: [
        {
          name: 'add_type',
          description: 'Add type.',
          inputSchema: { payload: z.object({ name: z.string() }) },
          handler: vi.fn(async () => ({ schema: { version: '1', types: [] } })),
        },
      ],
    });

    const resumed = await runtime.resumeThread({
      thread: { provider: 'codex', threadId: 'thread-123' },
      model: 'gpt-5.4',
    });

    expect(resumed).toMatchObject({ provider: 'codex', threadId: 'thread-123' });
    expect(request).toHaveBeenNthCalledWith(
      2,
      'thread/resume',
      expect.objectContaining({
        threadId: 'thread-123',
        model: 'gpt-5.4',
        cwd: expect.any(String),
        approvalPolicy: expect.objectContaining({
          granular: expect.objectContaining({
            sandbox_approval: true,
            rules: true,
            skill_approval: true,
            request_permissions: true,
            mcp_elicitations: true,
          }),
        }),
        sandbox: 'read-only',
        dynamicTools: [
          expect.objectContaining({
            namespace: CODEX_CONTEXTURE_TOOL_NAMESPACE,
            name: 'add_type',
          }),
        ],
        excludeTurns: true,
        persistExtendedHistory: false,
      }),
    );
  });

  it('starts schema threads with only Contexture dynamic tools and constrained runtime settings', async () => {
    const request = vi.fn<CodexAppServerConnection['client']['request']>(async (method) => {
      if (method === 'initialize') {
        return {
          userAgent: 'codex',
          codexHome: '/tmp/codex',
          platformFamily: 'unix',
          platformOs: 'macos',
        };
      }
      if (method === 'thread/start') {
        return {
          thread: {
            id: 'thread-123',
            sessionId: 'session-123',
            forkedFromId: null,
            preview: '',
            ephemeral: false,
            modelProvider: 'openai',
            createdAt: 1,
            updatedAt: 1,
            status: 'idle',
            path: null,
            cwd: '/tmp',
            cliVersion: '0.130.0',
            source: 'appServer',
            threadSource: null,
            agentNickname: null,
            agentRole: null,
            gitInfo: null,
            name: null,
            turns: [],
          },
          model: 'gpt-5.4',
          modelProvider: 'openai',
          serviceTier: null,
          cwd: '/tmp',
          instructionSources: [],
          approvalPolicy: 'never',
          approvalsReviewer: 'user',
          sandbox: { type: 'readOnly', networkAccess: false },
          permissionProfile: null,
          activePermissionProfile: null,
          reasoningEffort: null,
        };
      }
      throw new Error(`unexpected method ${method}`);
    });
    const tool: OpToolDescriptor = {
      name: 'add_type',
      description: 'Add type.',
      inputSchema: { payload: z.object({ name: z.string() }) },
      handler: vi.fn(async () => ({ schema: { version: '1', types: [] } })),
    };
    const runtime = new CodexProviderRuntime({
      execFile: supportedExec(),
      appServerFactory: vi.fn(() => fakeConnection(request)),
      opToolDescriptors: [tool],
    });

    await runtime.startThread({ schema: { version: '1', types: [] }, model: 'gpt-5.4' });

    const params = request.mock.calls.find(([method]) => method === 'thread/start')?.[1] as {
      dynamicTools: Array<{ namespace?: string; name: string }>;
      approvalPolicy: unknown;
      cwd: string;
      sandbox: string;
      environments: unknown[];
      config: { web_search?: unknown; tools?: { view_image?: unknown } };
    };
    expect(params.cwd.length).toBeGreaterThan(0);
    expect(params.approvalPolicy).toEqual({
      granular: {
        sandbox_approval: true,
        rules: true,
        skill_approval: true,
        request_permissions: true,
        mcp_elicitations: true,
      },
    });
    expect(params.sandbox).toBe('read-only');
    expect(params.environments).toEqual([]);
    expect(params.config).toEqual({
      web_search: 'disabled',
      tools: { view_image: false },
    });
    expect(params.dynamicTools).toEqual([
      expect.objectContaining({ namespace: 'contexture', name: 'add_type' }),
    ]);
    expect(params.dynamicTools.map((tool) => tool.name)).not.toEqual(
      expect.arrayContaining(['Read', 'Write', 'Edit', 'Bash', 'WebSearch', 'WebFetch']),
    );
  });

  it('runs one-shot text generation without Contexture dynamic tools', async () => {
    let connection: FakeConnection;
    const request = vi.fn<CodexAppServerConnection['client']['request']>(async (method) => {
      if (method === 'initialize') {
        return {
          userAgent: 'codex',
          codexHome: '/tmp/codex',
          platformFamily: 'unix',
          platformOs: 'macos',
        };
      }
      if (method === 'thread/start') {
        return {
          thread: {
            id: 'thread-123',
            sessionId: 'session-123',
            forkedFromId: null,
            preview: '',
            ephemeral: false,
            modelProvider: 'openai',
            createdAt: 1,
            updatedAt: 1,
            status: 'idle',
            path: null,
            cwd: '/tmp',
            cliVersion: '0.130.0',
            source: 'appServer',
            threadSource: null,
            agentNickname: null,
            agentRole: null,
            gitInfo: null,
            name: null,
            turns: [],
          },
          model: 'gpt-5.4',
          modelProvider: 'openai',
          serviceTier: null,
          cwd: '/tmp',
          instructionSources: [],
          approvalPolicy: 'never',
          approvalsReviewer: 'user',
          sandbox: { type: 'readOnly', networkAccess: false },
          permissionProfile: null,
          activePermissionProfile: null,
          reasoningEffort: null,
        };
      }
      if (method === 'turn/start') {
        queueMicrotask(() => {
          connection.emitNotification({
            jsonrpc: '2.0',
            method: 'item/agentMessage/delta',
            params: { threadId: 'thread-123', turnId: 'turn-1', itemId: 'item-1', delta: '[]' },
          });
          connection.emitNotification({
            jsonrpc: '2.0',
            method: 'turn/completed',
            params: {
              threadId: 'thread-123',
              turn: {
                id: 'turn-1',
                items: [],
                itemsView: 'complete',
                status: 'completed',
                error: null,
                startedAt: 1,
                completedAt: 2,
                durationMs: 1,
              },
            },
          });
        });
        return {
          turn: {
            id: 'turn-1',
            items: [],
            itemsView: 'complete',
            status: 'inProgress',
            error: null,
            startedAt: 1,
            completedAt: null,
            durationMs: null,
          },
        };
      }
      throw new Error(`unexpected method ${method}`);
    });
    connection = fakeConnection(request);
    const runtime = new CodexProviderRuntime({
      execFile: supportedExec(),
      appServerFactory: vi.fn(() => connection),
      opToolDescriptors: [
        {
          name: 'add_type',
          description: 'Add type.',
          inputSchema: { payload: z.object({ name: z.string() }) },
          handler: vi.fn(async () => ({ schema: { version: '1', types: [] } })),
        },
      ],
    });

    await expect(
      runtime.generateText({
        systemPrompt: 'Return JSON only.',
        message: 'reconcile',
        schema: { version: '1', types: [] },
        model: 'gpt-5.4',
        effort: 'high',
      }),
    ).resolves.toBe('[]');

    expect(request).toHaveBeenCalledWith(
      'thread/start',
      expect.objectContaining({
        developerInstructions: 'Return JSON only.',
        dynamicTools: [],
      }),
    );
    expect(request).toHaveBeenCalledWith(
      'turn/start',
      expect.objectContaining({
        input: [{ type: 'text', text: 'reconcile', text_elements: [] }],
        model: 'gpt-5.4',
        effort: 'high',
      }),
    );
  });

  it('interrupts only when a Codex turn id is available', async () => {
    const request = vi.fn<CodexAppServerConnection['client']['request']>(async (method) => {
      if (method === 'initialize') {
        return {
          userAgent: 'codex',
          codexHome: '/tmp/codex',
          platformFamily: 'unix',
          platformOs: 'macos',
        };
      }
      if (method === 'turn/interrupt') return {};
      throw new Error(`unexpected method ${method}`);
    });
    const runtime = new CodexProviderRuntime({
      execFile: supportedExec(),
      appServerFactory: vi.fn(() => fakeConnection(request)),
    });

    await expect(
      runtime.interruptTurn({ thread: { provider: 'codex', threadId: 'thread-1' } }),
    ).rejects.toThrow('Cannot interrupt Codex turn before a turn id is known');

    await runtime.interruptTurn({
      thread: { provider: 'codex', threadId: 'thread-1', opaque: { currentTurnId: 'turn-1' } },
    });
    expect(request).toHaveBeenLastCalledWith('turn/interrupt', {
      threadId: 'thread-1',
      turnId: 'turn-1',
    });
  });

  it('streams Codex turn notifications as provider events', async () => {
    const request = vi.fn<CodexAppServerConnection['client']['request']>(async (method) => {
      if (method === 'initialize') {
        return {
          userAgent: 'codex',
          codexHome: '/tmp/codex',
          platformFamily: 'unix',
          platformOs: 'macos',
        };
      }
      if (method === 'turn/start') {
        return {
          turn: {
            id: 'turn-1',
            items: [],
            itemsView: 'complete',
            status: 'inProgress',
            error: null,
            startedAt: 1,
            completedAt: null,
            durationMs: null,
          },
        };
      }
      throw new Error(`unexpected method ${method}`);
    });
    const connection = fakeConnection(request);
    const runtime = new CodexProviderRuntime({
      execFile: supportedExec(),
      appServerFactory: vi.fn(() => connection),
    });
    const thread = { provider: 'codex' as const, threadId: 'thread-1' };
    const iterator = runtime
      .sendTurn({ thread, schema: { version: '1', types: [] }, message: 'hello' })
      [Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({
      value: { type: 'turn_started', thread },
      done: false,
    });
    connection.emitNotification({
      jsonrpc: '2.0',
      method: 'item/agentMessage/delta',
      params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: 'Hello' },
    });
    connection.emitNotification({
      jsonrpc: '2.0',
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        startedAtMs: 1,
        item: {
          type: 'dynamicToolCall',
          id: 'call-1',
          namespace: CODEX_CONTEXTURE_TOOL_NAMESPACE,
          tool: 'add_type',
          arguments: { payload: { name: 'Plot' } },
          status: 'inProgress',
          contentItems: null,
          success: null,
          durationMs: null,
        },
      },
    });
    connection.emitNotification({
      jsonrpc: '2.0',
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        completedAtMs: 2,
        item: {
          type: 'dynamicToolCall',
          id: 'call-1',
          namespace: CODEX_CONTEXTURE_TOOL_NAMESPACE,
          tool: 'add_type',
          arguments: { payload: { name: 'Plot' } },
          status: 'completed',
          contentItems: [{ type: 'inputText', text: '{"schema":{"version":"1","types":[]}}' }],
          success: true,
          durationMs: 1,
        },
      },
    });
    connection.emitNotification({
      jsonrpc: '2.0',
      method: 'item/agentMessage/delta',
      params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-2', delta: 'World' },
    });
    connection.emitNotification({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: {
          id: 'turn-1',
          items: [],
          itemsView: 'complete',
          status: 'completed',
          error: null,
          startedAt: 1,
          completedAt: 2,
          durationMs: 1,
        },
      },
    });

    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'assistant_delta', text: 'Hello' },
      done: false,
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'tool_call_started', id: 'call-1', name: 'add_type' },
      done: false,
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'tool_call_finished', id: 'call-1', name: 'add_type', ok: true },
      done: false,
    });
    await expect(iterator.next()).resolves.toEqual({
      value: { type: 'assistant_delta', text: 'World', boundary: 'new_message' },
      done: false,
    });
    await expect(iterator.next()).resolves.toEqual({
      value: { type: 'turn_completed' },
      done: false,
    });
    await expect(iterator.next()).resolves.toEqual({
      value: { type: 'assistant_final', text: 'Hello\n\nWorld' },
      done: false,
    });
    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });
    expect(thread.opaque).toEqual({ currentTurnId: 'turn-1' });
    expect(request).toHaveBeenLastCalledWith('turn/start', {
      threadId: 'thread-1',
      input: [{ type: 'text', text: 'hello', text_elements: [] }],
      environments: [],
      cwd: expect.any(String),
      approvalPolicy: {
        granular: {
          sandbox_approval: true,
          rules: true,
          skill_approval: true,
          request_permissions: true,
          mcp_elicitations: true,
        },
      },
      sandboxPolicy: { type: 'readOnly', networkAccess: false },
      model: null,
      serviceTier: null,
      effort: null,
    });
  });

  it('ignores completion notifications for a different nested Codex turn id', async () => {
    const request = vi.fn<CodexAppServerConnection['client']['request']>(async (method) => {
      if (method === 'initialize') {
        return {
          userAgent: 'codex',
          codexHome: '/tmp/codex',
          platformFamily: 'unix',
          platformOs: 'macos',
        };
      }
      if (method === 'turn/start') {
        return {
          turn: {
            id: 'turn-current',
            items: [],
            itemsView: 'complete',
            status: 'inProgress',
            error: null,
            startedAt: 1,
            completedAt: null,
            durationMs: null,
          },
        };
      }
      throw new Error(`unexpected method ${method}`);
    });
    const connection = fakeConnection(request);
    const runtime = new CodexProviderRuntime({
      execFile: supportedExec(),
      appServerFactory: vi.fn(() => connection),
    });
    const thread = { provider: 'codex' as const, threadId: 'thread-1' };
    const iterator = runtime
      .sendTurn({ thread, schema: { version: '1', types: [] }, message: 'hello' })
      [Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({
      value: { type: 'turn_started', thread },
      done: false,
    });
    connection.emitNotification({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: {
          id: 'turn-stale',
          items: [],
          itemsView: 'complete',
          status: 'completed',
          error: null,
          startedAt: 1,
          completedAt: 2,
          durationMs: 1,
        },
      },
    });
    connection.emitNotification({
      jsonrpc: '2.0',
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-current',
        itemId: 'item-1',
        delta: 'Still running',
      },
    });
    connection.emitNotification({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: {
          id: 'turn-current',
          items: [],
          itemsView: 'complete',
          status: 'completed',
          error: null,
          startedAt: 3,
          completedAt: 4,
          durationMs: 1,
        },
      },
    });

    await expect(iterator.next()).resolves.toEqual({
      value: { type: 'assistant_delta', text: 'Still running' },
      done: false,
    });
    await expect(iterator.next()).resolves.toEqual({
      value: { type: 'turn_completed' },
      done: false,
    });
  });

  it('maps Codex account and rate-limit notifications to canonical status events', async () => {
    const request = vi.fn<CodexAppServerConnection['client']['request']>(async (method) => {
      if (method === 'initialize') {
        return {
          userAgent: 'codex',
          codexHome: '/tmp/codex',
          platformFamily: 'unix',
          platformOs: 'macos',
        };
      }
      if (method === 'turn/start') {
        return {
          turn: {
            id: 'turn-1',
            items: [],
            itemsView: 'complete',
            status: 'inProgress',
            error: null,
            startedAt: 1,
            completedAt: null,
            durationMs: null,
          },
        };
      }
      throw new Error(`unexpected method ${method}`);
    });
    const connection = fakeConnection(request);
    const runtime = new CodexProviderRuntime({
      execFile: supportedExec(),
      appServerFactory: vi.fn(() => connection),
    });
    const thread = { provider: 'codex' as const, threadId: 'thread-1' };
    const iterator = runtime
      .sendTurn({ thread, schema: { version: '1', types: [] }, message: 'hello' })
      [Symbol.asyncIterator]();

    await iterator.next();
    connection.emitNotification({
      jsonrpc: '2.0',
      method: 'account/updated',
      params: { authMode: 'chatgpt', planType: 'plus' },
    });
    connection.emitNotification({
      jsonrpc: '2.0',
      method: 'account/rateLimits/updated',
      params: { rateLimits: rateLimitSnapshot({ rateLimitReachedType: 'rate_limit_reached' }) },
    });

    await expect(iterator.next()).resolves.toEqual({
      value: {
        type: 'auth_changed',
        status: { provider: 'codex', readiness: 'authenticated_chatgpt' },
      },
      done: false,
    });
    await expect(iterator.next()).resolves.toEqual({
      value: {
        type: 'status_changed',
        status: {
          provider: 'codex',
          readiness: 'rate_limited',
          detail: 'rate limit reached',
        },
      },
      done: false,
    });
  });

  it('replies to Codex dynamic tool-call server requests', async () => {
    const request = vi.fn<CodexAppServerConnection['client']['request']>(async (method) => {
      if (method === 'initialize') {
        return {
          userAgent: 'codex',
          codexHome: '/tmp/codex',
          platformFamily: 'unix',
          platformOs: 'macos',
        };
      }
      if (method === 'turn/start') {
        return {
          turn: {
            id: 'turn-1',
            items: [],
            itemsView: 'complete',
            status: 'inProgress',
            error: null,
            startedAt: 1,
            completedAt: null,
            durationMs: null,
          },
        };
      }
      throw new Error(`unexpected method ${method}`);
    });
    const tool: OpToolDescriptor = {
      name: 'add_type',
      description: 'Add type.',
      inputSchema: { payload: z.object({ name: z.string() }) },
      handler: vi.fn(async () => ({ schema: { version: '1', types: [] } })),
    };
    const connection = fakeConnection(request);
    const runtime = new CodexProviderRuntime({
      execFile: supportedExec(),
      appServerFactory: vi.fn(() => connection),
      opToolDescriptors: [tool],
    });
    const iterator = runtime
      .sendTurn({
        thread: { provider: 'codex', threadId: 'thread-1' },
        schema: { version: '1', types: [] },
        message: 'hello',
      })
      [Symbol.asyncIterator]();

    await iterator.next();
    connection.emitServerRequest({
      jsonrpc: '2.0',
      id: 42,
      method: 'item/tool/call',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        callId: 'call-1',
        namespace: CODEX_CONTEXTURE_TOOL_NAMESPACE,
        tool: 'add_type',
        arguments: { payload: { name: 'Plot' } },
      },
    });

    await vi.waitFor(() => {
      expect(connection.client.respond).toHaveBeenCalledWith(42, {
        success: true,
        contentItems: [{ type: 'inputText', text: '{"schema":{"version":"1","types":[]}}' }],
      });
    });
    expect(tool.handler).toHaveBeenCalledWith({ payload: { name: 'Plot' } });
  });

  it('rejects forbidden shell/file approval requests and fails the turn', async () => {
    const request = vi.fn<CodexAppServerConnection['client']['request']>(async (method) => {
      if (method === 'initialize') {
        return {
          userAgent: 'codex',
          codexHome: '/tmp/codex',
          platformFamily: 'unix',
          platformOs: 'macos',
        };
      }
      if (method === 'turn/start') {
        return {
          turn: {
            id: 'turn-1',
            items: [],
            itemsView: 'complete',
            status: 'inProgress',
            error: null,
            startedAt: 1,
            completedAt: null,
            durationMs: null,
          },
        };
      }
      throw new Error(`unexpected method ${method}`);
    });
    const connection = fakeConnection(request);
    const runtime = new CodexProviderRuntime({
      execFile: supportedExec(),
      appServerFactory: vi.fn(() => connection),
    });
    const iterator = runtime
      .sendTurn({
        thread: { provider: 'codex', threadId: 'thread-1' },
        schema: { version: '1', types: [] },
        message: 'read a file',
      })
      [Symbol.asyncIterator]();

    await iterator.next();
    connection.emitServerRequest({
      jsonrpc: '2.0',
      id: 77,
      method: 'item/commandExecution/requestApproval',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'cmd-1',
        command: 'cat package.json',
      },
    });

    await vi.waitFor(() => {
      expect(connection.client.respondError).toHaveBeenCalledWith(
        77,
        -32000,
        'Codex requested forbidden schema-chat capability: item/commandExecution/requestApproval',
      );
    });
    await expect(iterator.next()).resolves.toEqual({
      value: {
        type: 'turn_failed',
        message:
          'Codex requested forbidden schema-chat capability: item/commandExecution/requestApproval',
      },
      done: false,
    });
    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });
  });

  it('fails the turn if Codex starts a built-in command execution item', async () => {
    const request = vi.fn<CodexAppServerConnection['client']['request']>(async (method) => {
      if (method === 'initialize') {
        return {
          userAgent: 'codex',
          codexHome: '/tmp/codex',
          platformFamily: 'unix',
          platformOs: 'macos',
        };
      }
      if (method === 'turn/start') {
        return {
          turn: {
            id: 'turn-1',
            items: [],
            itemsView: 'complete',
            status: 'inProgress',
            error: null,
            startedAt: 1,
            completedAt: null,
            durationMs: null,
          },
        };
      }
      throw new Error(`unexpected method ${method}`);
    });
    const connection = fakeConnection(request);
    const runtime = new CodexProviderRuntime({
      execFile: supportedExec(),
      appServerFactory: vi.fn(() => connection),
    });
    const iterator = runtime
      .sendTurn({
        thread: { provider: 'codex', threadId: 'thread-1' },
        schema: { version: '1', types: [] },
        message: 'start the dev server',
      })
      [Symbol.asyncIterator]();

    await iterator.next();
    connection.emitNotification({
      jsonrpc: '2.0',
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: {
          type: 'commandExecution',
          id: 'cmd-1',
          command: 'bun run dev',
          cwd: '/Users/rufus/Apps/contexture',
          processId: null,
          source: 'agent',
          status: 'inProgress',
          commandActions: [],
          aggregatedOutput: null,
          exitCode: null,
          durationMs: null,
        },
      },
    });

    await expect(iterator.next()).resolves.toEqual({
      value: {
        type: 'turn_failed',
        message: 'Codex attempted forbidden schema-chat item: commandExecution',
      },
      done: false,
    });
    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });
  });

  it('rejects unsupported interactive server requests and fails the turn', async () => {
    const request = vi.fn<CodexAppServerConnection['client']['request']>(async (method) => {
      if (method === 'initialize') {
        return {
          userAgent: 'codex',
          codexHome: '/tmp/codex',
          platformFamily: 'unix',
          platformOs: 'macos',
        };
      }
      if (method === 'turn/start') {
        return {
          turn: {
            id: 'turn-1',
            items: [],
            itemsView: 'complete',
            status: 'inProgress',
            error: null,
            startedAt: 1,
            completedAt: null,
            durationMs: null,
          },
        };
      }
      throw new Error(`unexpected method ${method}`);
    });
    const connection = fakeConnection(request);
    const runtime = new CodexProviderRuntime({
      execFile: supportedExec(),
      appServerFactory: vi.fn(() => connection),
    });
    const iterator = runtime
      .sendTurn({
        thread: { provider: 'codex', threadId: 'thread-1' },
        schema: { version: '1', types: [] },
        message: 'ask the user',
      })
      [Symbol.asyncIterator]();

    await iterator.next();
    connection.emitServerRequest({
      jsonrpc: '2.0',
      id: 78,
      method: 'mcpServer/elicitation/request',
      params: { threadId: 'thread-1', turnId: 'turn-1' },
    });

    await vi.waitFor(() => {
      expect(connection.client.respondError).toHaveBeenCalledWith(
        78,
        -32000,
        'Codex requested forbidden schema-chat capability: mcpServer/elicitation/request',
      );
    });
    await expect(iterator.next()).resolves.toEqual({
      value: {
        type: 'turn_failed',
        message: 'Codex requested forbidden schema-chat capability: mcpServer/elicitation/request',
      },
      done: false,
    });
    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });
  });

  it('ignores forbidden requests that explicitly belong to another Codex thread', async () => {
    const request = vi.fn<CodexAppServerConnection['client']['request']>(async (method) => {
      if (method === 'initialize') {
        return {
          userAgent: 'codex',
          codexHome: '/tmp/codex',
          platformFamily: 'unix',
          platformOs: 'macos',
        };
      }
      if (method === 'turn/start') {
        return {
          turn: {
            id: 'turn-1',
            items: [],
            itemsView: 'complete',
            status: 'inProgress',
            error: null,
            startedAt: 1,
            completedAt: null,
            durationMs: null,
          },
        };
      }
      throw new Error(`unexpected method ${method}`);
    });
    const connection = fakeConnection(request);
    const runtime = new CodexProviderRuntime({
      execFile: supportedExec(),
      appServerFactory: vi.fn(() => connection),
    });
    const iterator = runtime
      .sendTurn({
        thread: { provider: 'codex', threadId: 'thread-1' },
        schema: { version: '1', types: [] },
        message: 'hello',
      })
      [Symbol.asyncIterator]();

    await iterator.next();
    connection.emitServerRequest({
      jsonrpc: '2.0',
      id: 79,
      method: 'item/commandExecution/requestApproval',
      params: {
        threadId: 'thread-2',
        turnId: 'turn-2',
        itemId: 'cmd-1',
        command: 'cat package.json',
      },
    });
    connection.emitNotification({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: {
          id: 'turn-1',
          items: [],
          itemsView: 'complete',
          status: 'completed',
          error: null,
          startedAt: 1,
          completedAt: 2,
          durationMs: 1,
        },
      },
    });

    expect(connection.client.respondError).not.toHaveBeenCalled();
    await expect(iterator.next()).resolves.toEqual({
      value: { type: 'turn_completed' },
      done: false,
    });
  });

  it('ignores forbidden requests that explicitly belong to another Codex turn', async () => {
    const request = vi.fn<CodexAppServerConnection['client']['request']>(async (method) => {
      if (method === 'initialize') {
        return {
          userAgent: 'codex',
          codexHome: '/tmp/codex',
          platformFamily: 'unix',
          platformOs: 'macos',
        };
      }
      if (method === 'turn/start') {
        return {
          turn: {
            id: 'turn-1',
            items: [],
            itemsView: 'complete',
            status: 'inProgress',
            error: null,
            startedAt: 1,
            completedAt: null,
            durationMs: null,
          },
        };
      }
      throw new Error(`unexpected method ${method}`);
    });
    const connection = fakeConnection(request);
    const runtime = new CodexProviderRuntime({
      execFile: supportedExec(),
      appServerFactory: vi.fn(() => connection),
    });
    const iterator = runtime
      .sendTurn({
        thread: { provider: 'codex', threadId: 'thread-1' },
        schema: { version: '1', types: [] },
        message: 'hello',
      })
      [Symbol.asyncIterator]();

    await iterator.next();
    connection.emitServerRequest({
      jsonrpc: '2.0',
      id: 80,
      method: 'item/commandExecution/requestApproval',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-2',
        itemId: 'cmd-1',
        command: 'cat package.json',
      },
    });
    connection.emitNotification({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: {
          id: 'turn-1',
          items: [],
          itemsView: 'complete',
          status: 'completed',
          error: null,
          startedAt: 1,
          completedAt: 2,
          durationMs: 1,
        },
      },
    });

    expect(connection.client.respondError).not.toHaveBeenCalled();
    await expect(iterator.next()).resolves.toEqual({
      value: { type: 'turn_completed' },
      done: false,
    });
  });
});
