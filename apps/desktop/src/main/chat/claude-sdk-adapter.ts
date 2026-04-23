/**
 * `SdkPort` adapter over `@anthropic-ai/claude-agent-sdk`.
 *
 * Responsible for:
 *   - Projecting `AuthMode` onto `ANTHROPIC_API_KEY` (api-key mode) or
 *     leaving env alone (max mode, with the SDK shelling out to the
 *     Claude CLI at `pathToClaudeCodeExecutable`).
 *   - Configuring the system-prompt preset (Claude Code) with our append
 *     body, the MCP op tool list, the plugin skills path, and the model/
 *     thinking settings.
 *   - Squeezing the SDK's wide message union into `DriverSdkMessage`, and
 *     extracting the `session_id` from the `system/init` frame so
 *     `ChatSession` can capture a resume id.
 *   - Exposing a `cancel()` that calls the iterator's `interrupt()` —
 *     `ChatSession` raises `ChatCancelledError` after the loop exits,
 *     which rolls the turn back silently.
 */
import type { createSdkMcpServer, query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import type {
  AuthMode,
  DriverSdkMessage,
  ModelId,
  SdkPort,
  SdkQueryRun,
  ThinkingBudget,
} from './chat-session';

const THINKING_TOKENS: Record<ThinkingBudget, number | undefined> = {
  auto: undefined,
  low: 2048,
  med: 8192,
  high: 16000,
};

/** Built-in Claude Code tools we never want the schema-editor agent to reach for. */
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

export interface ClaudeSdkAdapterDeps {
  query: typeof sdkQuery;
  mcpServer: ReturnType<typeof createSdkMcpServer>;
  /** Pre-computed `mcp__<server>__<tool>` names for `allowedTools`. */
  mcpOpToolNames: readonly string[];
  /** Resolved plugin path, or null when the skills dir is absent. */
  skillsPluginPath: string | null;
  /** Resolved absolute path to the `claude` CLI, or a bare name to defer PATH lookup. */
  getClaudeCliPath: () => string;
}

export function createClaudeSdkAdapter(deps: ClaudeSdkAdapterDeps): SdkPort {
  return {
    query(input) {
      const iterator = deps.query({
        prompt: input.prompt,
        options: buildSdkOptions(deps, input),
      });

      const run: SdkQueryRun = {
        stream: projectMessages(iterator),
        cancel: async () => {
          try {
            await iterator.interrupt();
          } catch {
            // Best-effort; the session will still time out the stream
            // via the cancel flag.
          }
        },
      };
      return run;
    },
  };
}

function buildSdkOptions(
  deps: ClaudeSdkAdapterDeps,
  input: {
    systemPromptAppend: string;
    resume?: string;
    auth: AuthMode;
    model: ModelId;
    thinkingBudget: ThinkingBudget;
  },
): Parameters<typeof sdkQuery>[0]['options'] {
  const env: Record<string, string> | undefined =
    input.auth.mode === 'api-key' && input.auth.key
      ? { ANTHROPIC_API_KEY: input.auth.key }
      : undefined;
  const thinkingTokens = THINKING_TOKENS[input.thinkingBudget];

  return {
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: input.systemPromptAppend,
    },
    allowedTools: [...deps.mcpOpToolNames],
    disallowedTools: DISALLOWED_BUILTINS,
    model: input.model,
    ...(thinkingTokens !== undefined ? { maxThinkingTokens: thinkingTokens } : {}),
    mcpServers: { 'contexture-ops': deps.mcpServer },
    pathToClaudeCodeExecutable: deps.getClaudeCliPath(),
    ...(deps.skillsPluginPath ? { plugins: [{ type: 'local', path: deps.skillsPluginPath }] } : {}),
    ...(input.resume ? { resume: input.resume } : {}),
    ...(env ? { env } : {}),
  };
}

async function* projectMessages(
  iterator: ReturnType<typeof sdkQuery>,
): AsyncGenerator<DriverSdkMessage> {
  for await (const msg of iterator) {
    const sessionMsg = extractSessionMessage(msg);
    if (sessionMsg) yield sessionMsg;
    const mapped = mapSdkMessage(msg);
    if (mapped) yield mapped;
  }
}

/**
 * Pull the session id out of the SDK's `system/init` message — canonical
 * id for the whole conversation. Later messages echo it but `init` is the
 * one that survives resume.
 */
function extractSessionMessage(
  msg: unknown,
): Extract<DriverSdkMessage, { type: 'session' }> | null {
  if (!msg || typeof msg !== 'object') return null;
  const m = msg as { type?: unknown; subtype?: unknown; session_id?: unknown };
  if (m.type !== 'system' || m.subtype !== 'init') return null;
  const sid = m.session_id;
  if (typeof sid === 'string' && sid.length > 0) {
    return { type: 'session', sessionId: sid };
  }
  return null;
}

/**
 * Squeeze the SDK's wide message union down to the `DriverSdkMessage`
 * shape. Only `assistant` text / tool-use and `result` are forwarded;
 * intermediate status / stream / hook messages are dropped.
 */
function mapSdkMessage(msg: unknown): DriverSdkMessage | null {
  if (!msg || typeof msg !== 'object') return null;
  const m = msg as { type: string; message?: { content?: unknown } };
  if (m.type === 'assistant') {
    const content = Array.isArray(m.message?.content) ? m.message?.content : [];
    const textParts = content
      .filter(
        (p): p is { type: 'text'; text: string } =>
          !!p &&
          typeof p === 'object' &&
          (p as { type?: unknown }).type === 'text' &&
          typeof (p as { text?: unknown }).text === 'string',
      )
      .map((p) => p.text);
    const toolUseParts = content.filter(
      (p): p is { type: 'tool_use'; name: string; input: unknown } =>
        !!p && typeof p === 'object' && (p as { type?: unknown }).type === 'tool_use',
    );
    if (textParts.length > 0) {
      return { type: 'assistant', text: textParts.join('') };
    }
    if (toolUseParts.length > 0) {
      return {
        type: 'tool_use',
        name: toolUseParts[0].name,
        input: toolUseParts[0].input,
      };
    }
    return null;
  }
  if (m.type === 'result') {
    const rm = m as { type: 'result'; subtype?: string; is_error?: boolean; result?: string };
    return {
      type: 'result',
      ok: rm.subtype === 'success' && rm.is_error !== true,
      error: rm.is_error ? rm.result : undefined,
    };
  }
  return null;
}
