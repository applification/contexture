import { tmpdir } from 'node:os';
import { SYSTEM_PROMPT_STDLIB } from '@shared/stdlib-registry';
import { buildSystemPromptAppend } from '@shared/system-prompt';
import type { OpToolDescriptor } from '../../ops';
import { overlayModelOptions } from '../model-registry';
import type {
  CancelLoginInput,
  GenerateTextInput,
  InterruptTurnInput,
  LoginFlow,
  ModelInfo,
  ModelOptionDescriptor,
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
import { appendAssistantText } from '../runtime';
import { type CodexAppServerConnection, startCodexAppServer } from './app-server';
import { codexCliInfoToStatus, detectCodexCli, type ExecFileFn } from './cli';
import { handleCodexDynamicToolCall, toCodexDynamicTools } from './tools';
import type {
  AccountRateLimitsUpdatedNotification,
  AccountUpdatedNotification,
  AgentMessageDeltaNotification,
  AskForApproval,
  CancelLoginAccountResponse,
  DynamicToolCallItem,
  DynamicToolCallParams,
  ErrorNotification,
  GetAccountRateLimitsResponse,
  GetAccountResponse,
  InitializeResponse,
  ItemNotification,
  LoginAccountResponse,
  LogoutAccountResponse,
  ModelListResponse,
  RateLimitSnapshot,
  ServerNotification,
  ServerRequest,
  ThreadResumeResponse,
  ThreadRollbackResponse,
  ThreadStartResponse,
  TurnCompletedNotification,
  TurnInterruptResponse,
  TurnStartResponse,
} from './types';

export const CODEX_PROVIDER_CAPABILITIES: ProviderCapabilities = {
  authModes: ['chatgpt', 'api-key'],
  modelSource: 'runtime',
  supportsThreadResume: true,
  supportsThreadRollback: true,
  supportsDynamicTools: true,
  supportsMcpTools: false,
  supportsInterrupt: true,
  supportsRateLimitStatus: true,
  supportsReasoningEffort: true,
  supportsSchemaOnlyMode: true,
};

const SCHEMA_AGENT_CODEX_CWD = tmpdir();
const SCHEMA_AGENT_APPROVAL_POLICY: AskForApproval = {
  granular: {
    sandbox_approval: true,
    rules: true,
    skill_approval: true,
    request_permissions: true,
    mcp_elicitations: true,
  },
};

export interface CodexProviderRuntimeOptions {
  execFile?: ExecFileFn;
  appServerFactory?: (codexPath?: string) => CodexAppServerConnection;
  opToolDescriptors?: OpToolDescriptor[];
}

export class CodexProviderRuntime implements ProviderRuntime {
  readonly provider = 'codex' as const;
  readonly capabilities = CODEX_PROVIDER_CAPABILITIES;
  readonly #execFile?: ExecFileFn;
  readonly #appServerFactory: (codexPath?: string) => CodexAppServerConnection;
  readonly #opToolDescriptors: OpToolDescriptor[];
  #connection: CodexAppServerConnection | null = null;
  #initializePromise: Promise<InitializeResponse> | null = null;
  #lastAuthenticatedReadiness: ProviderStatus['readiness'] = 'not_signed_in';
  #textGenerationThreads = new Set<string>();

  constructor(options: CodexProviderRuntimeOptions = {}) {
    this.#execFile = options.execFile;
    this.#appServerFactory =
      options.appServerFactory ?? ((codexPath) => startCodexAppServer({ codexPath }));
    this.#opToolDescriptors = options.opToolDescriptors ?? [];
  }

  async getStatus(): Promise<ProviderStatus> {
    const cli = await detectCodexCli(this.#execFile);
    const cliStatus = codexCliInfoToStatus(cli);
    if (!cli.installed || !cli.supported) return cliStatus;

    try {
      const connection = await this.#ensureConnection(cli.path ?? undefined);
      const response = await connection.client.request<GetAccountResponse>('account/read', {});
      if (response.account?.type === 'chatgpt' || response.account?.type === 'apiKey') {
        const readiness =
          response.account.type === 'chatgpt' ? 'authenticated_chatgpt' : 'authenticated_api_key';
        this.#lastAuthenticatedReadiness = readiness;
        const status: ProviderStatus = {
          provider: 'codex',
          readiness,
          cliVersion: cli.version ?? undefined,
          minimumCliVersion: cliStatus.minimumCliVersion,
        };
        return (await this.#readRateLimitStatus(status)) ?? status;
      }
      this.#lastAuthenticatedReadiness = 'not_signed_in';
      return {
        provider: 'codex',
        readiness: 'not_signed_in',
        cliVersion: cli.version ?? undefined,
        minimumCliVersion: cliStatus.minimumCliVersion,
      };
    } catch (err) {
      return {
        ...cliStatus,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const connection = await this.#ensureConnection();
    const models: ModelInfo[] = [];
    let cursor: string | null = null;

    do {
      const response = await connection.client.request<ModelListResponse>('model/list', {
        cursor,
        includeHidden: false,
      });
      for (const model of response.data) {
        models.push(
          overlayModelOptions('codex', {
            id: model.model || model.id,
            label: codexModelLabel(model.displayName || model.model || model.id),
            supportsReasoningEffort: model.supportedReasoningEfforts.length > 0,
            optionDescriptors: codexOptionDescriptors(
              model.supportedReasoningEfforts,
              model.defaultReasoningEffort,
              model.serviceTiers,
            ),
          }),
        );
      }
      cursor = response.nextCursor;
    } while (cursor);

    return models;
  }

  async startThread(input: StartThreadInput): Promise<ProviderThreadRef> {
    return this.#startThread(input, {
      developerInstructions: buildSchemaOnlyInstructions(),
      dynamicTools: toCodexDynamicTools(this.#opToolDescriptors),
    });
  }

  async #startThread(
    input: StartThreadInput,
    options: {
      developerInstructions: string;
      dynamicTools: ReturnType<typeof toCodexDynamicTools>;
    },
  ): Promise<ProviderThreadRef> {
    const connection = await this.#ensureConnection();
    const response = await connection.client.request<ThreadStartResponse>('thread/start', {
      model: input.model ?? null,
      serviceTier: codexServiceTier(input.options),
      cwd: SCHEMA_AGENT_CODEX_CWD,
      approvalPolicy: SCHEMA_AGENT_APPROVAL_POLICY,
      sandbox: 'read-only',
      environments: [],
      config: {
        web_search: 'disabled',
        tools: { view_image: false },
      },
      developerInstructions: options.developerInstructions,
      dynamicTools: options.dynamicTools,
      experimentalRawEvents: false,
      persistExtendedHistory: false,
    });
    return {
      provider: 'codex',
      threadId: response.thread.id,
      opaque: { thread: response.thread },
    };
  }

  async resumeThread(input: ResumeThreadInput): Promise<ProviderThreadRef> {
    const connection = await this.#ensureConnection();
    const response = await connection.client.request<ThreadResumeResponse>('thread/resume', {
      threadId: input.thread.threadId,
      model: input.model ?? null,
      serviceTier: codexServiceTier(input.options),
      cwd: SCHEMA_AGENT_CODEX_CWD,
      approvalPolicy: SCHEMA_AGENT_APPROVAL_POLICY,
      sandbox: 'read-only',
      config: {
        web_search: 'disabled',
        tools: { view_image: false },
      },
      developerInstructions: buildSchemaOnlyInstructions(),
      dynamicTools: toCodexDynamicTools(this.#opToolDescriptors),
      excludeTurns: true,
      persistExtendedHistory: false,
    });
    return {
      provider: 'codex',
      threadId: response.thread.id,
      opaque: { thread: response.thread },
    };
  }

  async *sendTurn(input: SendTurnInput): AsyncIterable<ProviderRuntimeEvent> {
    const connection = await this.#ensureConnection();
    const queue = new AsyncEventQueue<ProviderRuntimeEvent>();
    let turnId: string | null = null;
    let finalAssistant = '';
    let currentAssistantItemId: string | null = null;

    const offNotification = connection.client.onNotification((message) => {
      const statusEvent = this.#mapStatusNotification(message as ServerNotification);
      if (statusEvent) {
        queue.push(statusEvent);
        return;
      }
      const event = mapCodexNotification(message as ServerNotification, input.thread, turnId);
      if (!event) return;
      if (event.type === 'assistant_delta') {
        const itemId = readAgentMessageItemId(message as ServerNotification);
        const boundary: 'new_message' | undefined =
          itemId && currentAssistantItemId && itemId !== currentAssistantItemId
            ? 'new_message'
            : undefined;
        if (itemId) currentAssistantItemId = itemId;
        const delta = boundary ? { ...event, boundary } : event;
        finalAssistant = appendAssistantText(finalAssistant, delta.text, delta.boundary);
        queue.push(delta);
        return;
      }
      queue.push(event);
      if (
        event.type === 'turn_completed' ||
        event.type === 'turn_failed' ||
        event.type === 'turn_interrupted'
      ) {
        if (finalAssistant.trim()) queue.push({ type: 'assistant_final', text: finalAssistant });
        queue.close();
      }
    });

    const offServerRequest = connection.client.onServerRequest((message, client) => {
      const request = message as ServerRequest;
      const requestThreadId = readServerRequestThreadId(request);
      if (requestThreadId && requestThreadId !== input.thread.threadId) return false;
      const requestTurnId = readServerRequestTurnId(request);
      if (turnId && requestTurnId && requestTurnId !== turnId) return false;
      const forbidden = forbiddenServerRequestMessage(request);
      if (forbidden) {
        client.respondError(request.id, -32000, forbidden);
        queue.push({ type: 'turn_failed', message: forbidden });
        queue.close();
        return true;
      }
      if (request.method !== 'item/tool/call') return false;
      const params = request.params as DynamicToolCallParams;
      if (params.threadId !== input.thread.threadId) return false;
      if (this.#textGenerationThreads.has(input.thread.threadId)) {
        const message = `Codex requested forbidden reconcile proposal tool: ${params.tool}`;
        client.respondError(request.id, -32000, message);
        queue.push({ type: 'turn_failed', message });
        queue.close();
        return true;
      }
      handleCodexDynamicToolCall(params, this.#opToolDescriptors)
        .then((result) => client.respond(request.id, result))
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          client.respondError(request.id, -32000, message);
        });
      return true;
    });

    try {
      const response = await connection.client.request<TurnStartResponse>('turn/start', {
        threadId: input.thread.threadId,
        input: [{ type: 'text', text: input.message, text_elements: [] }],
        environments: [],
        cwd: SCHEMA_AGENT_CODEX_CWD,
        approvalPolicy: SCHEMA_AGENT_APPROVAL_POLICY,
        sandboxPolicy: { type: 'readOnly', networkAccess: false },
        model: input.model ?? null,
        serviceTier: codexServiceTier(input.options),
        effort: readStringOption(input.options, 'reasoningEffort') ?? input.effort ?? null,
      });
      turnId = response.turn.id;
      writeCurrentTurnId(input.thread, turnId);
      yield { type: 'turn_started', thread: input.thread };

      for await (const event of queue) {
        yield event;
      }
    } finally {
      offNotification();
      offServerRequest();
    }
  }

  async generateText(input: GenerateTextInput): Promise<string> {
    const thread = await this.#startThread(input, {
      developerInstructions: input.systemPrompt,
      dynamicTools: [],
    });
    let buffered = '';
    this.#textGenerationThreads.add(thread.threadId);
    try {
      for await (const event of this.sendTurn({ ...input, thread })) {
        if (event.type === 'assistant_delta') {
          buffered = appendAssistantText(buffered, event.text, event.boundary);
        }
        if (event.type === 'tool_call_started') {
          throw new Error(`Codex reconcile proposal requested forbidden tool: ${event.name}`);
        }
        if (event.type === 'turn_failed') throw new Error(event.message);
        if (event.type === 'turn_interrupted') {
          throw new Error(event.message ?? 'Codex reconcile proposal was interrupted');
        }
      }
    } finally {
      this.#textGenerationThreads.delete(thread.threadId);
    }
    return buffered;
  }

  async interruptTurn(input: InterruptTurnInput): Promise<void> {
    const turnId = readCurrentTurnId(input.thread);
    if (!turnId) throw new Error('Cannot interrupt Codex turn before a turn id is known');
    const connection = await this.#ensureConnection();
    await connection.client.request<TurnInterruptResponse>('turn/interrupt', {
      threadId: input.thread.threadId,
      turnId,
    });
  }

  async rollbackThread(input: RollbackThreadInput): Promise<void> {
    const connection = await this.#ensureConnection();
    await connection.client.request<ThreadRollbackResponse>('thread/rollback', {
      threadId: input.thread.threadId,
      numTurns: input.turns,
    });
  }

  async startLogin(input: StartLoginInput): Promise<LoginFlow> {
    const connection = await this.#ensureConnection();
    if (input.mode === 'api-key') {
      if (!input.apiKey) throw new Error('API key is required for Codex API-key login');
      await connection.client.request<LoginAccountResponse>('account/login/start', {
        type: 'apiKey',
        apiKey: input.apiKey,
      });
      return { id: 'api-key', mode: 'api-key' };
    }

    const response = await connection.client.request<LoginAccountResponse>('account/login/start', {
      type: 'chatgpt',
      codexStreamlinedLogin: true,
    });
    if (response.type !== 'chatgpt' || !response.loginId) {
      throw new Error(`Unexpected Codex login response: ${response.type}`);
    }
    return { id: response.loginId, mode: 'chatgpt', url: response.authUrl };
  }

  async cancelLogin(input: CancelLoginInput): Promise<void> {
    const connection = await this.#ensureConnection();
    await connection.client.request<CancelLoginAccountResponse>('account/login/cancel', {
      loginId: input.flowId,
    });
  }

  async logout(): Promise<void> {
    const connection = await this.#ensureConnection();
    await connection.client.request<LogoutAccountResponse>('account/logout', undefined);
  }

  async #readRateLimitStatus(baseStatus: ProviderStatus): Promise<ProviderStatus | null> {
    try {
      const connection = await this.#ensureConnection();
      const response =
        await connection.client.request<GetAccountRateLimitsResponse>('account/rateLimits/read');
      const snapshot = pickCodexRateLimitSnapshot(response);
      if (!isRateLimited(snapshot)) return null;
      return {
        ...baseStatus,
        readiness: 'rate_limited',
        detail: rateLimitDetail(snapshot),
      };
    } catch (err) {
      return {
        ...baseStatus,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  #mapStatusNotification(message: ServerNotification): ProviderRuntimeEvent | null {
    if (message.method === 'account/rateLimits/updated') {
      const snapshot = (message as AccountRateLimitsUpdatedNotification).params.rateLimits;
      if (isRateLimited(snapshot)) {
        return {
          type: 'status_changed',
          status: {
            provider: 'codex',
            readiness: 'rate_limited',
            detail: rateLimitDetail(snapshot),
          },
        };
      }
      return {
        type: 'status_changed',
        status: {
          provider: 'codex',
          readiness: this.#lastAuthenticatedReadiness,
        },
      };
    }

    if (message.method === 'account/updated') {
      const { authMode } = (message as AccountUpdatedNotification).params;
      if (authMode === 'chatgpt' || authMode === 'chatgptAuthTokens') {
        this.#lastAuthenticatedReadiness = 'authenticated_chatgpt';
      } else if (authMode === 'apikey') {
        this.#lastAuthenticatedReadiness = 'authenticated_api_key';
      } else {
        this.#lastAuthenticatedReadiness = 'not_signed_in';
      }
      return {
        type: 'auth_changed',
        status: {
          provider: 'codex',
          readiness: this.#lastAuthenticatedReadiness,
        },
      };
    }

    return null;
  }

  async #ensureConnection(codexPath?: string): Promise<CodexAppServerConnection> {
    if (this.#connection && this.#initializePromise) {
      await this.#initializePromise;
      return this.#connection;
    }

    const cli = codexPath ? null : await detectCodexCli(this.#execFile);
    if (cli && !cli.installed) throw new Error('Codex CLI is not installed');
    if (cli && !cli.supported) throw new Error('Codex CLI version is not supported');

    const connection = this.#appServerFactory(codexPath ?? cli?.path ?? undefined);
    this.#connection = connection;
    connection.process.once('exit', () => {
      if (this.#connection === connection) {
        this.#connection = null;
        this.#initializePromise = null;
      }
    });
    this.#initializePromise = connection.client.request<InitializeResponse>('initialize', {
      clientInfo: {
        name: 'contexture',
        title: 'Contexture',
        version: '0.14.0',
      },
      capabilities: {
        experimentalApi: true,
      },
    });
    try {
      await this.#initializePromise;
      return connection;
    } catch (err) {
      if (this.#connection === connection) {
        this.#connection = null;
        this.#initializePromise = null;
      }
      throw err;
    }
  }
}

const CODEX_REASONING_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra High',
};

function codexOptionDescriptors(
  supportedReasoningEfforts: unknown[],
  defaultReasoningEffort?: string | null,
  serviceTiers: Array<{ id: string; name: string; description: string }> = [],
): ModelOptionDescriptor[] {
  const options = supportedReasoningEfforts
    .map(readReasoningEffortOption)
    .filter((option): option is { id: string; label: string } => option !== null);
  const descriptors: ModelOptionDescriptor[] = [];

  const defaultId =
    typeof defaultReasoningEffort === 'string' &&
    options.some((option) => option.id === defaultReasoningEffort)
      ? defaultReasoningEffort
      : options.some((option) => option.id === 'high')
        ? 'high'
        : options[0]?.id;

  if (options.length > 0) {
    descriptors.push({
      id: 'reasoningEffort',
      type: 'select',
      label: 'Effort',
      options: options.map((option) => ({
        ...option,
        ...(option.id === defaultId ? { isDefault: true } : {}),
      })),
    });
  }

  if (serviceTiers.some((tier) => tier.id === 'priority')) {
    descriptors.push({ id: 'fastMode', type: 'boolean', label: 'Fast', defaultValue: false });
  }

  return descriptors;
}

function readReasoningEffortOption(value: unknown): { id: string; label: string } | null {
  if (typeof value === 'string' && value.trim()) {
    const id = value.trim();
    return { id, label: CODEX_REASONING_LABELS[id] ?? id };
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const rawId = record.reasoningEffort ?? record.id ?? record.value;
  if (typeof rawId !== 'string' || !rawId.trim()) return null;
  const id = rawId.trim();
  return { id, label: CODEX_REASONING_LABELS[id] ?? id };
}

function codexModelLabel(label: string): string {
  return label.replace(/^gpt-/i, 'GPT-');
}

function buildSchemaOnlyInstructions(): string {
  return [
    'You are Contexture schema chat.',
    'Use only the Contexture schema tools provided by this client.',
    'Do not read files, write files, run shell commands, browse, or mutate a repository.',
    'You may use file contents explicitly attached inside the user message as context.',
    'Inspect the current Contexture schema through the provided read-only schema tools before making or discussing model changes.',
    '',
    buildSystemPromptAppend({ stdlibRegistry: SYSTEM_PROMPT_STDLIB }),
  ].join('\n');
}

function readCurrentTurnId(thread: ProviderThreadRef): string | null {
  if (!thread.opaque || typeof thread.opaque !== 'object') return null;
  const currentTurnId = (thread.opaque as { currentTurnId?: unknown }).currentTurnId;
  return typeof currentTurnId === 'string' && currentTurnId.length > 0 ? currentTurnId : null;
}

function readAgentMessageItemId(message: ServerNotification): string | null {
  if (message.method !== 'item/agentMessage/delta') return null;
  const params = message.params;
  if (!params || typeof params !== 'object') return null;
  const itemId = (params as { itemId?: unknown }).itemId;
  return typeof itemId === 'string' && itemId.length > 0 ? itemId : null;
}

function writeCurrentTurnId(thread: ProviderThreadRef, turnId: string): void {
  const opaque = thread.opaque && typeof thread.opaque === 'object' ? thread.opaque : {};
  thread.opaque = { ...opaque, currentTurnId: turnId };
}

function mapCodexNotification(
  message: ServerNotification,
  thread: ProviderThreadRef,
  currentTurnId: string | null,
): ProviderRuntimeEvent | null {
  const params = 'params' in message ? message.params : null;
  if (!params || typeof params !== 'object') return null;
  const threadId = (params as { threadId?: unknown }).threadId;
  if (threadId !== thread.threadId) return null;
  const turnId = readNotificationTurnId(params);
  if (currentTurnId && turnId && turnId !== currentTurnId) return null;

  switch (message.method) {
    case 'item/agentMessage/delta':
      return {
        type: 'assistant_delta',
        text: (message as AgentMessageDeltaNotification).params.delta,
      };
    case 'item/started': {
      const item = (message as ItemNotification).params.item;
      const forbidden = forbiddenThreadItemMessage(item);
      if (forbidden) return { type: 'turn_failed', message: forbidden };
      if (item.type !== 'dynamicToolCall') return null;
      const toolCall = item as unknown as DynamicToolCallItem;
      return {
        type: 'tool_call_started',
        id: toolCall.id,
        name: toolCall.tool,
        input: toolCall.arguments,
      };
    }
    case 'item/completed': {
      const item = (message as ItemNotification).params.item;
      const forbidden = forbiddenThreadItemMessage(item);
      if (forbidden) return { type: 'turn_failed', message: forbidden };
      if (item.type !== 'dynamicToolCall') return null;
      const toolCall = item as unknown as DynamicToolCallItem;
      return {
        type: 'tool_call_finished',
        id: toolCall.id,
        name: toolCall.tool,
        ok: toolCall.success === true,
        result: toolCall.contentItems,
      };
    }
    case 'turn/completed':
      return mapTurnCompleted(message.params as TurnCompletedNotification);
    case 'error': {
      const params = (message as ErrorNotification).params;
      if (params.willRetry) return null;
      return {
        type: 'turn_failed',
        message: params.error.message,
      };
    }
    default:
      return null;
  }
}

function readNotificationTurnId(params: object): string | null {
  const turnId = (params as { turnId?: unknown }).turnId;
  if (typeof turnId === 'string') return turnId;
  const turn = (params as { turn?: unknown }).turn;
  if (!turn || typeof turn !== 'object') return null;
  const nestedTurnId = (turn as { id?: unknown }).id;
  return typeof nestedTurnId === 'string' ? nestedTurnId : null;
}

function mapTurnCompleted(notification: TurnCompletedNotification): ProviderRuntimeEvent {
  const { turn } = notification;
  if (turn.status === 'completed') return { type: 'turn_completed' };
  if (turn.status === 'interrupted') return { type: 'turn_interrupted' };
  return {
    type: 'turn_failed',
    message: turn.error?.message ?? `Codex turn ended with status ${turn.status}`,
  };
}

function forbiddenServerRequestMessage(request: ServerRequest): string | null {
  const method = request.method as string;
  if (
    method.startsWith('command/') ||
    method.startsWith('fs/') ||
    method === 'thread/shellCommand'
  ) {
    return `Codex requested forbidden schema-chat capability: ${method}`;
  }

  const forbiddenMethods = new Set([
    'item/commandExecution/requestApproval',
    'item/fileChange/requestApproval',
    'item/permissions/requestApproval',
    'item/tool/requestUserInput',
    'mcpServer/elicitation/request',
    'applyPatchApproval',
    'execCommandApproval',
  ]);
  if (!forbiddenMethods.has(method)) return null;
  return `Codex requested forbidden schema-chat capability: ${method}`;
}

function forbiddenThreadItemMessage(item: { type: string }): string | null {
  const forbiddenTypes = new Set([
    'commandExecution',
    'fileChange',
    'mcpToolCall',
    'webSearch',
    'collabAgentToolCall',
  ]);
  if (!forbiddenTypes.has(item.type)) return null;
  return `Codex attempted forbidden schema-chat item: ${item.type}`;
}

function pickCodexRateLimitSnapshot(
  response: GetAccountRateLimitsResponse,
): RateLimitSnapshot | null {
  return response.rateLimitsByLimitId?.codex ?? response.rateLimits;
}

function isRateLimited(snapshot: RateLimitSnapshot | null): boolean {
  if (!snapshot) return false;
  if (snapshot.rateLimitReachedType) return true;
  return false;
}

function rateLimitDetail(snapshot: RateLimitSnapshot | null): string | undefined {
  if (!snapshot) return undefined;
  if (snapshot.rateLimitReachedType) return snapshot.rateLimitReachedType.replaceAll('_', ' ');
  return undefined;
}

function readServerRequestThreadId(request: ServerRequest): string | null {
  const params = 'params' in request ? request.params : null;
  if (!params || typeof params !== 'object') return null;
  const threadId = (params as { threadId?: unknown }).threadId;
  return typeof threadId === 'string' ? threadId : null;
}

function readServerRequestTurnId(request: ServerRequest): string | null {
  const params = 'params' in request ? request.params : null;
  if (!params || typeof params !== 'object') return null;
  const turnId = (params as { turnId?: unknown }).turnId;
  return typeof turnId === 'string' ? turnId : null;
}

function readStringOption(
  options: Record<string, string | boolean> | undefined,
  key: string,
): string | null {
  const value = options?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function codexServiceTier(options: Record<string, string | boolean> | undefined): string | null {
  return options?.fastMode === true ? 'priority' : null;
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
  readonly #values: T[] = [];
  readonly #waiters: Array<(result: IteratorResult<T>) => void> = [];
  #closed = false;

  push(value: T): void {
    if (this.#closed) return;
    const waiter = this.#waiters.shift();
    if (waiter) waiter({ value, done: false });
    else this.#values.push(value);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.#values.shift();
        if (value) return Promise.resolve({ value, done: false });
        if (this.#closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise<IteratorResult<T>>((resolve) => this.#waiters.push(resolve));
      },
    };
  }
}
