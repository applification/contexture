import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import { buildSystemPromptAppend } from '@renderer/chat/system-prompt';
import { SYSTEM_PROMPT_STDLIB } from '@renderer/services/stdlib-registry';
import { app } from 'electron';
import { ChatCancelledError } from '../../ipc/claude-errors';
import { invokeOpHandler, normalizeOpToolArgs } from '../../ipc/op-tool-bridge';
import type { OpToolDescriptor } from '../../ops';
import { CLAUDE_FALLBACK_MODELS, claudeModelFromSdk } from '../model-registry';
import type {
  CancelLoginInput,
  InterruptTurnInput,
  LoginFlow,
  ModelInfo,
  ProviderCapabilities,
  ProviderRuntime,
  ProviderRuntimeEvent,
  ProviderStatus,
  ProviderThreadRef,
  ResumeThreadInput,
  RollbackThreadInput,
  SendTurnInput,
  StartLoginInput,
  StartThreadInput,
} from '../runtime';
import { claudeCliInfoToStatus, detectClaudeCli, type ExecFileFn } from './cli';

export const CLAUDE_PROVIDER_CAPABILITIES: ProviderCapabilities = {
  authModes: ['cli-session', 'api-key'],
  modelSource: 'static',
  supportsThreadResume: true,
  supportsThreadRollback: false,
  supportsDynamicTools: false,
  supportsMcpTools: true,
  supportsInterrupt: true,
  supportsRateLimitStatus: false,
  supportsReasoningEffort: true,
  supportsSchemaOnlyMode: true,
};

const THINKING_TOKENS: Record<string, number | undefined> = {
  auto: undefined,
  low: 2048,
  med: 8192,
  medium: 8192,
  high: 16000,
  xhigh: 32000,
  max: 32000,
  ultrathink: 32000,
};

type ClaudeEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

const DISALLOWED_BUILTINS = [
  'Read',
  'Edit',
  'Write',
  'Bash',
  'Glob',
  'Grep',
  'Agent',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
];

type ClaudeQuery = typeof query;

export interface ClaudeProviderRuntimeOptions {
  execFile?: ExecFileFn;
  queryFn?: ClaudeQuery;
  opToolDescriptors?: OpToolDescriptor[];
  skillsPluginPath?: string | null;
}

type ClaudeAuth =
  | { mode: 'cli-session'; cliPath?: string | null }
  | { mode: 'api-key'; key: string };

export class ClaudeProviderRuntime implements ProviderRuntime {
  readonly provider = 'claude' as const;
  readonly capabilities = CLAUDE_PROVIDER_CAPABILITIES;
  readonly #execFile?: ExecFileFn;
  readonly #query: ClaudeQuery;
  readonly #opToolDescriptors: OpToolDescriptor[];
  readonly #mcpServer: ReturnType<typeof createSdkMcpServer>;
  readonly #allowedTools: string[];
  readonly #skillsPluginPath: string | null;
  #auth: ClaudeAuth = { mode: 'cli-session' };
  #currentQuery: { interrupt(): Promise<void> } | null = null;
  #cancelRequested = false;

  constructor(options: ClaudeProviderRuntimeOptions = {}) {
    this.#execFile = options.execFile;
    this.#query = options.queryFn ?? query;
    this.#opToolDescriptors = options.opToolDescriptors ?? [];
    this.#mcpServer = createSdkMcpServer({
      name: 'contexture-ops',
      version: '1.0.0',
      tools: this.#opToolDescriptors.map(toSdkTool),
    });
    this.#allowedTools = this.#opToolDescriptors.map((tool) => `mcp__contexture-ops__${tool.name}`);
    this.#skillsPluginPath =
      'skillsPluginPath' in options
        ? (options.skillsPluginPath ?? null)
        : resolveSkillsPluginPath();
  }

  async getStatus(): Promise<ProviderStatus> {
    if (this.#auth.mode === 'api-key') {
      return { provider: 'claude', readiness: 'authenticated_api_key' };
    }
    const cli = await detectClaudeCli(this.#execFile);
    if (cli.installed) this.#auth = { mode: 'cli-session', cliPath: cli.path };
    return claudeCliInfoToStatus(cli);
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const iterator = this.#query({
        prompt: emptyPrompt(),
        options: this.#baseQueryOptions(),
      });
      try {
        const models = (await iterator.supportedModels())
          .map(claudeModelFromSdk)
          .filter((model): model is ModelInfo => model !== null);
        return models.length > 0 ? models : CLAUDE_FALLBACK_MODELS;
      } finally {
        iterator.close?.();
      }
    } catch {
      return CLAUDE_FALLBACK_MODELS;
    }
  }

  async startThread(_input: StartThreadInput): Promise<ProviderThreadRef> {
    return {
      provider: 'claude',
      threadId: cryptoRandomId(),
      opaque: {},
    };
  }

  async resumeThread(input: ResumeThreadInput): Promise<ProviderThreadRef> {
    return input.thread;
  }

  async *sendTurn(input: SendTurnInput): AsyncIterable<ProviderRuntimeEvent> {
    const resume = readSessionId(input.thread);
    let finalAssistant = '';
    this.#cancelRequested = false;

    yield { type: 'turn_started', thread: input.thread };

    try {
      const thinking = claudeThinkingConfig(input.options);
      const effort = claudeEffort(input.options, input.effort);
      const fastMode = readBooleanOption(input.options, 'fastMode');
      const model = claudeModelWithContext(
        input.model ?? CLAUDE_FALLBACK_MODELS[0].id,
        input.options,
      );
      const iterator = this.#query({
        prompt: input.message,
        options: {
          ...this.#baseQueryOptions(),
          allowedTools: this.#allowedTools,
          disallowedTools: DISALLOWED_BUILTINS,
          model,
          ...(thinking ? { thinking } : {}),
          ...(effort ? { effort } : {}),
          ...(fastMode !== null ? { settings: { fastMode, fastModePerSessionOptIn: true } } : {}),
          mcpServers: { 'contexture-ops': this.#mcpServer },
          ...(resume ? { resume } : {}),
        },
      });
      this.#currentQuery = iterator;

      for await (const message of iterator) {
        const sessionId = extractSessionId(message);
        if (sessionId) {
          writeSessionId(input.thread, sessionId);
          yield { type: 'thread_resumed', thread: input.thread };
        }

        const event = mapClaudeMessage(message);
        if (!event) continue;
        if (event.type === 'assistant_delta') finalAssistant += event.text;
        yield event;
        if (event.type === 'turn_failed') return;
      }

      if (this.#cancelRequested) throw new ChatCancelledError();
      yield { type: 'turn_completed' };
      if (finalAssistant.trim()) yield { type: 'assistant_final', text: finalAssistant };
    } catch (err) {
      if (err instanceof ChatCancelledError) {
        yield { type: 'turn_interrupted', message: err.message };
        return;
      }
      yield { type: 'turn_failed', message: err instanceof Error ? err.message : String(err) };
    } finally {
      this.#cancelRequested = false;
      this.#currentQuery = null;
    }
  }

  async interruptTurn(_input: InterruptTurnInput): Promise<void> {
    if (!this.#currentQuery) throw new Error('no active Claude query');
    this.#cancelRequested = true;
    await this.#currentQuery.interrupt();
  }

  async rollbackThread(_input: RollbackThreadInput): Promise<void> {
    throw new Error('Claude provider does not support thread rollback');
  }

  async startLogin(input: StartLoginInput): Promise<LoginFlow> {
    if (input.mode === 'api-key') {
      if (!input.apiKey) throw new Error('API key is required for Claude API-key login');
      this.#auth = { mode: 'api-key', key: input.apiKey };
      return { id: 'api-key', mode: 'api-key' };
    }
    if (input.mode !== 'cli-session') {
      throw new Error(`Claude does not support ${input.mode} login`);
    }
    const cli = await detectClaudeCli(this.#execFile);
    if (!cli.installed) throw new Error('Claude CLI is not detected');
    this.#auth = { mode: 'cli-session', cliPath: cli.path };
    return { id: cli.path ?? 'claude', mode: 'cli-session' };
  }

  async cancelLogin(_input: CancelLoginInput): Promise<void> {
    return undefined;
  }

  async logout(): Promise<void> {
    this.#auth = { mode: 'cli-session' };
  }

  #baseQueryOptions(): Parameters<ClaudeQuery>[0]['options'] {
    return {
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: buildSystemPromptAppend({ stdlibRegistry: SYSTEM_PROMPT_STDLIB }),
      },
      pathToClaudeCodeExecutable:
        this.#auth.mode === 'cli-session' ? (this.#auth.cliPath ?? 'claude') : 'claude',
      ...(this.#skillsPluginPath
        ? { plugins: [{ type: 'local' as const, path: this.#skillsPluginPath }] }
        : {}),
      ...(this.#auth.mode === 'api-key' ? { env: { ANTHROPIC_API_KEY: this.#auth.key } } : {}),
    };
  }
}

async function* emptyPrompt(): AsyncIterable<never> {}

function toSdkTool(descriptor: OpToolDescriptor) {
  return tool(descriptor.name, descriptor.description, descriptor.inputSchema, (args) =>
    invokeOpHandler(
      descriptor.handler,
      normalizeOpToolArgs(descriptor, args as Record<string, unknown>),
    ),
  );
}

function mapClaudeMessage(message: unknown): ProviderRuntimeEvent | null {
  if (!message || typeof message !== 'object') return null;
  const msg = message as {
    type?: unknown;
    message?: { content?: unknown };
    subtype?: unknown;
    is_error?: unknown;
    result?: unknown;
  };
  if (msg.type === 'assistant') {
    const content = Array.isArray(msg.message?.content) ? msg.message.content : [];
    const textParts = content.filter(isTextPart).map((part) => part.text);
    if (textParts.length > 0) return { type: 'assistant_delta', text: textParts.join('') };
    const toolUse = content.find(isToolUsePart);
    if (toolUse) {
      return {
        type: 'tool_call_started',
        id: toolUse.id ?? toolUse.name,
        name: toolUse.name,
        input: toolUse.input,
      };
    }
  }
  if (msg.type === 'result' && (msg.subtype !== 'success' || msg.is_error === true)) {
    return {
      type: 'turn_failed',
      message: typeof msg.result === 'string' ? msg.result : 'Claude turn failed',
    };
  }
  return null;
}

function isTextPart(part: unknown): part is { type: 'text'; text: string } {
  return (
    !!part &&
    typeof part === 'object' &&
    (part as { type?: unknown }).type === 'text' &&
    typeof (part as { text?: unknown }).text === 'string'
  );
}

function isToolUsePart(
  part: unknown,
): part is { type: 'tool_use'; id?: string; name: string; input: unknown } {
  return (
    !!part &&
    typeof part === 'object' &&
    (part as { type?: unknown }).type === 'tool_use' &&
    typeof (part as { name?: unknown }).name === 'string'
  );
}

function extractSessionId(message: unknown): string | null {
  if (!message || typeof message !== 'object') return null;
  const msg = message as { type?: unknown; subtype?: unknown; session_id?: unknown };
  if (msg.type !== 'system' || msg.subtype !== 'init') return null;
  return typeof msg.session_id === 'string' && msg.session_id.length > 0 ? msg.session_id : null;
}

function readSessionId(thread: ProviderThreadRef): string | undefined {
  if (!thread.opaque || typeof thread.opaque !== 'object') return undefined;
  const sessionId = (thread.opaque as { sessionId?: unknown }).sessionId;
  return typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : undefined;
}

function claudeThinkingConfig(
  options: Record<string, string | boolean> | undefined,
): { type: 'adaptive' } | { type: 'disabled' } | undefined {
  if (options?.thinking === false) return { type: 'disabled' };
  if (options?.thinking === true) return { type: 'adaptive' };
  return undefined;
}

function claudeEffort(
  options: Record<string, string | boolean> | undefined,
  fallbackEffort: string | undefined,
): ClaudeEffort | undefined {
  const effort =
    readStringOption(options, 'reasoningEffort') ??
    readStringOption(options, 'effort') ??
    fallbackEffort;
  if (effort === 'ultrathink') return 'xhigh';
  if (
    effort === 'low' ||
    effort === 'medium' ||
    effort === 'high' ||
    effort === 'xhigh' ||
    effort === 'max'
  ) {
    return effort;
  }
  if (effort && THINKING_TOKENS[effort] !== undefined) return effort === 'med' ? 'medium' : 'high';
  return undefined;
}

function readStringOption(
  options: Record<string, string | boolean> | undefined,
  key: string,
): string | null {
  const value = options?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readBooleanOption(
  options: Record<string, string | boolean> | undefined,
  key: string,
): boolean | null {
  const value = options?.[key];
  return typeof value === 'boolean' ? value : null;
}

function claudeModelWithContext(
  model: string,
  options: Record<string, string | boolean> | undefined,
): string {
  const contextWindow = readStringOption(options, 'contextWindow');
  if (contextWindow === '1m' && !model.toLowerCase().includes('[1m]')) return `${model}[1m]`;
  if (contextWindow === '200k') return model.replace(/\[1m\]/gi, '');
  return model;
}

function writeSessionId(thread: ProviderThreadRef, sessionId: string): void {
  const opaque = thread.opaque && typeof thread.opaque === 'object' ? thread.opaque : {};
  thread.opaque = { ...opaque, sessionId };
  thread.threadId = sessionId;
}

function resolveSkillsPluginPath(): string | null {
  const candidates = [
    join(process.resourcesPath ?? '', 'skills'),
    join(app.getAppPath(), 'resources', 'skills'),
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(join(candidate, '.claude-plugin', 'plugin.json'))) return candidate;
  }
  return null;
}

function cryptoRandomId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID
    ? c.randomUUID()
    : `claude-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}
