import type { Schema } from '@contexture/core';
import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import { createOpTools } from '../ops';
import { ClaudeProviderRuntime } from '../providers/claude/runtime';
import { CodexProviderRuntime } from '../providers/codex/runtime';
import type {
  ModelOptions,
  ProviderKind,
  ProviderRuntime,
  ProviderThreadRef,
} from '../providers/runtime';
import {
  SCHEMA_AGENT_ASSISTANT_DELTA,
  SCHEMA_AGENT_ASSISTANT_FINAL,
  SCHEMA_AGENT_ERROR,
  SCHEMA_AGENT_STATUS_CHANGED,
  SCHEMA_AGENT_THREAD_DESYNCED,
  SCHEMA_AGENT_THREAD_UPDATED,
  SCHEMA_AGENT_TOOL_CALL_FINISHED,
  SCHEMA_AGENT_TOOL_CALL_STARTED,
  SchemaAgentDriver,
} from '../providers/schema-agent-driver';
import { generateReconcileProposal, type ReconcileProposalInput } from '../reconcile/proposals';
import { ChatTurnController } from './chat-turn';
import { type BridgeTransport, makeIpcForwardOp, TurnContext } from './claude-bridge';

export interface SchemaAgentIpc {
  runtime: ProviderRuntime;
  driver: SchemaAgentDriver;
  turnContext: TurnContext;
}

export function registerSchemaAgentIpc(mainWindow: BrowserWindow): SchemaAgentIpc {
  const toolTransport: BridgeTransport = {
    send: (id, payload) => {
      mainWindow.webContents.send('schema-agent:tool-request', { id, op: payload });
    },
  };

  ipcMain.on('schema-agent:tool-reply', (_evt, message: { id: string; result: unknown }) => {
    toolTransport.onReply?.(message.id, message.result);
  });

  const forwardOp = makeIpcForwardOp(toolTransport);
  const opToolDescriptors = createOpTools(forwardOp);
  const runtimes: Record<ProviderKind, ProviderRuntime> = {
    codex: new CodexProviderRuntime({ opToolDescriptors }),
    claude: new ClaudeProviderRuntime({ opToolDescriptors }),
  };
  let currentProvider: ProviderKind = 'codex';
  const activeRuntime = (): ProviderRuntime => runtimes[currentProvider];
  const runtimeForProvider = (provider: unknown): ProviderRuntime | null => {
    if (provider !== 'codex' && provider !== 'claude') return null;
    return runtimes[provider];
  };
  const turnContext = new TurnContext();
  const currentThreads: Partial<Record<ProviderKind, ProviderThreadRef>> = {};
  const currentModelOptions: Partial<
    Record<ProviderKind, { model?: string; effort?: string; options?: ModelOptions }>
  > = {};
  const desyncedThreads = new Set<string>();

  const turnController = new ChatTurnController({
    send: (channel, payload) => mainWindow.webContents.send(channel, payload),
  });

  const driver = new SchemaAgentDriver({
    getRuntime: activeRuntime,
    turnController,
    transport: {
      send: (channel, payload) => mainWindow.webContents.send(channel, payload),
    },
    getCurrentIR: () => turnContext.current(),
    getThreadRef: () => currentThreads[currentProvider],
    setThreadRef: (thread) => {
      currentThreads[currentProvider] = thread;
    },
    markThreadDesynced: (thread) => {
      desyncedThreads.add(threadKey(thread));
    },
    getModelOptions: () => currentModelOptions[currentProvider] ?? {},
  });

  ipcMain.on('schema-agent:set-ir', (_evt, ir: Schema) => {
    turnContext.pushIR(ir);
  });

  ipcMain.handle('schema-agent:send', async (_evt, userMessage: string) => {
    try {
      await driver.send(userMessage);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('schema-agent:reconcile', async (_evt, payload: ReconcileProposalInput) =>
    generateReconcileProposal({
      runtime: activeRuntime(),
      schema: turnContext.current() ?? parseSchemaPayload(payload.irJson),
      modelOptions: currentModelOptions[currentProvider],
      payload,
    }),
  );

  ipcMain.handle('schema-agent:abort', async () => {
    const currentThread = currentThreads[currentProvider];
    if (!currentThread) return { ok: false, error: 'no active schema-agent thread' };
    try {
      await activeRuntime().interruptTurn({ thread: currentThread });
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('schema-agent:get-status', () => activeRuntime().getStatus());
  ipcMain.handle('schema-agent:list-models', (_evt, provider?: unknown) => {
    const runtime = provider ? runtimeForProvider(provider) : activeRuntime();
    if (!runtime) return [];
    return runtime.listModels();
  });
  ipcMain.handle('schema-agent:set-provider', (_evt, provider: unknown) => {
    if (provider !== 'codex' && provider !== 'claude') {
      return { ok: false, error: 'Unsupported schema-agent provider' };
    }
    currentProvider = provider;
    return { ok: true };
  });
  ipcMain.handle(
    'schema-agent:set-model-options',
    (_evt, options: { model?: string; effort?: string; options?: ModelOptions }) => {
      currentModelOptions[currentProvider] = {
        ...(options.model ? { model: options.model } : {}),
        ...(options.effort ? { effort: options.effort } : {}),
        ...(options.options ? { options: options.options } : {}),
      };
      return { ok: true };
    },
  );
  ipcMain.handle(
    'schema-agent:start-login',
    (_evt, input: { mode: 'chatgpt' | 'api-key' | 'cli-session'; apiKey?: string }) =>
      activeRuntime().startLogin(input),
  );
  ipcMain.handle('schema-agent:cancel-login', (_evt, input: { flowId: string }) =>
    activeRuntime().cancelLogin(input),
  );
  ipcMain.handle('schema-agent:logout', () => activeRuntime().logout());
  ipcMain.handle('schema-agent:thread-clear', () => {
    currentThreads[currentProvider] = undefined;
    return { ok: true };
  });
  ipcMain.handle('schema-agent:thread-set', async (_evt, thread: ProviderThreadRef) => {
    const runtime = runtimes[thread.provider] ?? activeRuntime();
    currentProvider = runtime.provider;
    if (desyncedThreads.has(threadKey(thread))) {
      mainWindow.webContents.send(SCHEMA_AGENT_THREAD_DESYNCED, {
        thread,
        reason: 'thread was previously marked desynced',
      });
      currentThreads[currentProvider] = undefined;
      return { ok: false, error: 'thread was previously marked desynced' };
    }

    try {
      currentThreads[currentProvider] = runtime.capabilities.supportsThreadResume
        ? await runtime.resumeThread({ thread, ...(currentModelOptions[currentProvider] ?? {}) })
        : thread;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      desyncedThreads.add(threadKey(thread));
      currentThreads[currentProvider] = undefined;
      mainWindow.webContents.send(SCHEMA_AGENT_THREAD_DESYNCED, { thread, reason });
      return { ok: false, error: reason };
    }

    mainWindow.webContents.send(SCHEMA_AGENT_THREAD_UPDATED, {
      thread: currentThreads[currentProvider],
    });
    return { ok: true };
  });

  void activeRuntime()
    .getStatus()
    .then((status) => {
      mainWindow.webContents.send(SCHEMA_AGENT_STATUS_CHANGED, status);
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      mainWindow.webContents.send(SCHEMA_AGENT_ERROR, { message });
    });

  return { runtime: activeRuntime(), driver, turnContext };
}

function threadKey(thread: ProviderThreadRef): string {
  return `${thread.provider}:${thread.threadId}`;
}

function parseSchemaPayload(irJson: string): Schema {
  try {
    const parsed = JSON.parse(irJson);
    if (parsed && typeof parsed === 'object') return parsed as Schema;
  } catch {
    // Fall through to an empty schema. The prompt still carries the raw IR
    // string, so this only protects provider runtimes that require a schema.
  }
  return { version: '1', types: [] };
}

export const SCHEMA_AGENT_CHANNELS = {
  assistantDelta: SCHEMA_AGENT_ASSISTANT_DELTA,
  assistantFinal: SCHEMA_AGENT_ASSISTANT_FINAL,
  toolCallStarted: SCHEMA_AGENT_TOOL_CALL_STARTED,
  toolCallFinished: SCHEMA_AGENT_TOOL_CALL_FINISHED,
  error: SCHEMA_AGENT_ERROR,
  statusChanged: SCHEMA_AGENT_STATUS_CHANGED,
  threadUpdated: SCHEMA_AGENT_THREAD_UPDATED,
  threadDesynced: SCHEMA_AGENT_THREAD_DESYNCED,
} as const;
