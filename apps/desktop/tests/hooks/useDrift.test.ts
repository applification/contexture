import { convexPathFor, useDrift } from '@renderer/hooks/useDrift';
import { useDocumentStore } from '@renderer/store/document';
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  const document = useDocumentStore.getState();
  document.setFilePath(null);
  document.setMode('bundle');
});

describe('convexPathFor', () => {
  it('derives convex schema path from a valid IR path', () => {
    const ir = '/proj/packages/contexture/garden.contexture.json';
    expect(convexPathFor(ir)).toBe('/proj/packages/contexture/convex/schema.ts');
  });

  it('returns null for a non-IR path', () => {
    expect(convexPathFor('/proj/packages/contexture/schema.ts')).toBeNull();
  });

  it('returns null for a path with no slash', () => {
    expect(convexPathFor('garden.contexture.json')).toBeNull();
  });
});

describe('useDrift', () => {
  it('starts the drift watcher with the open IR path, not a renderer-derived manifest path', () => {
    const watch = vi.fn(async () => ({ ok: true }));
    const unwatch = vi.fn(async () => ({ ok: true }));
    (window as unknown as { contexture: unknown }).contexture = {
      drift: {
        watch,
        unwatch,
        check: vi.fn(async () => ({ ok: true })),
        dismiss: vi.fn(async () => ({ ok: true })),
        onDetected: vi.fn(() => () => undefined),
        onResolved: vi.fn(() => () => undefined),
      },
    };
    useDocumentStore.getState().setFilePath('/proj/packages/contexture/garden.contexture.json');
    useDocumentStore.getState().setMode('bundle');

    renderHook(() => useDrift());

    expect(watch).toHaveBeenCalledWith({
      irPath: '/proj/packages/contexture/garden.contexture.json',
    });
  });
});
