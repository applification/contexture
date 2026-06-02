import type { Schema } from '@contexture/core/ir';
import { PlaygroundPanel } from '@renderer/components/playground/PlaygroundPanel';
import { usePlaygroundStore } from '@renderer/store/playground';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const schema: Schema = {
  version: '1',
  types: [
    {
      kind: 'object',
      name: 'User',
      table: true,
      fields: [
        { name: 'name', type: { kind: 'string' } },
        { name: 'bornOn', type: { kind: 'date' } },
        { name: 'tagIds', type: { kind: 'array', element: { kind: 'string' } } },
      ],
    },
  ],
};

const stdlibRefSchema: Schema = {
  version: '1',
  types: [
    {
      kind: 'object',
      name: 'RecordLabel',
      table: true,
      fields: [
        { name: 'name', type: { kind: 'ref', typeName: 'common.NonEmptyString' } },
        { name: 'country', type: { kind: 'ref', typeName: 'place.CountryCode' } },
      ],
    },
  ],
};

describe('PlaygroundPanel', () => {
  beforeEach(() => {
    usePlaygroundStore.setState({
      selectedTypeName: null,
      selectedRecordId: null,
      recordsByType: {},
      activeScopeId: 'default',
      recordsByScope: { default: {} },
    });
  });

  afterEach(cleanup);

  it('blocks required empty string and date values when saving manually', async () => {
    const user = userEvent.setup();
    render(<PlaygroundPanel schema={schema} />);

    await user.click(screen.getByRole('button', { name: 'New record' }));
    await user.clear(screen.getByLabelText('Name'));
    await user.clear(screen.getByLabelText('Born On'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(usePlaygroundStore.getState().recordsByType.User).toBeUndefined();
    expect(screen.getAllByText('Required.').length).toBeGreaterThanOrEqual(2);
  });

  it('validates JSON array item types before saving manually', async () => {
    const user = userEvent.setup();
    render(<PlaygroundPanel schema={schema} />);

    await user.click(screen.getByRole('button', { name: 'New record' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada Lovelace' } });
    fireEvent.change(screen.getByLabelText('Born On'), { target: { value: '1815-12-10' } });
    fireEvent.change(screen.getByLabelText('Tag Ids'), { target: { value: '[1]' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(usePlaygroundStore.getState().recordsByType.User).toBeUndefined();
    expect(screen.getByText('Item 1 does not match the array element type.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tag Ids'), { target: { value: '["primary"]' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(usePlaygroundStore.getState().recordsByType.User?.[0]?.value).toMatchObject({
      name: 'Ada Lovelace',
      bornOn: '1815-12-10',
      tagIds: ['primary'],
    });
    expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0);
  });

  it('renders stdlib value refs as editable fields instead of unknown reference targets', async () => {
    const user = userEvent.setup();
    render(<PlaygroundPanel schema={stdlibRefSchema} />);

    await user.click(screen.getByRole('button', { name: 'New record' }));

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Country' })).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/Unknown reference target/u)).not.toBeInTheDocument();
  });
});
