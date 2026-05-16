import type { Schema } from '@renderer/model/ir';

export type ProviderKind = 'codex' | 'claude';

export type ProviderAuthMode = 'chatgpt' | 'api-key' | 'cli-session' | 'none';

export interface ProviderCapabilities {
  authModes: ProviderAuthMode[];
  modelSource: 'runtime' | 'static';
  supportsThreadResume: boolean;
  supportsThreadRollback: boolean;
  supportsDynamicTools: boolean;
  supportsMcpTools: boolean;
  supportsInterrupt: boolean;
  supportsRateLimitStatus: boolean;
  supportsReasoningEffort: boolean;
  supportsSchemaOnlyMode: boolean;
}

export type ProviderReadiness =
  | 'cli_missing'
  | 'cli_outdated'
  | 'app_server_unavailable'
  | 'not_signed_in'
  | 'authenticated_cli'
  | 'authenticated_chatgpt'
  | 'authenticated_api_key'
  | 'rate_limited'
  | 'desynced';

export interface ProviderStatus {
  provider: ProviderKind;
  readiness: ProviderReadiness;
  detail?: string;
  cliVersion?: string;
  minimumCliVersion?: string;
}

export interface ModelInfo {
  id: string;
  label: string;
  supportsReasoningEffort?: boolean;
  optionDescriptors?: ModelOptionDescriptor[];
}

export type ModelOptionValue = string | boolean;
export type ModelOptions = Record<string, ModelOptionValue>;

export type ModelOptionDescriptor =
  | {
      id: string;
      type: 'select';
      label: string;
      options: Array<{ id: string; label: string; isDefault?: boolean }>;
      currentValue?: string;
    }
  | {
      id: string;
      type: 'boolean';
      label: string;
      defaultValue?: boolean;
      currentValue?: boolean;
    };

export interface ProviderThreadRef {
  provider: ProviderKind;
  threadId: string;
  opaque?: unknown;
}

export interface StartThreadInput {
  model?: string;
  effort?: string;
  options?: ModelOptions;
  schema: Schema;
}

export interface SendTurnInput {
  thread: ProviderThreadRef;
  message: string;
  schema: Schema;
  model?: string;
  effort?: string;
  options?: ModelOptions;
}

export interface GenerateTextInput {
  systemPrompt: string;
  message: string;
  schema: Schema;
  model?: string;
  effort?: string;
  options?: ModelOptions;
}

export interface ResumeThreadInput {
  thread: ProviderThreadRef;
  model?: string;
  effort?: string;
  options?: ModelOptions;
}

export interface InterruptTurnInput {
  thread: ProviderThreadRef;
}

export interface RollbackThreadInput {
  thread: ProviderThreadRef;
  turns: number;
}

export interface StartLoginInput {
  mode: Extract<ProviderAuthMode, 'chatgpt' | 'api-key' | 'cli-session'>;
  apiKey?: string;
}

export interface CancelLoginInput {
  flowId: string;
}

export interface LoginFlow {
  id: string;
  mode: ProviderAuthMode;
  url?: string;
}

export type ProviderRuntimeEvent =
  | { type: 'status_changed'; status: ProviderStatus }
  | { type: 'auth_changed'; status: ProviderStatus }
  | { type: 'thread_started'; thread: ProviderThreadRef }
  | { type: 'thread_resumed'; thread: ProviderThreadRef }
  | { type: 'turn_started'; thread: ProviderThreadRef }
  | { type: 'assistant_delta'; text: string }
  | { type: 'assistant_final'; text: string }
  | { type: 'tool_call_started'; id: string; name: string; input?: unknown }
  | { type: 'tool_call_finished'; id: string; name: string; ok: boolean; result?: unknown }
  | { type: 'turn_completed' }
  | { type: 'turn_failed'; message: string }
  | { type: 'turn_interrupted'; message?: string }
  | { type: 'thread_desynced'; thread: ProviderThreadRef; reason: string };

export interface ProviderRuntime {
  provider: ProviderKind;
  capabilities: ProviderCapabilities;

  getStatus(): Promise<ProviderStatus>;
  listModels(): Promise<ModelInfo[]>;

  startThread(input: StartThreadInput): Promise<ProviderThreadRef>;
  resumeThread(input: ResumeThreadInput): Promise<ProviderThreadRef>;
  sendTurn(input: SendTurnInput): AsyncIterable<ProviderRuntimeEvent>;
  generateText(input: GenerateTextInput): Promise<string>;
  interruptTurn(input: InterruptTurnInput): Promise<void>;
  rollbackThread(input: RollbackThreadInput): Promise<void>;

  startLogin(input: StartLoginInput): Promise<LoginFlow>;
  cancelLogin(input: CancelLoginInput): Promise<void>;
  logout(): Promise<void>;
}
