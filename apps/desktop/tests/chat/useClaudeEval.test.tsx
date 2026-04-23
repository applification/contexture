/**
 * `useClaudeEval` — hook state machine over a fake EvalAPI.
 */
import { useClaudeEval } from '@renderer/chat/useClaudeEval';
import type { Schema } from '@renderer/model/types';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ir: Schema = {
  version: '1',
  types: [{ kind: 'object', name: 'Plot', fields: [{ name: 'name', type: { kind: 'string' } }] }],
};

function setup(
  overrides: Partial<{
    generate: ReturnType<typeof vi.fn>;
    saveFixture: ReturnType<typeof vi.fn>;
    validate: ReturnType<typeof vi.fn>;
  }> = {},
) {
  const generate = overrides.generate ?? vi.fn().mockResolvedValue({ sample: { name: 'Test' } });
  const saveFixture = overrides.saveFixture ?? vi.fn().mockResolvedValue('/path/fixture.json');
  const validate = overrides.validate ?? vi.fn().mockReturnValue({ ok: true });
  const hook = renderHook(() =>
    useClaudeEval({
      api: { generate, saveFixture },
      ir,
      getRootJsonSchema: () => ({ type: 'object' }),
      validate,
    }),
  );
  return { ...hook, generate, saveFixture, validate };
}

describe('useClaudeEval', () => {
  afterEach(cleanup);

  it('starts idle with sensible defaults', () => {
    const { result } = setup();
    expect(result.current.state).toMatchObject({
      rootTypeName: null,
      mode: 'realistic',
      status: 'idle',
      sample: null,
      validation: null,
    });
  });

  it('setRoot resets any previous sample/validation', () => {
    const { result } = setup();
    act(() => result.current.setRoot('Plot'));
    expect(result.current.state.rootTypeName).toBe('Plot');
  });

  it('generate calls the API, validates, and exits to done', async () => {
    const { result, generate, validate } = setup();
    act(() => result.current.setRoot('Plot'));
    await act(async () => {
      await result.current.generate();
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledWith({ rootTypeName: 'Plot', sample: { name: 'Test' } });
    expect(result.current.state.status).toBe('done');
    expect(result.current.state.sample).toEqual({ name: 'Test' });
    expect(result.current.state.validation?.ok).toBe(true);
  });

  it('generate does nothing when no root is selected', async () => {
    const { result, generate } = setup();
    await act(async () => {
      await result.current.generate();
    });
    expect(generate).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe('idle');
  });

  it('captures the error when the API rejects', async () => {
    const { result } = setup({ generate: vi.fn().mockRejectedValue(new Error('boom')) });
    act(() => result.current.setRoot('Plot'));
    await act(async () => {
      await result.current.generate();
    });
    expect(result.current.state.status).toBe('error');
    expect(result.current.state.error).toBe('boom');
  });

  it('saveFixture forwards the captured sample', async () => {
    const { result, saveFixture } = setup();
    act(() => result.current.setRoot('Plot'));
    await act(async () => {
      await result.current.generate();
    });
    await act(async () => {
      const path = await result.current.saveFixture('my-fixture');
      expect(path).toBe('/path/fixture.json');
    });
    expect(saveFixture).toHaveBeenCalledWith({ sample: { name: 'Test' }, name: 'my-fixture' });
  });

  it('saveFixture throws when no sample is captured', async () => {
    const { result } = setup();
    await expect(result.current.saveFixture('x')).rejects.toThrow(/No sample/);
  });
});
