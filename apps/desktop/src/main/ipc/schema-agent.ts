import type { Schema } from '@renderer/model/ir';
import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import { createOpTools } from '../ops';
import { CodexProviderRuntime } from '../providers/codex/runtime';
import type { ProviderRuntime, ProviderThreadRef } from '../providers/runtime';
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
  const runtime = new CodexProviderRuntime({ opToolDescriptors });
  const turnContext = new TurnContext();
  let currentThread: ProviderThreadRef | undefined;
  let currentModelOptions: { model?: string; effort?: string } = {};
  const desyncedThreads = new Set<string>();

  const turnController = new ChatTurnController({
    send: (channel, payload) => mainWindow.webContents.send(channel, payload),
  });

  const driver = new SchemaAgentDriver({
    runtime,
    turnController,
    transport: {
      send: (channel, payload) => mainWindow.webContents.send(channel, payload),
    },
    getCurrentIR: () => turnContext.current(),
    getThreadRef: () => currentThread,
    setThreadRef: (thread) => {
      currentThread = thread;
    },
    markThreadDesynced: (thread) => {
      desyncedThreads.add(thread.threadId);
    },
    getModelOptions: () => currentModelOptions,
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

  ipcMain.handle('schema-agent:abort', async () => {
    if (!currentThread) return { ok: false, error: 'no active schema-agent thread' };
    try {
      await runtime.interruptTurn({ thread: currentThread });
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('schema-agent:get-status', () => runtime.getStatus());
  ipcMain.handle('schema-agent:list-models', () => runtime.listModels());
  ipcMain.handle('schema-agent:set-provider', (_evt, provider: unknown) => {
    if (provider !== 'codex') {
      return { ok: false, error: 'Only the Codex schema-agent provider is available' };
    }
    currentThread = undefined;
    return { ok: true };
  });
  ipcMain.handle(
    'schema-agent:set-model-options',
    (_evt, options: { model?: string; effort?: string }) => {
      currentModelOptions = {
        ...(options.model ? { model: options.model } : {}),
        ...(options.effort ? { effort: options.effort } : {}),
      };
      return { ok: true };
    },
  );
  ipcMain.handle(
    'schema-agent:start-login',
    (_evt, input: { mode: 'chatgpt' | 'api-key'; apiKey?: string }) => runtime.startLogin(input),
  );
  ipcMain.handle('schema-agent:cancel-login', (_evt, input: { flowId: string }) =>
    runtime.cancelLogin(input),
  );
  ipcMain.handle('schema-agent:logout', () => runtime.logout());
  ipcMain.handle('schema-agent:thread-clear', () => {
    currentThread = undefined;
    return { ok: true };
  });
  ipcMain.handle('schema-agent:thread-set', async (_evt, thread: ProviderThreadRef) => {
    if (desyncedThreads.has(thread.threadId)) {
      mainWindow.webContents.send(SCHEMA_AGENT_THREAD_DESYNCED, {
        thread,
        reason: 'thread was previously marked desynced',
      });
      currentThread = undefined;
      return { ok: false, error: 'thread was previously marked desynced' };
    }

    try {
      currentThread = runtime.capabilities.supportsThreadResume
        ? await runtime.resumeThread({ thread, ...currentModelOptions })
        : thread;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      desyncedThreads.add(thread.threadId);
      currentThread = undefined;
      mainWindow.webContents.send(SCHEMA_AGENT_THREAD_DESYNCED, { thread, reason });
      return { ok: false, error: reason };
    }

    mainWindow.webContents.send(SCHEMA_AGENT_THREAD_UPDATED, { thread: currentThread });
    return { ok: true };
  });

  void runtime
    .getStatus()
    .then((status) => {
      mainWindow.webContents.send(SCHEMA_AGENT_STATUS_CHANGED, status);
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      mainWindow.webContents.send(SCHEMA_AGENT_ERROR, { message });
    });

  return { runtime, driver, turnContext };
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
