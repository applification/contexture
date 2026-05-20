import { useDocumentStore } from '@renderer/store/document';
import { beforeEach, describe, expect, it } from 'vitest';

const LAYOUT = {
  version: '1' as const,
  positions: { Plot: { x: 10, y: 20 } },
};

beforeEach(() => {
  useDocumentStore.setState({
    filePath: null,
    isDirty: false,
    mode: 'bundle',
    layout: { version: '1', positions: {} },
    importWarnings: [],
    unknownFormatPath: null,
    saveWithErrorsPrompt: null,
  });
});

describe('document lifecycle store', () => {
  it('acceptOpenedBundle records the opened path, layout, and clean state', () => {
    useDocumentStore.getState().noteSchemaChanged();

    useDocumentStore
      .getState()
      .acceptOpenedBundle({ filePath: '/tmp/garden.contexture.json', layout: LAYOUT });

    expect(useDocumentStore.getState()).toMatchObject({
      filePath: '/tmp/garden.contexture.json',
      mode: 'bundle',
      layout: LAYOUT,
      isDirty: false,
    });
  });

  it('resetForNewBundle clears document identity and layout together', () => {
    useDocumentStore
      .getState()
      .acceptOpenedBundle({ filePath: '/tmp/garden.contexture.json', layout: LAYOUT });
    useDocumentStore.getState().noteSchemaChanged();

    useDocumentStore.getState().resetForNewBundle();

    expect(useDocumentStore.getState()).toMatchObject({
      filePath: null,
      mode: 'bundle',
      layout: { version: '1', positions: {} },
      isDirty: false,
    });
  });

  it('tracks schema changes and save completion as lifecycle events', () => {
    useDocumentStore
      .getState()
      .acceptOpenedBundle({ filePath: '/tmp/garden.contexture.json', layout: LAYOUT });

    useDocumentStore.getState().noteSchemaChanged();
    expect(useDocumentStore.getState().isDirty).toBe(true);

    useDocumentStore.getState().noteAutosaveSucceeded();
    expect(useDocumentStore.getState().isDirty).toBe(false);

    useDocumentStore.getState().noteSchemaChanged();
    useDocumentStore.getState().markBundleSaved('/tmp/renamed.contexture.json');
    expect(useDocumentStore.getState()).toMatchObject({
      filePath: '/tmp/renamed.contexture.json',
      mode: 'bundle',
      isDirty: false,
    });
  });

  it('acceptRestoredSession keeps the document untitled while restoring layout', () => {
    useDocumentStore
      .getState()
      .acceptOpenedBundle({ filePath: '/tmp/garden.contexture.json', layout: LAYOUT });

    useDocumentStore.getState().acceptRestoredSession({
      layout: { version: '1', positions: { Draft: { x: 1, y: 2 } } },
    });

    expect(useDocumentStore.getState()).toMatchObject({
      filePath: null,
      mode: 'bundle',
      layout: { version: '1', positions: { Draft: { x: 1, y: 2 } } },
    });
  });
});
