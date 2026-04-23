/**
 * Cancel=rollback e2e: simulate the renderer-visible effect of cancelling
 * a chat turn mid-flight.
 *
 * When the user hits Stop, the main-side `chat:abort` flips a cancel flag,
 * `interrupt()` unwinds the SDK iterator, the driver throws
 * `ChatCancelledError`, and `ChatTurnController` fires `turn:rollback`.
 * The renderer's `bindTurnToUndo` converts that into a store rollback —
 * any ops applied during the turn vanish as one step.
 *
 * Like `chat-ops.spec.ts`, we don't stand up a real LLM. We drive the
 * store via the transaction API (`begin` → N ops → `rollback`) which is
 * the same contract the IPC pathway invokes end-to-end. That proves the
 * observable outcome of cancelling a turn: the graph reverts.
 */
import { expect, test } from '@playwright/test';
import { launchElectron } from './electron-launch';

test.describe('Chat cancel rolls back mid-turn ops', () => {
  let electronApp: Awaited<ReturnType<typeof launchElectron>>;
  let page: Awaited<ReturnType<typeof electronApp.firstWindow>>;

  test.beforeAll(async () => {
    electronApp = await launchElectron();
    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    await electronApp?.close();
  });

  test('begin + ops + rollback → graph state reverts to pre-turn', async () => {
    // Pre-seed: one existing type so we can prove the rollback doesn't
    // nuke state that existed before the cancelled turn began.
    await page.evaluate(() => {
      const store = (
        window as unknown as {
          __contextureUndoStore: {
            getState: () => {
              apply: (op: unknown) => unknown;
              schema: { types: Array<{ name: string }> };
            };
          };
        }
      ).__contextureUndoStore;
      store.getState().apply({
        kind: 'replace_schema',
        schema: {
          version: '1',
          types: [{ kind: 'object', name: 'Plot', fields: [] }],
        },
      });
    });

    // Drive a turn that applies two ops then rolls back (simulating a
    // mid-stream cancel). `rollback()` is the renderer-side sink the
    // `turn:rollback` IPC event feeds into via `bindTurnToUndo`.
    await page.evaluate(() => {
      const store = (
        window as unknown as {
          __contextureUndoStore: {
            getState: () => {
              apply: (op: unknown) => unknown;
              begin: () => void;
              rollback: () => void;
            };
          };
        }
      ).__contextureUndoStore;
      const s = store.getState();
      s.begin();
      s.apply({ kind: 'add_type', type: { kind: 'object', name: 'Harvest', fields: [] } });
      s.apply({ kind: 'add_type', type: { kind: 'object', name: 'Crop', fields: [] } });
      s.rollback();
    });

    // Pre-turn type survives; mid-turn additions are gone.
    const names = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __contextureUndoStore: {
            getState: () => { schema: { types: Array<{ name: string }> } };
          };
        }
      ).__contextureUndoStore;
      return store.getState().schema.types.map((t) => t.name);
    });
    expect(names).toEqual(['Plot']);
  });
});
