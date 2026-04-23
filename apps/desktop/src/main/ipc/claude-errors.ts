/**
 * Error classification + selective retry for Agent SDK `query()` calls.
 *
 * The chat and Eval drivers both iterate an SDK stream that can fail for
 * several distinct reasons. Retrying a 401 is wrong; retrying a validation
 * rejection is wrong; retrying a network blip is right. This module
 * separates those concerns into three pure pieces:
 *
 *   - `classifyError(err)` — string-pattern / typed-property match over
 *     whatever the SDK threw. Produces a `{ class, message }` record.
 *   - `shouldRetry(class)` — tells the retry loop whether to sleep + try
 *     again.
 *   - `runWithRetry(body, { captureException, sleep })` — wraps an async
 *     function (the `for await` loop body) in exponential backoff for
 *     transient errors and hands Sentry the captures it should see.
 *
 * The classifier is stringly-typed on purpose: the SDK doesn't expose a
 * structured error taxonomy, so we sniff error messages / codes. Keeping
 * the patterns in one place means new transient signatures can be added
 * without touching every call site.
 *
 * `runWithRetry` takes `captureException` and `sleep` as injected
 * callbacks so unit tests can assert which classes end up in Sentry and
 * run the retry schedule without real wall-clock delays.
 */

/** Error classes the drivers surface to the renderer. */
export type ErrorClass = 'transient' | 'auth' | 'validation' | 'cancel' | 'unknown';

/** Result of classifying a thrown error. */
export interface ClassifiedError {
  class: ErrorClass;
  /** Normalised human-readable message. Passed to the renderer verbatim. */
  message: string;
}

/** Sentinel thrown inside the driver loop to request rollback on cancel. */
export class ChatCancelledError extends Error {
  constructor(message = 'Chat turn cancelled') {
    super(message);
    this.name = 'ChatCancelledError';
  }
}

/**
 * Sniff patterns that mark an error as retryable. Intentionally broad:
 * a false positive at worst wastes 7 seconds of backoff on the user's
 * first real issue, whereas a false negative silently masks a flaky
 * network.
 */
const TRANSIENT_PATTERNS: ReadonlyArray<RegExp> = [
  /ETIMEDOUT/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /EAI_AGAIN/i,
  /ENETUNREACH/i,
  /socket hang up/i,
  /network error/i,
  /fetch failed/i,
  /timed out/i,
  /timeout/i,
  /\b5\d\d\b/, // HTTP 5xx on message
  /service unavailable/i,
  /bad gateway/i,
  /gateway timeout/i,
  /too many requests/i,
  /rate[- ]?limit/i,
];

const AUTH_PATTERNS: ReadonlyArray<RegExp> = [
  /\b401\b/,
  /\b403\b/,
  /unauthori[sz]ed/i,
  /authentication.*(failed|required|expired)/i,
  /invalid.*api[- ]?key/i,
  /missing.*api[- ]?key/i,
  /not authenticated/i,
  /please (log ?in|sign ?in)/i,
];

const VALIDATION_PATTERNS: ReadonlyArray<RegExp> = [
  /ZodError/,
  /zod.*validation/i,
  /invalid (IR|payload|schema)/i,
  /payload is not a valid/i,
];

const CANCEL_PATTERNS: ReadonlyArray<RegExp> = [
  /AbortError/,
  /interrupted/i,
  /request aborted/i,
  /\boperation was cancelled\b/i,
  /\bquery cancelled\b/i,
];

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function errorName(err: unknown): string | null {
  if (err instanceof Error && typeof err.name === 'string') return err.name;
  return null;
}

/**
 * Classify an unknown error thrown from the Agent SDK into one of the
 * five classes. Order matters: cancel first (a cancelled 401 is still a
 * cancel), then validation (Zod usually carries structured info), then
 * auth (401/403 signatures), then transient (broad network patterns),
 * then unknown.
 */
export function classifyError(err: unknown): ClassifiedError {
  if (err instanceof ChatCancelledError) {
    return { class: 'cancel', message: err.message };
  }
  const message = errorMessage(err);
  const name = errorName(err);

  if (name === 'AbortError' || CANCEL_PATTERNS.some((p) => p.test(message))) {
    return { class: 'cancel', message };
  }
  if (name === 'ZodError' || VALIDATION_PATTERNS.some((p) => p.test(message))) {
    return { class: 'validation', message };
  }
  if (AUTH_PATTERNS.some((p) => p.test(message))) {
    return { class: 'auth', message };
  }
  if (TRANSIENT_PATTERNS.some((p) => p.test(message))) {
    return { class: 'transient', message };
  }
  return { class: 'unknown', message };
}

/** Only the transient class retries automatically. */
export function shouldRetry(cls: ErrorClass): boolean {
  return cls === 'transient';
}

/**
 * Exponential-backoff schedule for transient errors: 1s, 2s, 4s with
 * ±20 % jitter applied independently to each step. Total worst-case
 * delay before giving up ≈ 8.4 s.
 */
export const RETRY_DELAYS_MS: ReadonlyArray<number> = [1000, 2000, 4000];
export const MAX_RETRY_ATTEMPTS = 3;

export function jittered(baseMs: number, random: () => number = Math.random): number {
  // ±20 % jitter, clamped at zero for safety.
  const factor = 1 + (random() * 0.4 - 0.2);
  return Math.max(0, Math.round(baseMs * factor));
}

export interface RunWithRetryOptions {
  /**
   * Called when an error is being captured for Sentry. Non-capturing
   * classes (`auth`, `validation`, `cancel`) never invoke this; only
   * `unknown` and `transient-exhausted` do.
   */
  captureException?: (
    err: unknown,
    extra: { class: ErrorClass | 'transient-exhausted'; retries?: number; phase?: string },
  ) => void;
  /** Injected so tests can skip the real `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
  /** Jitter provider; tests pass a deterministic function. */
  random?: () => number;
  /** Phase label attached to Sentry captures, e.g. 'chat' or 'eval'. */
  phase?: string;
  /**
   * Predicate that returns true once the body is considered "committed"
   * (e.g. it has yielded at least one SDK message). Past that point the
   * retry wrapper stops catching — replaying a partially-consumed stream
   * would double-fire tool calls. Defaults to `() => false` so all
   * attempts are retried.
   */
  isCommitted?: () => boolean;
}

/**
 * Run `body` up to `MAX_RETRY_ATTEMPTS` times, retrying only `transient`
 * errors with exponential backoff. Throws the classified error (wrapping
 * the original as `cause`) when it exhausts retries or when the class is
 * non-retryable.
 *
 * The thrown `Error` carries a `class` property so the driver can route
 * it to the correct renderer channel without re-classifying.
 */
export async function runWithRetry<T>(
  body: () => Promise<T>,
  options: RunWithRetryOptions = {},
): Promise<T> {
  const {
    captureException,
    sleep = defaultSleep,
    random = Math.random,
    phase,
    isCommitted = () => false,
  } = options;

  let attempt = 0;
  // Track the most recent classified failure so the exhaustion path can
  // rethrow with the right shape.
  let lastError: unknown;
  let lastClassification: ClassifiedError | null = null;

  while (attempt < MAX_RETRY_ATTEMPTS) {
    try {
      return await body();
    } catch (err) {
      lastError = err;
      const classified = classifyError(err);
      lastClassification = classified;

      // Once the body has committed (yielded partial output / fired a
      // tool call) retrying would replay side effects. Surface the
      // classified error directly and let the driver handle it.
      if (isCommitted()) {
        if (classified.class === 'unknown') {
          captureException?.(err, { class: 'unknown', phase });
        }
        throw attachClass(err, classified);
      }

      if (!shouldRetry(classified.class)) {
        if (classified.class === 'unknown') {
          captureException?.(err, { class: 'unknown', phase });
        }
        throw attachClass(err, classified);
      }

      attempt += 1;
      if (attempt >= MAX_RETRY_ATTEMPTS) break;
      const delay = jittered(RETRY_DELAYS_MS[attempt - 1], random);
      await sleep(delay);
    }
  }

  // Transient, but we're out of retries.
  captureException?.(lastError, {
    class: 'transient-exhausted',
    retries: MAX_RETRY_ATTEMPTS,
    phase,
  });
  throw attachClass(
    lastError,
    lastClassification ?? { class: 'transient', message: errorMessage(lastError) },
  );
}

/** Attach the classification to the Error object for downstream routing. */
function attachClass(err: unknown, classified: ClassifiedError): Error {
  const out = err instanceof Error ? err : new Error(classified.message);
  (out as Error & { class?: ErrorClass; classifiedMessage?: string }).class = classified.class;
  (out as Error & { class?: ErrorClass; classifiedMessage?: string }).classifiedMessage =
    classified.message;
  return out;
}

/**
 * Pull the classification off an error previously passed through
 * `runWithRetry`. Falls back to re-classifying if the property isn't
 * present (the error came from outside the retry wrapper).
 */
export function readClassification(err: unknown): ClassifiedError {
  const tagged = err as { class?: ErrorClass; classifiedMessage?: string; message?: string };
  if (tagged && typeof tagged.class === 'string') {
    return {
      class: tagged.class,
      message: tagged.classifiedMessage ?? tagged.message ?? '',
    };
  }
  return classifyError(err);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
