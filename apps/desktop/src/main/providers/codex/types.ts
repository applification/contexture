export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

export type AskForApproval =
  | 'untrusted'
  | 'on-failure'
  | 'on-request'
  | 'never'
  | {
      granular: {
        sandbox_approval: boolean;
        rules: boolean;
        skill_approval: boolean;
        request_permissions: boolean;
        mcp_elicitations: boolean;
      };
    };

export interface InitializeResponse {
  userAgent?: string;
  codexHome?: string;
  platformFamily?: string;
  platformOs?: string;
}

export type Account =
  | { type: 'chatgpt'; email?: string | null; planType?: string | null }
  | { type: 'apiKey' };

export interface GetAccountResponse {
  account: Account | null;
  requiresOpenaiAuth?: boolean;
}

export interface LoginAccountResponse {
  type: 'chatgpt' | 'apiKey';
  loginId: string;
  authUrl?: string;
}

export type CancelLoginAccountResponse = Record<string, never>;
export type LogoutAccountResponse = Record<string, never>;
export type ThreadRollbackResponse = Record<string, never>;
export type TurnInterruptResponse = Record<string, never>;

export interface RateLimitWindow {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
}

export interface RateLimitSnapshot {
  limitId: string | null;
  limitName: string | null;
  primary: RateLimitWindow | null;
  secondary: RateLimitWindow | null;
  credits: { hasCredits: boolean; unlimited: boolean; balance: string | null } | null;
  planType: string | null;
  rateLimitReachedType:
    | 'rate_limit_reached'
    | 'workspace_owner_credits_depleted'
    | 'workspace_member_credits_depleted'
    | 'workspace_owner_usage_limit_reached'
    | 'workspace_member_usage_limit_reached'
    | null;
}

export interface GetAccountRateLimitsResponse {
  rateLimits: RateLimitSnapshot;
  rateLimitsByLimitId: Record<string, RateLimitSnapshot | undefined> | null;
}

export interface ModelListResponse {
  data: Array<{
    id: string;
    model?: string | null;
    displayName?: string | null;
    supportedReasoningEfforts: unknown[];
    defaultReasoningEffort?: string | null;
    serviceTiers?: Array<{ id: string; name: string; description: string }>;
    additionalSpeedTiers?: string[];
    isDefault?: boolean;
  }>;
  nextCursor: string | null;
}

export interface CodexThread {
  id: string;
  [key: string]: unknown;
}

export interface ThreadStartResponse {
  thread: CodexThread;
  model?: string;
  modelProvider?: string;
  serviceTier?: string | null;
}

export interface ThreadResumeResponse {
  thread: CodexThread;
  model?: string;
  modelProvider?: string;
  serviceTier?: string | null;
}

export interface Turn {
  id: string;
  status: 'inProgress' | 'completed' | 'failed' | 'interrupted' | 'cancelled' | 'pending' | string;
  error?: { message?: string | null } | null;
}

export interface TurnStartResponse {
  turn: Turn;
}

export interface TurnCompletedNotification {
  threadId: string;
  turn: Turn;
}

export interface DynamicToolSpec {
  namespace?: string;
  name: string;
  description: string;
  inputSchema: JsonValue;
  deferLoading?: boolean;
}

export interface DynamicToolCallParams {
  threadId: string;
  turnId: string;
  callId: string;
  namespace: string | null;
  tool: string;
  arguments: JsonValue;
}

export interface DynamicToolCallResponse {
  contentItems: Array<{ type: 'inputText'; text: string }>;
  success: boolean;
}

export type ServerRequest = {
  jsonrpc?: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
};

export interface ServerNotification {
  method: string;
  params?: unknown;
}

export interface AccountRateLimitsUpdatedNotification extends ServerNotification {
  method: 'account/rateLimits/updated';
  params: { rateLimits: RateLimitSnapshot };
}

export interface AccountUpdatedNotification extends ServerNotification {
  method: 'account/updated';
  params: { authMode: string | null };
}

export interface AgentMessageDeltaNotification extends ServerNotification {
  method: 'item/agentMessage/delta';
  params: { threadId: string; turnId?: string; delta: string };
}

export interface ItemNotification extends ServerNotification {
  method: 'item/started' | 'item/completed';
  params: { threadId: string; turnId?: string; item: ThreadItem };
}

export interface ErrorNotification extends ServerNotification {
  method: 'error';
  params: { willRetry?: boolean; error: { message: string } };
}

export interface DynamicToolCallItem {
  type: 'dynamicToolCall';
  id: string;
  namespace: string | null;
  tool: string;
  arguments: JsonValue;
  success: boolean | null;
  contentItems?: unknown;
}

export interface ThreadItem {
  type: string;
  id?: string;
  [key: string]: unknown;
}
