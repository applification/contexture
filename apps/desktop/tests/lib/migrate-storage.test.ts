import { beforeEach, describe, expect, it } from 'vitest';
import { migrateLegacyStorageKeys } from '@/lib/migrate-storage';

describe('migrateLegacyStorageKeys', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('copies each legacy ontograph-* key to its contexture-* counterpart and removes the legacy entry', () => {
    localStorage.setItem('ontograph-api-key', 'sk-legacy');
    localStorage.setItem('ontograph-auth-mode', 'api-key');
    localStorage.setItem('ontograph-model', 'claude-sonnet-4-6');
    localStorage.setItem('ontograph-thinking-budget', 'high');
    localStorage.setItem('ontograph-tracked-first-message', 'true');
    localStorage.setItem('ontograph-chat-threads', '[]');
    localStorage.setItem('ontograph-active-thread', 'tid-1');
    localStorage.setItem('ontograph-analytics-opt-out', 'true');
    localStorage.setItem('ontograph-linked-visitor-id', 'vid-1');

    migrateLegacyStorageKeys();

    expect(localStorage.getItem('contexture-api-key')).toBe('sk-legacy');
    expect(localStorage.getItem('contexture-auth-mode')).toBe('api-key');
    expect(localStorage.getItem('contexture-model')).toBe('claude-sonnet-4-6');
    expect(localStorage.getItem('contexture-thinking-budget')).toBe('high');
    expect(localStorage.getItem('contexture-tracked-first-message')).toBe('true');
    expect(localStorage.getItem('contexture-chat-threads')).toBe('[]');
    expect(localStorage.getItem('contexture-active-thread')).toBe('tid-1');
    expect(localStorage.getItem('contexture-analytics-opt-out')).toBe('true');
    expect(localStorage.getItem('contexture-linked-visitor-id')).toBe('vid-1');

    expect(localStorage.getItem('ontograph-api-key')).toBeNull();
    expect(localStorage.getItem('ontograph-chat-threads')).toBeNull();
  });

  it('does not overwrite an existing contexture-* value', () => {
    localStorage.setItem('ontograph-api-key', 'legacy');
    localStorage.setItem('contexture-api-key', 'current');
    migrateLegacyStorageKeys();
    expect(localStorage.getItem('contexture-api-key')).toBe('current');
    expect(localStorage.getItem('ontograph-api-key')).toBeNull();
  });

  it('is a no-op when no legacy keys exist', () => {
    migrateLegacyStorageKeys();
    expect(localStorage.length).toBe(0);
  });

  it('is idempotent — a second run finds nothing to migrate', () => {
    localStorage.setItem('ontograph-model', 'x');
    migrateLegacyStorageKeys();
    migrateLegacyStorageKeys();
    expect(localStorage.getItem('contexture-model')).toBe('x');
    expect(localStorage.getItem('ontograph-model')).toBeNull();
  });
});
