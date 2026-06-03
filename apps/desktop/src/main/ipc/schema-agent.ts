import { IRSchema, type Schema } from '@contexture/core';
import {
  CHAT_CONTEXT_MAX_FILE_BYTES,
  CHAT_CONTEXT_MAX_IMAGE_BYTES,
  CHAT_CONTEXT_MAX_TOTAL_BYTES,
} from '@shared/chat-attachments';
import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import { z } from 'zod';
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
import { createSchemaReadTools } from '../providers/schema-read-tools';
import { generateReconcileProposal, type ReconcileProposalInput } from '../reconcile/proposals';
import { ChatTurnController } from './chat-turn';
import { type BridgeTransport, makeIpcForwardOp, TurnContext } from './op-bridge';
import { IpcString, parseIpcPayload } from './validation';

export interface SchemaAgentIpc {
  runtime: ProviderRuntime;
  driver: SchemaAgentDriver;
  turnContext: TurnContext;
}

const ProviderKindSchema = z.enum(['codex', 'claude']);
const ProviderOrUndefinedSchema = z.union([ProviderKindSchema, z.undefined()]);
const ModelOptionValueSchema = z.union([z.string(), z.boolean()]);
const ModelOptionsPayloadSchema = z
  .object({
    model: z.string().optional(),
    effort: z.string().optional(),
    options: z.record(z.string(), ModelOptionValueSchema).optional(),
  })
  .strict();
const ToolReplySchema = z
  .object({
    id: IpcString,
    result: z.unknown(),
  })
  .strict();
const StartLoginPayloadSchema = z
  .object({
    mode: z.enum(['chatgpt', 'api-key', 'cli-session']),
    apiKey: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.mode === 'api-key' && !input.apiKey) {
      ctx.addIssue({
        code: 'custom',
        path: ['apiKey'],
        message: 'API key is required for api-key login.',
      });
    }
  });
const CancelLoginPayloadSchema = z
  .object({
    flowId: IpcString,
  })
  .strict();
const ProviderThreadRefSchema = z
  .object({
    provider: ProviderKindSchema,
    threadId: IpcString,
    opaque: z.unknown().optional(),
  })
  .strict();
const ChatContextAttachmentSchema = z
  .object({
    id: IpcString,
    path: IpcString,
    name: IpcString,
    size: z.number().int().nonnegative(),
    content: z.string(),
    kind: z.enum(['text', 'image']).optional(),
    mimeType: IpcString.optional(),
    encoding: z.literal('base64').optional(),
    truncated: z.boolean().optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    const contentBytes = Buffer.byteLength(input.content, 'utf8');
    const isImage = input.kind === 'image';
    const maxBytes = isImage ? CHAT_CONTEXT_MAX_IMAGE_BYTES : CHAT_CONTEXT_MAX_FILE_BYTES;
    const measuredBytes = isImage ? input.size : contentBytes;
    if (measuredBytes > maxBytes) {
      ctx.addIssue({
        code: 'custom',
        path: [isImage ? 'size' : 'content'],
        message: isImage
          ? 'Attached image exceeds the per-file chat context limit.'
          : 'Attached file content exceeds the per-file chat context limit.',
      });
    }
  });
const SchemaAgentSendPayloadSchema = z
  .object({
    message: IpcString,
    attachments: z.array(ChatContextAttachmentSchema).default([]),
  })
  .strict()
  .superRefine((input, ctx) => {
    const total = input.attachments.reduce(
      (sum, attachment) => sum + Buffer.byteLength(attachment.content, 'utf8'),
      0,
    );
    if (total > CHAT_CONTEXT_MAX_TOTAL_BYTES) {
      ctx.addIssue({
        code: 'custom',
        path: ['attachments'],
        message: 'Attached files exceed the chat context size limit.',
      });
    }
  });
const ReconcileProposalPayloadSchema = z
  .object({
    irJson: z.string(),
    onDiskSource: z.string(),
    targetKind: IpcString,
  })
  .strict() as z.ZodType<ReconcileProposalInput>;

export function registerSchemaAgentIpc(mainWindow: BrowserWindow): SchemaAgentIpc {
  const toolTransport: BridgeTransport = {
    send: (id, payload) => {
      mainWindow.webContents.send('schema-agent:tool-request', { id, op: payload });
    },
  };

  const reportValidationError = (err: unknown): void => {
    const message = err instanceof Error ? err.message : String(err);
    mainWindow.webContents.send(SCHEMA_AGENT_ERROR, { message });
  };

  ipcMain.on('schema-agent:tool-reply', (_evt, message: unknown) => {
    try {
      const parsed = parseIpcPayload('schema-agent:tool-reply', ToolReplySchema, message);
      toolTransport.onReply?.(parsed.id, parsed.result);
    } catch (err) {
      reportValidationError(err);
    }
  });

  const forwardOp = makeIpcForwardOp(toolTransport);
  const opToolDescriptors = [
    ...createSchemaReadTools(() => turnContext.current()),
    ...createOpTools(forwardOp),
  ];
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

  ipcMain.on('schema-agent:set-ir', (_evt, ir: unknown) => {
    try {
      turnContext.pushIR(parseIpcPayload('schema-agent:set-ir', IRSchema, ir));
    } catch (err) {
      reportValidationError(err);
    }
  });

  ipcMain.handle('schema-agent:send', async (_evt, payload: unknown) => {
    try {
      const parsed =
        typeof payload === 'string'
          ? { message: parseIpcPayload('schema-agent:send', IpcString, payload), attachments: [] }
          : parseIpcPayload('schema-agent:send', SchemaAgentSendPayloadSchema, payload);
      await driver.send(parsed.message, parsed.attachments);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('schema-agent:reconcile', async (_evt, payload: unknown) => {
    const parsed = parseIpcPayload(
      'schema-agent:reconcile',
      ReconcileProposalPayloadSchema,
      payload,
    );
    return generateReconcileProposal({
      runtime: activeRuntime(),
      schema: turnContext.current() ?? parseSchemaPayload(parsed.irJson),
      modelOptions: currentModelOptions[currentProvider],
      payload: parsed,
    });
  });

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
    const parsedProvider = parseIpcPayload(
      'schema-agent:list-models',
      ProviderOrUndefinedSchema,
      provider,
    );
    const runtime = parsedProvider ? runtimeForProvider(parsedProvider) : activeRuntime();
    if (!runtime) return [];
    return runtime.listModels();
  });
  ipcMain.handle('schema-agent:set-provider', (_evt, provider: unknown) => {
    const parsed = ProviderKindSchema.safeParse(provider);
    if (!parsed.success) {
      return { ok: false, error: 'Unsupported schema-agent provider' };
    }
    currentProvider = parsed.data;
    return { ok: true };
  });
  ipcMain.handle('schema-agent:set-model-options', (_evt, options: unknown) => {
    const parsed = parseIpcPayload(
      'schema-agent:set-model-options',
      ModelOptionsPayloadSchema,
      options,
    );
    currentModelOptions[currentProvider] = {
      ...(parsed.model ? { model: parsed.model } : {}),
      ...(parsed.effort ? { effort: parsed.effort } : {}),
      ...(parsed.options ? { options: parsed.options } : {}),
    };
    return { ok: true };
  });
  ipcMain.handle('schema-agent:start-login', (_evt, input: unknown) =>
    activeRuntime().startLogin(
      parseIpcPayload('schema-agent:start-login', StartLoginPayloadSchema, input),
    ),
  );
  ipcMain.handle('schema-agent:cancel-login', (_evt, input: unknown) =>
    activeRuntime().cancelLogin(
      parseIpcPayload('schema-agent:cancel-login', CancelLoginPayloadSchema, input),
    ),
  );
  ipcMain.handle('schema-agent:logout', () => activeRuntime().logout());
  ipcMain.handle('schema-agent:thread-clear', () => {
    currentThreads[currentProvider] = undefined;
    return { ok: true };
  });
  ipcMain.handle('schema-agent:thread-set', async (_evt, input: unknown) => {
    const thread = parseIpcPayload('schema-agent:thread-set', ProviderThreadRefSchema, input);
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
    const schema = IRSchema.safeParse(parsed);
    if (schema.success) return schema.data;
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
