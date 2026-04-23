/**
 * `runWithRetry` — retry schedule, exhaustion, and Sentry interaction.
 *
 * Every retryable test uses an injected `sleep` so the wall clock stays
 * still, and a deterministic `random` for jitter. Production wires
 * real setTimeout + Math.random; nothing here tests those.
 */
import {
  ChatCancelledError,
  jittered,
  MAX_RETRY_ATTEMPTS,
  RETRY_DELAYS_MS,
  runWithRetry,
} from '@main/ipc/claude-errors';
import { describe, expect, it, vi } from 'vitest';

describe('jittered', () => {
  it('clamps at zero and applies ±20 % of the base', () => {
    expect(jittered(1000, () => 0)).toBe(800); // -20 %
    expect(jittered(1000, () => 1)).toBe(1200); // +20 %
    expect(jittered(1000, () => 0.5)).toBe(1000); // exact
  });
});

describe('runWithRetry', () => {
  it('returns the body result on first success', async () => {
    const body = vi.fn(async () => 42);
    const out = await runWithRetry(body);
    expect(out).toBe(42);
    expect(body).toHaveBeenCalledTimes(1);
  });

  it('retries a transient error up to 3 attempts', async () => {
    let attempts = 0;
    const sleeps: number[] = [];
    const body = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('ECONNRESET');
      return 'ok';
    });
    const out = await runWithRetry(body, {
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0.5, // no jitter
    });
    expect(out).toBe('ok');
    expect(body).toHaveBeenCalledTimes(3);
    // Two sleeps between three attempts; first = 1000ms, second = 2000ms.
    expect(sleeps).toEqual([RETRY_DELAYS_MS[0], RETRY_DELAYS_MS[1]]);
  });

  it('captures to Sentry when all transient retries are exhausted', async () => {
    const body = vi.fn(async () => {
      throw new Error('ETIMEDOUT');
    });
    const captureException = vi.fn();

    await expect(
      runWithRetry(body, {
        sleep: async () => {},
        random: () => 0.5,
        captureException,
        phase: 'chat',
      }),
    ).rejects.toThrow('ETIMEDOUT');

    expect(body).toHaveBeenCalledTimes(MAX_RETRY_ATTEMPTS);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      class: 'transient-exhausted',
      retries: MAX_RETRY_ATTEMPTS,
      phase: 'chat',
    });
  });

  it('does not retry auth errors, and does not capture', async () => {
    const body = vi.fn(async () => {
      throw new Error('401 Unauthorized');
    });
    const captureException = vi.fn();

    await expect(runWithRetry(body, { captureException })).rejects.toThrow('401');
    expect(body).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('does not retry validation errors, and does not capture', async () => {
    const body = vi.fn(async () => {
      throw new Error('ZodError: bad payload');
    });
    const captureException = vi.fn();

    await expect(runWithRetry(body, { captureException })).rejects.toThrow('ZodError');
    expect(body).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('does not retry cancel, and does not capture', async () => {
    const body = vi.fn(async () => {
      throw new ChatCancelledError();
    });
    const captureException = vi.fn();

    await expect(runWithRetry(body, { captureException })).rejects.toThrow();
    expect(body).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('captures unknown-class errors to Sentry without retrying', async () => {
    const body = vi.fn(async () => {
      throw new Error('something very weird');
    });
    const captureException = vi.fn();

    await expect(runWithRetry(body, { captureException, phase: 'chat' })).rejects.toThrow('weird');
    expect(body).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      class: 'unknown',
      phase: 'chat',
    });
  });

  it('does not retry a transient error once isCommitted() returns true', async () => {
    let calls = 0;
    const body = vi.fn(async () => {
      calls += 1;
      throw new Error('ECONNRESET');
    });

    // `committed = true` from the start — simulating that the body has
    // already yielded a partial stream before the failure.
    const captureException = vi.fn();
    await expect(
      runWithRetry(body, {
        captureException,
        isCommitted: () => true,
        sleep: async () => {},
      }),
    ).rejects.toThrow('ECONNRESET');

    expect(calls).toBe(1);
  });

  it('tags the rethrown error with its class for downstream routing', async () => {
    const body = async () => {
      throw new Error('401');
    };
    try {
      await runWithRetry(body);
      expect.unreachable();
    } catch (err) {
      expect((err as Error & { class?: string }).class).toBe('auth');
    }
  });
});
