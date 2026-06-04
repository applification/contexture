import type { Schema } from '@contexture/core/ir';
import { PlaygroundPanel } from '@renderer/components/playground/PlaygroundPanel';
import { usePlaygroundStore } from '@renderer/store/playground';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    {
      kind: 'object',
      name: 'Team',
      table: true,
      fields: [{ name: 'name', type: { kind: 'string' } }],
    },
    {
      kind: 'object',
      name: 'RecipeDietarySuitability',
      fields: [{ name: 'name', type: { kind: 'string' } }],
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

  it('highlights an inspector-selected type without replacing the current entity', () => {
    render(<PlaygroundPanel schema={schema} highlightedTypeName="Team" />);

    expect(
      screen.getByText('Inspector selection is highlighted in the model.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Team')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Select entity' })).toHaveTextContent('User');
  });

  it('reports manual entity selection so the canvas can focus the type', async () => {
    const user = userEvent.setup();
    const onSelectEntity = vi.fn();
    render(<PlaygroundPanel schema={schema} onSelectEntity={onSelectEntity} />);

    await user.click(screen.getByRole('combobox', { name: 'Select entity' }));
    await user.click(screen.getByRole('option', { name: 'Team (0)' }));

    expect(onSelectEntity).toHaveBeenCalledWith('Team');
  });

  it('dismisses an unavailable Try target after choosing a table entity', async () => {
    const user = userEvent.setup();
    render(<PlaygroundPanel schema={schema} highlightedTypeName="RecipeDietarySuitability" />);

    expect(
      screen.getByText(
        'RecipeDietarySuitability is not available in Playground. Choose a table from the entity list.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Select entity' }));
    await user.click(screen.getByRole('option', { name: 'Team (0)' }));

    expect(
      screen.queryByText(
        'RecipeDietarySuitability is not available in Playground. Choose a table from the entity list.',
      ),
    ).not.toBeInTheDocument();
  });

  it('clears an unavailable Try target when the highlight is removed', () => {
    const { rerender } = render(
      <PlaygroundPanel schema={schema} highlightedTypeName="RecipeDietarySuitability" />,
    );

    expect(
      screen.getByText(
        'RecipeDietarySuitability is not available in Playground. Choose a table from the entity list.',
      ),
    ).toBeInTheDocument();

    rerender(<PlaygroundPanel schema={schema} highlightedTypeName={null} />);

    expect(
      screen.queryByText(
        'RecipeDietarySuitability is not available in Playground. Choose a table from the entity list.',
      ),
    ).not.toBeInTheDocument();
  });

  it('places the all-entities seed action in the Playground header', () => {
    render(<PlaygroundPanel schema={schema} />);

    const header = screen.getByRole('banner');
    expect(header).toHaveTextContent('0 records');
    expect(header).toContainElement(screen.getByRole('button', { name: 'Seed all entities' }));
    expect(screen.getByRole('button', { name: 'Seed current entity' })).toBeInTheDocument();
  });

  it('packs record form fields at the top of the scroll area', async () => {
    const user = userEvent.setup();
    const { container } = render(<PlaygroundPanel schema={schema} />);

    await user.click(screen.getByRole('button', { name: 'New record' }));

    expect(container.querySelector('[data-slot="field-group"].content-start')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
