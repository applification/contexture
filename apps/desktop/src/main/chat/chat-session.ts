/**
 * ChatSession — deep module owning one chat conversation end-to-end.
 *
 * Collapses the concerns previously spread across `chat-driver.ts`,
 * `chat-turn.ts`, and the module-global state on `claude.ts`:
 *
 *   1. Agent SDK `query()` invocation (via `SdkPort`)
 *   2. System-prompt append + user-message assembly
 *   3. Transaction envelope sequencing (begin / commit / rollback)
 *   4. Error classification (delegated to `claude-errors`)
 *   5. Retry-with-backoff, gated by the first SDK message (committed latch)
 *   6. Event fan-out to the renderer via `EventSinkPort`
 *   7. Session state — auth, model, resumeId, inFlight flag, cancellation —
 *      all on the instance, not module globals
 *
 * Callers (IPC handlers) use one common method, `turn(userText)`, plus a
 * small advanced surface (`cancel`, `setAuth`, `setModel`, ...). Channel
 * names and SDK message shape are hidden behind the sink / port.
 */
import {
  buildSystemPromptAppend,
  buildUserMessage,
  type StdlibRegistry,
} from '@renderer/chat/system-prompt';
import type { Schema } from '@renderer/model/ir';
import {
  ChatCancelledError,
  type RunWithRetryOptions,
  readClassification,
  runWithRetry,
} from '../ipc/claude-errors';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AuthMode = { mode: 'max' } | { mode: 'api-key'; key: string };

export type ModelId = 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6' | 'claude-opus-4-6';
export type ThinkingBudget = 'auto' | 'low' | 'med' | 'high';

/** Discriminated union of every event the session emits over its lifetime. */
export type TurnEvent =
  | { kind: 'turn-begin' }
  | { kind: 'assistant'; textDelta: string }
  | { kind: 'tool-use'; name: string; input: unknown }
  | { kind: 'result'; ok: boolean; error?: string }
  | { kind: 'session'; sessionId: string }
  | { kind: 'error'; message: string }
  | { kind: 'auth-required'; message: string }
  | { kind: 'turn-commit' }
  | { kind: 'turn-rollback'; cause: TurnFailure };

export type TurnFailure =
  | { class: 'auth'; message: string }
  | { class: 'validation'; message: string }
  | { class: 'cancel' }
  | { class: 'exhausted'; message: string }
  | { class: 'unknown'; message: string };

export interface TurnResult {
  status: 'ok' | 'error' | 'cancelled';
  failure?: TurnFailure;
  sessionId?: string;
}

/** Minimal SDK message surface the session needs. */
export type DriverSdkMessage =
  | { type: 'assistant'; text: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: 'result'; ok: boolean; error?: string }
  | { type: 'session'; sessionId: string };

/**
 * Handle exposed by the SDK port while a query is in flight. `cancel` is
 * called when `ChatSession.cancel()` fires; the iterator unwinds cleanly
 * and the session raises `ChatCancelledError` to trigger rollback.
 */
export interface SdkQueryRun {
  /** Messages streamed from the SDK. */
  readonly stream: AsyncIterable<DriverSdkMessage>;
  /** Best-effort cancellation. Resolving the returned promise is optional. */
  cancel(): Promise<void>;
}

export interface SdkPort {
  /**
   * Start one SDK query. Called at most once per active turn; the session
   * drives the resulting iterable to completion (or interrupts it).
   */
  query(input: {
    prompt: string;
    systemPromptAppend: string;
    resume?: string;
    auth: AuthMode;
    model: ModelId;
    thinkingBudget: ThinkingBudget;
  }): SdkQueryRun;
}

export interface EventSinkPort {
  emit(event: TurnEvent): void;
}

export interface ClockPort {
  sleep(ms: number): Promise<void>;
  random(): number;
}

export interface ChatSessionDeps {
  sdk: SdkPort;
  sink: EventSinkPort;
  getCurrentIR: () => Schema | null;
  stdlibRegistry: StdlibRegistry;
  /** Initial resumeId, typically loaded from the chat sidecar. */
  initialSessionId?: string;
  /** Initial auth mode; defaults to `{ mode: 'max' }`. */
  initialAuth?: AuthMode;
  /** Initial model/thinking budget. */
  initialModel?: ModelId;
  initialThinkingBudget?: ThinkingBudget;
  /** Optional clock / retry overrides (tests only). */
  clock?: ClockPort;
  captureException?: RunWithRetryOptions['captureException'];
}

export interface SessionState {
  readonly resumeId?: string;
  readonly inFlight: boolean;
  readonly auth: AuthMode;
  readonly model: ModelId;
  readonly thinkingBudget: ThinkingBudget;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const defaultClock: ClockPort = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: Math.random,
};

export class ChatSession {
  readonly #deps: ChatSessionDeps;
  readonly #clock: ClockPort;

  #auth: AuthMode;
  #model: ModelId;
  #thinkingBudget: ThinkingBudget;
  #resumeId: string | undefined;
  #activeRun: SdkQueryRun | null = null;
  #cancelRequested = false;
  /** Tail of the serialized turn queue — concurrent `turn()` calls await. */
  #turnTail: Promise<void> = Promise.resolve();
  #inFlight = false;

  constructor(deps: ChatSessionDeps) {
    this.#deps = deps;
    this.#clock = deps.clock ?? defaultClock;
    this.#auth = deps.initialAuth ?? { mode: 'max' };
    this.#model = deps.initialModel ?? 'claude-sonnet-4-6';
    this.#thinkingBudget = deps.initialThinkingBudget ?? 'auto';
    this.#resumeId = deps.initialSessionId;
  }

  get state(): SessionState {
    return {
      resumeId: this.#resumeId,
      inFlight: this.#inFlight,
      auth: this.#auth,
      model: this.#model,
      thinkingBudget: this.#thinkingBudget,
    };
  }

  setAuth(auth: AuthMode): void {
    this.#auth = auth;
  }

  setModel(model: ModelId, thinkingBudget: ThinkingBudget): void {
    this.#model = model;
    this.#thinkingBudget = thinkingBudget;
  }

  /** Seed the resumeId from a sidecar at open time. */
  resumeFrom(sessionId: string): void {
    this.#resumeId = sessionId;
  }

  /** Drop the resumeId so the next turn starts a fresh SDK session. */
  reset(): void {
    this.#resumeId = undefined;
  }

  /**
   * Request cancellation of the in-flight turn. No-op when idle.
   * The turn unwinds via the SDK adapter's cancel hook and rolls back
   * silently (no `error` event).
   */
  cancel(): void {
    this.#cancelRequested = true;
    const run = this.#activeRun;
    if (run) {
      run.cancel().catch(() => undefined);
    }
  }

  /**
   * Run one user turn. Serialized: a second call queues behind the first.
   * Returns a `TurnResult` — never rejects; errors surface via events + the
   * `status` / `failure` fields.
   */
  turn(userText: string): Promise<TurnResult> {
    const promise = this.#turnTail.then(() => this.#runTurn(userText));
    // Prevent a failed turn from poisoning the queue; callers still see
    // their own result.
    this.#turnTail = promise.then(
      () => undefined,
      () => undefined,
    );
    return promise;
  }

  async #runTurn(userText: string): Promise<TurnResult> {
    const { sink, getCurrentIR, stdlibRegistry, captureException } = this.#deps;

    this.#inFlight = true;
    this.#cancelRequested = false;
    sink.emit({ kind: 'turn-begin' });

    const ir: Schema = getCurrentIR() ?? { version: '1', types: [] };
    const systemPromptAppend = buildSystemPromptAppend({ stdlibRegistry });
    const prompt = buildUserMessage({ ir, userMessage: userText });
    const resume = this.#resumeId;

    let committed = false;
    let lastSessionId: string | undefined;

    try {
      await runWithRetry(
        async () => {
          const run = this.#deps.sdk.query({
            prompt,
            systemPromptAppend,
            auth: this.#auth,
            model: this.#model,
            thinkingBudget: this.#thinkingBudget,
            ...(resume ? { resume } : {}),
          });
          this.#activeRun = run;
          try {
            for await (const msg of run.stream) {
              committed = true;
              if (msg.type === 'assistant') {
                sink.emit({ kind: 'assistant', textDelta: msg.text });
              } else if (msg.type === 'tool_use') {
                sink.emit({ kind: 'tool-use', name: msg.name, input: msg.input });
              } else if (msg.type === 'result') {
                sink.emit({ kind: 'result', ok: msg.ok, error: msg.error });
              } else if (msg.type === 'session') {
                lastSessionId = msg.sessionId;
                this.#resumeId = msg.sessionId;
                sink.emit({ kind: 'session', sessionId: msg.sessionId });
              }
            }
            // SDK iterator exited cleanly. If the user hit cancel during
            // the stream the adapter doesn't throw; we raise here so the
            // turn rolls back silently.
            if (this.#cancelRequested) {
              throw new ChatCancelledError();
            }
          } finally {
            if (this.#activeRun === run) this.#activeRun = null;
          }
        },
        {
          phase: 'chat',
          isCommitted: () => committed,
          captureException,
          sleep: this.#clock.sleep,
          random: this.#clock.random,
        },
      );

      sink.emit({ kind: 'turn-commit' });
      return { status: 'ok', sessionId: lastSessionId };
    } catch (err) {
      const failure = classifyTurnFailure(err);
      this.#routeFailure(failure);
      sink.emit({ kind: 'turn-rollback', cause: failure });
      const status: TurnResult['status'] = failure.class === 'cancel' ? 'cancelled' : 'error';
      return { status, failure, sessionId: lastSessionId };
    } finally {
      this.#inFlight = false;
    }
  }

  #routeFailure(failure: TurnFailure): void {
    const { sink } = this.#deps;
    if (failure.class === 'cancel') return;
    if (failure.class === 'auth') {
      sink.emit({ kind: 'auth-required', message: failure.message });
      return;
    }
    // validation / exhausted / unknown all route to the generic error
    // channel so the renderer surfaces them the same way.
    sink.emit({ kind: 'error', message: failure.message });
  }
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

function classifyTurnFailure(err: unknown): TurnFailure {
  const classified = readClassification(err);
  switch (classified.class) {
    case 'auth':
      return { class: 'auth', message: classified.message };
    case 'validation':
      return { class: 'validation', message: classified.message };
    case 'cancel':
      return { class: 'cancel' };
    case 'transient':
      // `runWithRetry` only rethrows a `transient` class when either
      // retries exhausted or the body committed mid-stream. Either way the
      // user-visible story is the same — network issue that can't be
      // auto-retried — so both collapse to `exhausted`.
      return { class: 'exhausted', message: classified.message };
    default:
      return { class: 'unknown', message: classified.message };
  }
}
