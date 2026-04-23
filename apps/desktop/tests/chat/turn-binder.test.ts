import { bindTurnToUndo, type IpcSubscriber } from '@renderer/chat/turn-binder';
import { describe, expect, it, vi } from 'vitest';

function fakeIpc() {
  const listeners = new Map<string, Set<() => void>>();
  const ipc: IpcSubscriber = {
    on: (channel, listener) => {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel)?.add(listener);
      return () => {
        listeners.get(channel)?.delete(listener);
      };
    },
  };
  const emit = (channel: string) => {
    for (const listener of listeners.get(channel) ?? []) listener();
  };
  const listenerCount = (channel: string) => listeners.get(channel)?.size ?? 0;
  return { ipc, emit, listenerCount };
}

describe('bindTurnToUndo', () => {
  it('opens a transaction on turn:begin and closes it on turn:commit', () => {
    const { ipc, emit } = fakeIpc();
    const undo = { begin: vi.fn(), commit: vi.fn(), rollback: vi.fn() };
    bindTurnToUndo(ipc, undo);

    emit('turn:begin');
    emit('turn:commit');

    expect(undo.begin).toHaveBeenCalledTimes(1);
    expect(undo.commit).toHaveBeenCalledTimes(1);
    expect(undo.rollback).not.toHaveBeenCalled();
  });

  it('rolls back on turn:rollback', () => {
    const { ipc, emit } = fakeIpc();
    const undo = { begin: vi.fn(), commit: vi.fn(), rollback: vi.fn() };
    bindTurnToUndo(ipc, undo);

    emit('turn:begin');
    emit('turn:rollback');

    expect(undo.begin).toHaveBeenCalledTimes(1);
    expect(undo.rollback).toHaveBeenCalledTimes(1);
    expect(undo.commit).not.toHaveBeenCalled();
  });

  it('unsubscribes every channel on dispose', () => {
    const { ipc, listenerCount } = fakeIpc();
    const undo = { begin: vi.fn(), commit: vi.fn(), rollback: vi.fn() };

    const dispose = bindTurnToUndo(ipc, undo);
    expect(listenerCount('turn:begin')).toBe(1);
    expect(listenerCount('turn:commit')).toBe(1);
    expect(listenerCount('turn:rollback')).toBe(1);

    dispose();
    expect(listenerCount('turn:begin')).toBe(0);
    expect(listenerCount('turn:commit')).toBe(0);
    expect(listenerCount('turn:rollback')).toBe(0);
  });
});
