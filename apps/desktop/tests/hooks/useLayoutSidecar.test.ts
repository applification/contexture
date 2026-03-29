import { useLayoutSidecar } from '@renderer/hooks/useLayoutSidecar';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('useLayoutSidecar', () => {
  beforeEach(() => {
    vi.mocked(window.api.readFileSilent).mockReset().mockResolvedValue(null);
    vi.mocked(window.api.saveFile).mockReset().mockResolvedValue(true);
  });

  it('returns loadPositions and savePositions', () => {
    const { result } = renderHook(() => useLayoutSidecar('/test.ttl'));
    expect(typeof result.current.loadPositions).toBe('function');
    expect(typeof result.current.savePositions).toBe('function');
  });

  it('loadPositions returns null for null filePath', async () => {
    const { result } = renderHook(() => useLayoutSidecar(null));
    const data = await result.current.loadPositions();
    expect(data).toBeNull();
  });

  it('loadPositions returns null for sample files', async () => {
    const { result } = renderHook(() => useLayoutSidecar('sample://test'));
    const data = await result.current.loadPositions();
    expect(data).toBeNull();
  });

  it('loadPositions reads sidecar file', async () => {
    const sidecarData = { positions: { 'http://ex/A': { x: 10, y: 20 } } };
    vi.mocked(window.api.readFileSilent).mockResolvedValue(JSON.stringify(sidecarData));
    const { result } = renderHook(() => useLayoutSidecar('/test.ttl'));
    const data = await result.current.loadPositions();
    expect(data).toEqual(sidecarData);
    expect(window.api.readFileSilent).toHaveBeenCalledWith('/test.ttl.layout.json');
  });

  it('loadPositions returns null for malformed JSON', async () => {
    vi.mocked(window.api.readFileSilent).mockResolvedValue('not json');
    const { result } = renderHook(() => useLayoutSidecar('/test.ttl'));
    const data = await result.current.loadPositions();
    expect(data).toBeNull();
  });

  it('savePositions writes to sidecar path', async () => {
    const { result } = renderHook(() => useLayoutSidecar('/test.ttl'));
    await result.current.savePositions({ positions: {} });
    expect(window.api.saveFile).toHaveBeenCalledWith('/test.ttl.layout.json', expect.any(String));
  });

  it('savePositions skips for null filePath', async () => {
    const { result } = renderHook(() => useLayoutSidecar(null));
    await result.current.savePositions({ positions: {} });
    expect(window.api.saveFile).not.toHaveBeenCalled();
  });

  it('savePositions skips for sample files', async () => {
    const { result } = renderHook(() => useLayoutSidecar('Sample: people.ttl'));
    await result.current.savePositions({ positions: {} });
    expect(window.api.saveFile).not.toHaveBeenCalled();
  });
});
