// Genuinely transient sandbox-creation failures: container/orchestrator hiccup,
// network blip during git sync or copy, races during install hooks. Anything
// else (CwdError, ConfigDirError, InitError, AgentError, ExecHostError) is
// either a configuration mistake or a logic failure that won't fix itself on
// retry, so we let it propagate.
//
// We match on sandcastle's Effect-style `_tag` string rather than `instanceof`
// because the error classes themselves are not re-exported from the public
// `@ai-hero/sandcastle` entry — only `CwdError` is. The `_tag` field is the
// Effect convention and is part of the documented error shape, so this is
// stable across minor version bumps.
const RETRYABLE_TAGS = new Set([
  "ContainerStartTimeoutError",
  "CopyError",
  "CopyToWorktreeTimeoutError",
  "DockerError",
  "GitSetupTimeoutError",
  "HookTimeoutError",
  "PodmanError",
  "SyncError",
  "SyncInTimeoutError",
  "WorktreeError",
  "WorktreeTimeoutError",
]);

function tagOf(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const tag = (err as { _tag?: unknown })._tag;
  return typeof tag === "string" ? tag : undefined;
}

export function isSandboxStartupRetryable(err: unknown): boolean {
  const tag = tagOf(err);
  return tag !== undefined && RETRYABLE_TAGS.has(tag);
}

export type RetryOptions = {
  maxAttempts: number;
  baseMs: number;
  jitter: boolean;
  isRetryable: (err: unknown) => boolean;
  // Injected so tests can run without real timers. Defaults to setTimeout.
  sleep?: (ms: number) => Promise<void>;
  // Called once per retry decision (after a retryable failure). Useful for
  // surfacing the attempt + cause in orchestrator logs.
  onRetry?: (info: { attempt: number; nextDelayMs: number; error: unknown }) => void;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Run `fn` up to `maxAttempts` times. Between failed attempts that the
// `isRetryable` predicate accepts, sleep `baseMs` (with optional ±50% jitter).
// Non-retryable errors bubble immediately. After the final attempt, the last
// error is rethrown.
//
// Flat delay (not exponential): the operations we wrap take minutes; backing
// off further between attempts buys nothing useful and just delays an
// AFK overnight run.
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep;
  let lastError: unknown;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!opts.isRetryable(err) || attempt === opts.maxAttempts) {
        throw err;
      }
      const delay = opts.jitter
        ? Math.round(opts.baseMs * (0.5 + Math.random()))
        : opts.baseMs;
      opts.onRetry?.({ attempt, nextDelayMs: delay, error: err });
      await sleep(delay);
    }
  }
  // Unreachable — the loop either returns or throws inside.
  throw lastError;
}
