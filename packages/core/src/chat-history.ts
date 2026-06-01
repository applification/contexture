/**
 * Chat history sidecar I/O (`.contexture/chat.json`).
 *
 * Chat history is disposable sidecar state. Invalid or unknown versions are
 * discarded with a warning rather than blocking the Contexture IR.
 */

import type { AgentTurnOpResult, AgentTurnRecord } from './agent-turn-ledger';
import { IRSchema } from './ir';
import { OpSchema } from './ops';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessageContextAttachment {
  id: string;
  path: string;
  name: string;
  size: number;
  kind?: 'text' | 'image';
  mimeType?: string;
  truncated?: boolean;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  contextAttachments?: ChatMessageContextAttachment[];
}

export interface ChatHistory {
  version: '1';
  messages: ChatMessage[];
  provider?: 'codex' | 'claude';
  providerThreadRef?: unknown;
  model?: string;
  effort?: string;
  modelOptions?: Record<string, string | boolean>;
  agentTurns?: AgentTurnRecord[];
}

export interface LoadChatHistoryResult {
  history: ChatHistory;
  warnings: string[];
}

export const CHAT_HISTORY_VERSION = '1';

export const DEFAULT_CHAT_HISTORY: ChatHistory = {
  version: CHAT_HISTORY_VERSION,
  messages: [],
};

export function loadChatHistory(raw: string): LoadChatHistoryResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      history: defaults(),
      warnings: [`Chat history discarded: invalid JSON (${detail}).`],
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      history: defaults(),
      warnings: ['Chat history discarded: not an object.'],
    };
  }

  const obj = parsed as Record<string, unknown>;
  const version = typeof obj.version === 'string' ? obj.version : undefined;
  if (version !== CHAT_HISTORY_VERSION) {
    return {
      history: defaults(),
      warnings: [
        `Chat history discarded: unrecognised version "${String(version)}" ` +
          `(expected "${CHAT_HISTORY_VERSION}").`,
      ],
    };
  }

  const provider = obj.provider === 'codex' || obj.provider === 'claude' ? obj.provider : undefined;
  const providerThreadRef =
    obj.providerThreadRef && typeof obj.providerThreadRef === 'object'
      ? obj.providerThreadRef
      : undefined;
  const model = typeof obj.model === 'string' ? obj.model : undefined;
  const effort = typeof obj.effort === 'string' ? obj.effort : undefined;
  const modelOptions = sanitiseModelOptions(obj.modelOptions);
  const agentTurns = sanitiseAgentTurns(obj.agentTurns);
  return {
    history: {
      version: CHAT_HISTORY_VERSION,
      messages: sanitiseMessages(obj.messages),
      ...(provider ? { provider } : {}),
      ...(providerThreadRef ? { providerThreadRef } : {}),
      ...(model ? { model } : {}),
      ...(effort ? { effort } : {}),
      ...(modelOptions ? { modelOptions } : {}),
      ...(agentTurns.length > 0 ? { agentTurns } : {}),
    },
    warnings: [],
  };
}

export function saveChatHistory(history: ChatHistory): string {
  return JSON.stringify(history, null, 2);
}

function defaults(): ChatHistory {
  return { version: CHAT_HISTORY_VERSION, messages: [] };
}

function sanitiseMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  const out: ChatMessage[] = [];
  for (const value of input) {
    if (!value || typeof value !== 'object') continue;
    const { id, role, content, createdAt, contextAttachments } = value as Record<string, unknown>;
    if (
      typeof id === 'string' &&
      (role === 'user' || role === 'assistant' || role === 'system') &&
      typeof content === 'string' &&
      typeof createdAt === 'number'
    ) {
      const attachments = sanitiseContextAttachments(contextAttachments);
      out.push({
        id,
        role,
        content,
        createdAt,
        ...(attachments.length > 0 ? { contextAttachments: attachments } : {}),
      });
    }
  }
  return out;
}

function sanitiseContextAttachments(input: unknown): ChatMessageContextAttachment[] {
  if (!Array.isArray(input)) return [];
  const out: ChatMessageContextAttachment[] = [];
  for (const value of input) {
    if (!value || typeof value !== 'object') continue;
    const { id, path, name, size, kind, mimeType, truncated } = value as Record<string, unknown>;
    if (
      typeof id === 'string' &&
      typeof path === 'string' &&
      typeof name === 'string' &&
      typeof size === 'number'
    ) {
      out.push({
        id,
        path,
        name,
        size,
        ...(kind === 'text' || kind === 'image' ? { kind } : {}),
        ...(typeof mimeType === 'string' ? { mimeType } : {}),
        ...(truncated === true ? { truncated: true } : {}),
      });
    }
  }
  return out;
}

function sanitiseModelOptions(input: unknown): Record<string, string | boolean> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const entries = Object.entries(input as Record<string, unknown>).filter(
    (entry): entry is [string, string | boolean] =>
      typeof entry[1] === 'string' || typeof entry[1] === 'boolean',
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function sanitiseAgentTurns(input: unknown): AgentTurnRecord[] {
  if (!Array.isArray(input)) return [];
  const turns: AgentTurnRecord[] = [];
  for (const value of input) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    if (
      typeof record.id !== 'string' ||
      !isAgentTurnStatus(record.status) ||
      typeof record.startedAt !== 'string' ||
      !Array.isArray(record.ops) ||
      typeof record.summary !== 'string'
    ) {
      continue;
    }
    turns.push({
      id: record.id,
      status: record.status,
      startedAt: record.startedAt,
      ...(typeof record.finishedAt === 'string' ? { finishedAt: record.finishedAt } : {}),
      ...(typeof record.userMessage === 'string' ? { userMessage: record.userMessage } : {}),
      ...(typeof record.assistantText === 'string' ? { assistantText: record.assistantText } : {}),
      ...(typeof record.provider === 'string' ? { provider: record.provider } : {}),
      ...(typeof record.model === 'string' ? { model: record.model } : {}),
      ...(record.providerThreadRef ? { providerThreadRef: record.providerThreadRef } : {}),
      ...(typeof record.beforeHash === 'string' ? { beforeHash: record.beforeHash } : {}),
      ...(typeof record.afterHash === 'string' ? { afterHash: record.afterHash } : {}),
      ...readSchemaField('before', record.before),
      ...readSchemaField('after', record.after),
      ops: sanitiseAgentTurnOps(record.ops),
      summary: record.summary,
    });
  }
  return turns;
}

function sanitiseAgentTurnOps(input: unknown): AgentTurnOpResult[] {
  if (!Array.isArray(input)) return [];
  const ops: AgentTurnOpResult[] = [];
  for (const value of input) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    if (
      typeof record.id !== 'string' ||
      typeof record.name !== 'string' ||
      !isAgentTurnOpStatus(record.status)
    ) {
      continue;
    }
    const parsedOp = OpSchema.safeParse(record.op);
    ops.push({
      id: record.id,
      name: record.name,
      status: record.status,
      ...(record.input !== undefined ? { input: record.input } : {}),
      ...(parsedOp.success ? { op: parsedOp.data } : {}),
      ...(typeof record.error === 'string' ? { error: record.error } : {}),
      ...(record.result !== undefined ? { result: record.result } : {}),
    });
  }
  return ops;
}

function readSchemaField(
  key: 'before' | 'after',
  value: unknown,
): Partial<Pick<AgentTurnRecord, 'before' | 'after'>> {
  const parsed = IRSchema.safeParse(value);
  return parsed.success ? { [key]: parsed.data } : {};
}

function isAgentTurnStatus(value: unknown): value is AgentTurnRecord['status'] {
  return value === 'running' || value === 'committed' || value === 'rolled_back';
}

function isAgentTurnOpStatus(value: unknown): value is AgentTurnOpResult['status'] {
  return value === 'pending' || value === 'applied' || value === 'rejected' || value === 'non_op';
}
