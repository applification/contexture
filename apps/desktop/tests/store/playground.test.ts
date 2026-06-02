import { usePlaygroundStore } from '@renderer/store/playground';
import { beforeEach, describe, expect, it } from 'vitest';

describe('playground store', () => {
  beforeEach(() => {
    usePlaygroundStore.setState({
      selectedTypeName: null,
      selectedRecordId: null,
      recordsByType: {},
      activeScopeId: 'default',
      recordsByScope: { default: {} },
    });
  });

  it('keeps records isolated by schema scope even when type names match', () => {
    const store = usePlaygroundStore.getState();

    store.setScope('schema:one', ['User']);
    const firstId = usePlaygroundStore
      .getState()
      .upsertRecord('User', null, { name: 'Ada Lovelace' });

    usePlaygroundStore.getState().setScope('schema:two', ['User']);
    expect(usePlaygroundStore.getState().recordsByType.User).toBeUndefined();
    expect(usePlaygroundStore.getState().selectedRecordId).toBeNull();

    const secondId = usePlaygroundStore
      .getState()
      .upsertRecord('User', null, { name: 'Grace Hopper' });
    expect(usePlaygroundStore.getState().recordsByType.User?.[0]).toMatchObject({
      id: secondId,
      value: { name: 'Grace Hopper' },
    });

    usePlaygroundStore.getState().setScope('schema:one', ['User']);
    expect(usePlaygroundStore.getState().recordsByType.User?.[0]).toMatchObject({
      id: firstId,
      value: { name: 'Ada Lovelace' },
    });
  });
});
