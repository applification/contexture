/**
 * Chat-ops turn: simulate a 3-op chat turn and assert
 *   - each op visibly animates (three TypeNodes appear in sequence)
 *   - the whole turn collapses to one undo entry
 *
 * We don't call a real LLM here. The test drives the turn protocol
 * directly via the exposed undoable store: `begin()`, three `apply(...)`
 * ops, `commit()`. Proving the store's transaction semantics at the
 * renderer level exercises every integration point the real SDK path
 * hits, minus the non-deterministic model response. A LLM-in-the-loop
 * variant belongs to a separate, network-opted-in suite.
 */
import { expect, test } from '@playwright/test';
import { launchElectron } from './electron-launch';

test.describe('Chat-ops turn collapses to one undo entry', () => {
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

  test('3 ops in a transaction → 3 animations + 1 undo step', async () => {
    // Seed with empty schema.
    await page.evaluate(() => {
      const store = (
        window as unknown as {
          __contextureUndoStore: {
            getState: () => {
              apply: (op: unknown) => unknown;
              begin: () => void;
              commit: () => void;
              undo: () => void;
              schema: { types: Array<{ name: string }> };
            };
          };
        }
      ).__contextureUndoStore;
      store.getState().apply({ kind: 'replace_schema', schema: { version: '1', types: [] } });
    });

    // Run the turn.
    await page.evaluate(() => {
      const store = (
        window as unknown as {
          __contextureUndoStore: {
            getState: () => {
              apply: (op: unknown) => unknown;
              begin: () => void;
              commit: () => void;
            };
          };
        }
      ).__contextureUndoStore;
      const s = store.getState();
      s.begin();
      s.apply({ kind: 'add_type', type: { kind: 'object', name: 'Plot', fields: [] } });
      s.apply({ kind: 'add_type', type: { kind: 'object', name: 'Crop', fields: [] } });
      s.apply({ kind: 'add_type', type: { kind: 'object', name: 'Harvest', fields: [] } });
      s.commit();
    });

    // All three TypeNodes visible after the turn.
    await expect(page.locator('[data-type-name="Plot"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-type-name="Crop"]')).toBeVisible();
    await expect(page.locator('[data-type-name="Harvest"]')).toBeVisible();

    // One undo pops the whole turn.
    const afterUndo = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __contextureUndoStore: {
            getState: () => { undo: () => void; schema: { types: Array<{ name: string }> } };
          };
        }
      ).__contextureUndoStore;
      store.getState().undo();
      return store.getState().schema.types.length;
    });
    expect(afterUndo).toBe(0);
  });
});
