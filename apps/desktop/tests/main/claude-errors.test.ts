/**
 * Error classifier — pattern coverage for every class.
 *
 * Nothing here exercises the retry loop; that lives in
 * `claude-errors-retry.test.ts`. We only prove the classifier maps
 * representative SDK-shaped failures to the right class.
 */
import {
  ChatCancelledError,
  classifyError,
  readClassification,
  shouldRetry,
} from '@main/ipc/claude-errors';
import { describe, expect, it } from 'vitest';

describe('classifyError', () => {
  it.each([
    ['ETIMEDOUT'],
    ['ECONNRESET: socket hang up'],
    ['ECONNREFUSED on api.anthropic.com'],
    ['EAI_AGAIN'],
    ['ENETUNREACH'],
    ['network error while streaming'],
    ['fetch failed'],
    ['request timed out after 60s'],
    ['upstream returned 502 Bad Gateway'],
    ['service unavailable (503)'],
    ['gateway timeout (504)'],
    ['too many requests — rate limit'],
    ['rate-limited; retry after 5s'],
  ])('recognises transient pattern: %s', (message) => {
    expect(classifyError(new Error(message)).class).toBe('transient');
  });

  it.each([
    ['401 Unauthorized'],
    ['authentication failed'],
    ['authentication required'],
    ['authentication expired'],
    ['Invalid API key'],
    ['missing API key'],
    ['Not authenticated'],
    ['please log in'],
    ['please sign in again'],
    ['403 forbidden'],
  ])('recognises auth pattern: %s', (message) => {
    expect(classifyError(new Error(message)).class).toBe('auth');
  });

  it.each([
    ['ZodError: invalid'],
    ['zod validation failed'],
    ['invalid IR'],
    ['invalid payload'],
    ['invalid schema'],
    ['payload is not a valid TypeDef'],
  ])('recognises validation pattern: %s', (message) => {
    expect(classifyError(new Error(message)).class).toBe('validation');
  });

  it('recognises ZodError by name', () => {
    const err = new Error('anything');
    err.name = 'ZodError';
    expect(classifyError(err).class).toBe('validation');
  });

  it.each([
    ['AbortError — user cancelled'],
    ['request aborted'],
    ['operation was cancelled'],
    ['query cancelled by user'],
    ['interrupted'],
  ])('recognises cancel pattern: %s', (message) => {
    expect(classifyError(new Error(message)).class).toBe('cancel');
  });

  it('recognises AbortError by name', () => {
    const err = new Error('anything');
    err.name = 'AbortError';
    expect(classifyError(err).class).toBe('cancel');
  });

  it('recognises ChatCancelledError', () => {
    expect(classifyError(new ChatCancelledError()).class).toBe('cancel');
  });

  it('falls back to unknown for unrecognised errors', () => {
    expect(classifyError(new Error('something weird happened')).class).toBe('unknown');
  });

  it('handles non-Error throwables', () => {
    expect(classifyError('ECONNRESET').class).toBe('transient');
    expect(classifyError({ message: '401' }).class).toBe('auth');
  });

  it('preserves the message verbatim', () => {
    expect(classifyError(new Error('request timed out after 60s')).message).toBe(
      'request timed out after 60s',
    );
  });
});

describe('shouldRetry', () => {
  it('only transient is retryable', () => {
    expect(shouldRetry('transient')).toBe(true);
    expect(shouldRetry('auth')).toBe(false);
    expect(shouldRetry('validation')).toBe(false);
    expect(shouldRetry('cancel')).toBe(false);
    expect(shouldRetry('unknown')).toBe(false);
  });
});

describe('readClassification', () => {
  it('reads the tagged class off a previously-classified error', () => {
    const err = new Error('timeout');
    (err as Error & { class?: string; classifiedMessage?: string }).class = 'transient';
    (err as Error & { class?: string; classifiedMessage?: string }).classifiedMessage = 'timeout';
    expect(readClassification(err)).toEqual({ class: 'transient', message: 'timeout' });
  });

  it('falls back to re-classifying if untagged', () => {
    const err = new Error('ECONNRESET');
    expect(readClassification(err).class).toBe('transient');
  });
});
