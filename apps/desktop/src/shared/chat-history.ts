/**
 * Chat history sidecar I/O (`.contexture/chat.json`).
 *
 * Like the layout sidecar, chat history is disposable and version-tombstoned
 * with `version: '1'`. Unrecognised versions are discarded with a warning
 * rather than throwing: losing chat transcript never blocks opening the schema.
 * Persistence can be disabled per-user via a settings toggle (handled by
 * callers).
 */

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** Unix ms. */
  createdAt: number;
}

export interface ChatHistory {
  version: '1';
  messages: ChatMessage[];
  provider?: 'codex' | 'claude';
  providerThreadRef?: unknown;
  model?: string;
  effort?: string;
  modelOptions?: Record<string, string | boolean>;
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

  const messages = sanitiseMessages(obj.messages);
  const provider = obj.provider === 'codex' || obj.provider === 'claude' ? obj.provider : undefined;
  const providerThreadRef =
    obj.providerThreadRef && typeof obj.providerThreadRef === 'object'
      ? obj.providerThreadRef
      : undefined;
  const model = typeof obj.model === 'string' ? obj.model : undefined;
  const effort = typeof obj.effort === 'string' ? obj.effort : undefined;
  const modelOptions = sanitiseModelOptions(obj.modelOptions);
  return {
    history: {
      version: CHAT_HISTORY_VERSION,
      messages,
      ...(provider ? { provider } : {}),
      ...(providerThreadRef ? { providerThreadRef } : {}),
      ...(model ? { model } : {}),
      ...(effort ? { effort } : {}),
      ...(modelOptions ? { modelOptions } : {}),
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

function sanitiseModelOptions(input: unknown): Record<string, string | boolean> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const entries = Object.entries(input as Record<string, unknown>).filter(
    (entry): entry is [string, string | boolean] =>
      typeof entry[1] === 'string' || typeof entry[1] === 'boolean',
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function sanitiseMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  const out: ChatMessage[] = [];
  for (const m of input) {
    if (!m || typeof m !== 'object') continue;
    const { id, role, content, createdAt } = m as Record<string, unknown>;
    if (
      typeof id === 'string' &&
      (role === 'user' || role === 'assistant' || role === 'system') &&
      typeof content === 'string' &&
      typeof createdAt === 'number'
    ) {
      out.push({ id, role, content, createdAt });
    }
  }
  return out;
}
