/**
 * Chat driver — orchestrates one chat turn end-to-end on the main side.
 *
 * Per user message it:
 *   1. Pulls the current IR from `getCurrentIR()` (pushed in via
 *      `claude:turn-start-ir` from the renderer before the turn).
 *   2. Builds the system-prompt *append* body via
 *      `buildSystemPromptAppend` — the append is handed to the Agent SDK
 *      alongside `{ type: 'preset', preset: 'claude_code' }` so bundled
 *      skills auto-load.
 *   3. Wraps the user's message with the current IR via
 *      `buildUserMessage` — the IR rides in the user turn (not the
 *      system prompt) so `resume`-based sessions still see the latest
 *      schema even though the session's original system prompt is
 *      replayed.
 *   4. Passes `resume` to the SDK when `getResumeSessionId()` returns a
 *      sessionId (set on every prior turn's last-seen id).
 *   5. Opens a `ChatTurnController` envelope so every op the SDK emits
 *      collapses into a single renderer-side undo entry.
 *   6. Streams SDK assistant text / tool-use / result / session to the
 *      renderer via `emitEvent`.
 *
 * The `query` function is injected so unit tests can feed a canned
 * async iterator without booting the Agent SDK or the MCP server.
 */

import {
  buildSystemPromptAppend,
  buildUserMessage,
  type StdlibRegistry,
} from '@renderer/chat/system-prompt';
import type { Schema } from '@renderer/model/ir';
import type { ChatTurnController } from './chat-turn';
import {
  ChatCancelledError,
  type ErrorClass,
  type RunWithRetryOptions,
  readClassification,
  runWithRetry,
} from './claude-errors';

/** Minimal SDK message surface the driver needs. */
export type DriverSdkMessage =
  | { type: 'assistant'; text: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: 'result'; ok: boolean; error?: string }
  | { type: 'session'; sessionId: string };

export type DriverQueryFn = (input: {
  prompt: string;
  systemPromptAppend: string;
  resume?: string;
}) => AsyncIterable<DriverSdkMessage>;

export interface DriverTransport {
  /** Emit a chat event to the renderer. Production wires to `webContents.send`. */
  send: (channel: string, payload: unknown) => void;
}

export interface ChatDriverDeps {
  query: DriverQueryFn;
  transport: DriverTransport;
  turnController: ChatTurnController;
  getCurrentIR: () => Schema | null;
  stdlibRegistry: StdlibRegistry;
  /**
   * Returns the last-seen Agent SDK session id, or undefined on the
   * first turn / after an explicit clear. Re-evaluated per turn, so the
   * driver always uses the freshest id.
   */
  getResumeSessionId: () => string | undefined;
  /**
   * Retry-wrapper overrides. Tests inject a fake sleep / random / Sentry
   * callback; production wires the real Sentry capture and leaves sleep
   * at its default.
   */
  retryOptions?: Pick<RunWithRetryOptions, 'captureException' | 'sleep' | 'random'>;
}

export const CHAT_ASSISTANT = 'chat:assistant' as const;
export const CHAT_TOOL_USE = 'chat:tool-use' as const;
export const CHAT_RESULT = 'chat:result' as const;
export const CHAT_ERROR = 'chat:error' as const;
export const CHAT_SESSION = 'chat:session' as const;
/**
 * Emitted when a turn fails due to an auth problem (401 / expired Claude
 * Max token / missing API key). Distinct from `CHAT_ERROR` so the UI can
 * surface a re-auth CTA rather than a generic error bubble.
 */
export const CHAT_AUTH_REQUIRED = 'chat:auth-required' as const;

export class ChatDriver {
  readonly #deps: ChatDriverDeps;

  constructor(deps: ChatDriverDeps) {
    this.#deps = deps;
  }

  /**
   * Run one user turn. Returns when the SDK stream finishes (or throws
   * if the body throws — `ChatTurnController.run` will still have sent
   * `turn:rollback` in that case).
   *
   * Error handling flow:
   *
   *   - `transient` — retried up to 3× with exponential backoff before
   *     the body is considered "committed" (has yielded any SDK message).
   *     After commit, retries stop (would double-fire tool calls).
   *   - `auth` — emits `chat:auth-required`; renderer surfaces a re-auth
   *     CTA. Turn is still rolled back.
   *   - `validation` — emits `chat:error` with the Zod / IR message so
   *     Claude (and the user) see what was wrong.
   *   - `cancel` — silent. `turn:rollback` still fires so any partial
   *     ops vanish as one undo step.
   *   - `unknown` / `transient-exhausted` — `chat:error` + Sentry.
   */
  async send(userMessage: string): Promise<void> {
    const {
      query,
      transport,
      turnController,
      getCurrentIR,
      stdlibRegistry,
      getResumeSessionId,
      retryOptions,
    } = this.#deps;

    const ir = getCurrentIR() ?? { version: '1', types: [] };
    const systemPromptAppend = buildSystemPromptAppend({ stdlibRegistry });
    const prompt = buildUserMessage({ ir, userMessage });
    const resume = getResumeSessionId();

    await turnController.run(async () => {
      try {
        // `committed` flips once the first SDK message is forwarded.
        // Past that point retry is unsafe: any tool calls already fired
        // can't be un-fired by replaying the iterator.
        let committed = false;
        await runWithRetry(
          async () => {
            for await (const msg of query({
              prompt,
              systemPromptAppend,
              ...(resume ? { resume } : {}),
            })) {
              committed = true;
              if (msg.type === 'assistant') {
                transport.send(CHAT_ASSISTANT, { text: msg.text });
              } else if (msg.type === 'tool_use') {
                transport.send(CHAT_TOOL_USE, { name: msg.name, input: msg.input });
              } else if (msg.type === 'result') {
                transport.send(CHAT_RESULT, { ok: msg.ok, error: msg.error });
              } else if (msg.type === 'session') {
                transport.send(CHAT_SESSION, { sessionId: msg.sessionId });
              }
            }
          },
          {
            ...retryOptions,
            phase: 'chat',
            isCommitted: () => committed,
          },
        );
      } catch (err) {
        // If the renderer triggered cancellation the driver throws a
        // ChatCancelledError from the abort hook; emit nothing to the
        // renderer — turnController still rolls back below.
        if (err instanceof ChatCancelledError) {
          throw err;
        }
        routeClassifiedError(err, transport);
        throw err;
      }
    });
  }
}

/**
 * Route an already-classified error to the right chat transport channel.
 * Exported for the test suite; the production caller is the driver's
 * own `send()` catch branch.
 */
export function routeClassifiedError(err: unknown, transport: DriverTransport): ErrorClass {
  const { class: cls, message } = readClassification(err);
  if (cls === 'auth') {
    transport.send(CHAT_AUTH_REQUIRED, { message });
    return cls;
  }
  if (cls === 'cancel') {
    // Cancels stay silent; the renderer already knows it aborted.
    return cls;
  }
  transport.send(CHAT_ERROR, { message });
  return cls;
}
