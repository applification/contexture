/**
 * FieldDetail — one test per FieldType.kind proving the right controls
 * render and the right `update_field` op flows.
 */

import type { FieldDef, IndexDef } from '@contexture/core/ir';
import type { ModelingHint } from '@contexture/core/modeling-hints';
import { FieldDetail } from '@renderer/components/detail/FieldDetail';
import { TYPE_NODE_REF_PREVIEW_EVENT } from '@renderer/components/graph/ref-preview-event';
import type { Op } from '@renderer/store/ops';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

function setup(
  field: FieldDef,
  modelingHints: ModelingHint[] = [],
  availableTypeNames: readonly string[] = [],
  onCreateRefTarget?: () => string | undefined,
  tableIndexes?: readonly IndexDef[],
  onBackToType?: () => void,
) {
  const dispatch = vi.fn<(op: Op) => void>();
  render(
    <FieldDetail
      typeName="Plot"
      field={field}
      dispatch={dispatch}
      modelingHints={modelingHints}
      availableTypeNames={availableTypeNames}
      onCreateRefTarget={onCreateRefTarget}
      tableIndexes={tableIndexes}
      onBackToType={onBackToType}
    />,
  );
  return { dispatch };
}

async function chooseSelectOption(label: string, option: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(screen.getByRole('option', { name: option }));
}

describe('FieldDetail', () => {
  afterEach(cleanup);

  it('renders the selected field title as a panel header', () => {
    setup({ name: 'showPrice', type: { kind: 'boolean' } }, [], [], undefined, undefined, vi.fn());

    const header = screen.getByTestId('field-detail-header');
    expect(header).toContainElement(screen.getByRole('heading', { name: 'showPrice' }));
    expect(header).toHaveTextContent('object / Plot');
    expect(screen.getByRole('button', { name: 'Back to table fields' })).toHaveTextContent(
      'Fields',
    );
    expect(screen.getByRole('heading', { name: 'showPrice' })).toHaveClass('text-lg');
    expect(screen.getAllByText('boolean').length).toBeGreaterThan(0);
    expect(screen.getByText('required')).toBeInTheDocument();
    expect(screen.getByText(/sample:/)).toBeInTheDocument();
    expect(header).toHaveClass('border-b');
    expect(header).toHaveClass('bg-muted/20');
    expect(screen.getByText('Presence')).toBeInTheDocument();
    expect(screen.getByText('Default value')).toBeInTheDocument();
    expect(screen.getByText('Sample data')).toBeInTheDocument();
  });

  it('calls the back handler from the field sub-view header', () => {
    const onBackToType = vi.fn();
    setup(
      { name: 'showPrice', type: { kind: 'boolean' } },
      [],
      [],
      undefined,
      undefined,
      onBackToType,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back to table fields' }));
    expect(onBackToType).toHaveBeenCalledOnce();
  });

  it('string: min/max/regex/format controls; blur dispatches update_field', () => {
    const { dispatch } = setup({ name: 'name', type: { kind: 'string' } });
    const min = screen.getByLabelText('min');
    fireEvent.change(min, { target: { value: '1' } });
    fireEvent.blur(min);
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'name',
      patch: { type: { kind: 'string', min: 1 } },
    });
  });

  it('string: format select dispatches with correct format', async () => {
    const { dispatch } = setup({ name: 'email', type: { kind: 'string' } });
    expect(screen.getByTestId('string-format-select')).toHaveAttribute(
      'aria-label',
      'String format',
    );
    await chooseSelectOption('String format', 'email');
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'email',
      patch: { type: { kind: 'string', format: 'email' } },
    });
  });

  it('type picker changes a field from string to number', async () => {
    const { dispatch } = setup({ name: 'name', type: { kind: 'string' } });
    await chooseSelectOption('Field type', 'number');
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'name',
      patch: { type: { kind: 'number' } },
    });
  });

  it('dispatches update_field when the description changes', () => {
    const { dispatch } = setup({ name: 'name', type: { kind: 'string' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add description' }));
    const textarea = screen.getByLabelText('Description');
    fireEvent.change(textarea, { target: { value: 'Display name for the plot.' } });
    fireEvent.blur(textarea);
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'name',
      patch: { description: 'Display name for the plot.' },
    });
  });

  it('dispatches update_field when the field name changes', () => {
    const { dispatch } = setup({ name: 'name', type: { kind: 'string' } });
    const input = screen.getByLabelText('Name');
    fireEvent.change(input, { target: { value: 'title' } });
    fireEvent.blur(input);
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'name',
      patch: { name: 'title' },
    });
  });

  it('dispatches remove_field when the field delete action is clicked', async () => {
    const user = userEvent.setup();
    const { dispatch } = setup({ name: 'name', type: { kind: 'string' } });
    await user.click(screen.getByRole('button', { name: 'Field actions for name' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete field' }));
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'remove_field',
      typeName: 'Plot',
      fieldName: 'name',
    });
  });

  it('dispatches update_field when a string default changes', () => {
    const { dispatch } = setup({ name: 'name', type: { kind: 'string' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set default value' }));
    const input = screen.getByLabelText('Default value');
    fireEvent.change(input, { target: { value: 'Untitled' } });
    fireEvent.blur(input);
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'name',
      patch: { default: 'Untitled' },
    });
  });

  it('parses numeric and boolean defaults by field type', () => {
    const number = setup({ name: 'count', type: { kind: 'number' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set default value' }));
    fireEvent.change(screen.getByLabelText('Default value'), { target: { value: '42' } });
    fireEvent.blur(screen.getByLabelText('Default value'));
    expect(number.dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'count',
      patch: { default: 42 },
    });

    cleanup();
    const boolean = setup({ name: 'published', type: { kind: 'boolean' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set default value' }));
    fireEvent.change(screen.getByLabelText('Default value'), { target: { value: 'false' } });
    fireEvent.blur(screen.getByLabelText('Default value'));
    expect(boolean.dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'published',
      patch: { default: false },
    });
  });

  it('clears a default when the input is emptied', () => {
    const { dispatch } = setup({
      name: 'published',
      type: { kind: 'boolean' },
      default: false,
    });
    const input = screen.getByLabelText('Default value');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'published',
      patch: { default: undefined },
    });
  });

  it('adds a single-field index for a table field', () => {
    const { dispatch } = setup(
      { name: 'author', type: { kind: 'ref', typeName: 'User' } },
      [],
      [],
      undefined,
      [],
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add index for author' }));
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'add_index',
      typeName: 'Plot',
      index: { name: 'by_author', fields: ['author'] },
    });
  });

  it('increments the generated index name when needed', () => {
    const { dispatch } = setup(
      { name: 'author', type: { kind: 'ref', typeName: 'User' } },
      [],
      [],
      undefined,
      [{ name: 'by_author', fields: ['name'] }],
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add index for author' }));
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'add_index',
      typeName: 'Plot',
      index: { name: 'by_author2', fields: ['author'] },
    });
  });

  it('shows existing single-field index state instead of adding a duplicate', () => {
    setup({ name: 'author', type: { kind: 'ref', typeName: 'User' } }, [], [], undefined, [
      { name: 'by_author', fields: ['author'] },
    ]);
    expect(screen.getByText('indexed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'by_author' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add index for author' })).not.toBeInTheDocument();
  });

  it('type picker creates a ref to the first available type', async () => {
    const { dispatch } = setup(
      { name: 'harvest', type: { kind: 'string' } },
      [],
      ['Harvest', 'Season'],
    );
    await chooseSelectOption('Field type', 'ref');
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'harvest',
      patch: { type: { kind: 'ref', typeName: 'Harvest' } },
    });
  });

  it('type picker creates a stdlib ref when no local type is available', async () => {
    const { dispatch } = setup({ name: 'email', type: { kind: 'string' } });
    await chooseSelectOption('Field type', 'ref');
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'email',
      patch: { type: { kind: 'ref', typeName: 'common.Email' } },
    });
  });

  it('number: min/max/int controls; blur dispatches', () => {
    const { dispatch } = setup({ name: 'area', type: { kind: 'number' } });
    const max = screen.getByLabelText('max');
    fireEvent.change(max, { target: { value: '100' } });
    fireEvent.blur(max);
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'area',
      patch: { type: { kind: 'number', max: 100 } },
    });
  });

  it('boolean: renders no constraints message', () => {
    setup({ name: 'active', type: { kind: 'boolean' } });
    expect(screen.getByText(/No additional constraints/i)).toBeInTheDocument();
  });

  it('date: renders no constraints message', () => {
    setup({ name: 'dob', type: { kind: 'date' } });
    expect(screen.getByText(/No additional constraints/i)).toBeInTheDocument();
  });

  it('literal: value input dispatches with coerced type', () => {
    const { dispatch } = setup({ name: 'kind', type: { kind: 'literal', value: 'login' } });
    const input = screen.getByLabelText('value');
    fireEvent.change(input, { target: { value: '42' } });
    fireEvent.blur(input);
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'kind',
      patch: { type: { kind: 'literal', value: 42 } },
    });
  });

  it('ref: target picker preserves an unknown current target', () => {
    const { dispatch } = setup({ name: 'harvest', type: { kind: 'ref', typeName: 'Harvest' } });
    fireEvent.click(screen.getByLabelText('target'));
    expect(screen.getByRole('option', { name: 'Harvest' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /^Email - Email address\./ }));
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'harvest',
      patch: { type: { kind: 'ref', typeName: 'common.Email' } },
    });
  });

  it('ref: target picker dispatches from available type names', () => {
    const { dispatch } = setup(
      { name: 'harvest', type: { kind: 'ref', typeName: 'Harvest' } },
      [],
      ['Harvest', 'HarvestLog'],
    );
    fireEvent.click(screen.getByLabelText('target'));
    fireEvent.click(screen.getByRole('option', { name: 'HarvestLog' }));
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'harvest',
      patch: { type: { kind: 'ref', typeName: 'HarvestLog' } },
    });
  });

  it('ref: target picker previews local targets on hover and focus', () => {
    const handler = vi.fn();
    document.addEventListener(TYPE_NODE_REF_PREVIEW_EVENT, handler as EventListener);
    setup({ name: 'harvest', type: { kind: 'ref', typeName: 'Harvest' } }, [], ['HarvestLog']);

    fireEvent.click(screen.getByLabelText('target'));
    const option = screen.getByRole('option', { name: 'HarvestLog' });
    fireEvent.mouseEnter(option);
    fireEvent.mouseLeave(option);
    fireEvent.focus(option);
    fireEvent.blur(option);

    document.removeEventListener(TYPE_NODE_REF_PREVIEW_EVENT, handler as EventListener);
    expect(handler.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual([
      { sourceType: 'Plot', sourceField: 'harvest', targetType: 'HarvestLog', active: true },
      { sourceType: 'Plot', sourceField: 'harvest', targetType: 'HarvestLog', active: false },
      { sourceType: 'Plot', sourceField: 'harvest', targetType: 'HarvestLog', active: true },
      { sourceType: 'Plot', sourceField: 'harvest', targetType: 'HarvestLog', active: false },
    ]);
  });

  it('ref: target picker includes searchable grouped stdlib types', () => {
    const { dispatch } = setup({
      name: 'country',
      type: { kind: 'ref', typeName: 'common.Email' },
    });
    fireEvent.click(screen.getByLabelText('target'));
    expect(screen.getByRole('option', { name: /^Email - Email address\./ })).toBeInTheDocument();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
    expect(
      screen.getByRole('option', {
        name: /^CountryCode - ISO 3166-1 alpha-2 officially-assigned country code\./,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('GB')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Find a type...'), {
      target: { value: 'country' },
    });
    fireEvent.click(
      screen.getByRole('option', {
        name: /^CountryCode - ISO 3166-1 alpha-2 officially-assigned country code\./,
      }),
    );
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'country',
      patch: { type: { kind: 'ref', typeName: 'place.CountryCode' } },
    });
  });

  it('ref: target picker can create and select a referenced object type', () => {
    const createRefTarget = vi.fn(() => 'Harvest');
    const { dispatch } = setup(
      { name: 'harvest', type: { kind: 'ref', typeName: 'common.Email' } },
      [],
      [],
      createRefTarget,
    );

    fireEvent.click(screen.getByLabelText('target'));
    fireEvent.click(screen.getByRole('button', { name: 'Create object target' }));

    expect(createRefTarget).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'harvest',
      patch: { type: { kind: 'ref', typeName: 'Harvest' } },
    });
  });

  it('type picker wraps the current field as a string array', async () => {
    const { dispatch } = setup({ name: 'tags', type: { kind: 'string' } });
    await chooseSelectOption('Field type', 'array');
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'tags',
      patch: { type: { kind: 'array', element: { kind: 'string' } } },
    });
  });

  it('list toggle wraps the current type without resetting constraints', () => {
    const { dispatch } = setup({ name: 'tags', type: { kind: 'string', min: 2 } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'List' }));
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'tags',
      patch: { type: { kind: 'array', element: { kind: 'string', min: 2 } } },
    });
  });

  it('list toggle unwraps an array back to its element type', () => {
    const { dispatch } = setup({
      name: 'scores',
      type: { kind: 'array', element: { kind: 'number', int: true } },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'List' }));
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'scores',
      patch: { type: { kind: 'number', int: true } },
    });
  });

  it('array: recurses into element editor; changing element dispatches array type', () => {
    const { dispatch } = setup({
      name: 'tags',
      type: { kind: 'array', element: { kind: 'string' } },
    });
    // String's "min" is the element's min, not the array's — changing it
    // should bubble up as a fresh array type with the updated element.
    const min = screen.getByLabelText('min');
    fireEvent.change(min, { target: { value: '2' } });
    fireEvent.blur(min);
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'tags',
      patch: { type: { kind: 'array', element: { kind: 'string', min: 2 } } },
    });
  });

  it('optional / nullable checkboxes dispatch update_field', () => {
    const { dispatch } = setup({ name: 'n', type: { kind: 'string' } });
    const optional = screen.getByRole('checkbox', { name: 'Optional' });
    expect(optional).toHaveAccessibleDescription('May be omitted');
    fireEvent.click(optional);
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'n',
      patch: { optional: true },
    });
  });

  it('server-derived checkbox dispatches update_field', () => {
    const { dispatch } = setup({ name: 'createdAt', type: { kind: 'date' } });
    const serverDerived = screen.getByRole('checkbox', { name: 'Server derived' });
    expect(serverDerived).toHaveAccessibleDescription('Computed by backend');
    fireEvent.click(serverDerived);
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'createdAt',
      patch: { serverDerived: true },
    });
  });

  it('server-derived checkbox clears the marker when unchecked', () => {
    const { dispatch } = setup({
      name: 'createdAt',
      type: { kind: 'date' },
      serverDerived: true,
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Server derived' }));
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'createdAt',
      patch: { serverDerived: undefined },
    });
  });

  it('renders field-level query handle guidance when supplied', () => {
    setup({ name: 'sourceSearchText', type: { kind: 'string' } }, [
      {
        id: 'v1:query_handle:Plot:sourceSearchText',
        kind: 'query_handle',
        signals: ['query_pressure'],
        path: 'types.0.fields.0',
        typeName: 'Plot',
        fieldName: 'sourceSearchText',
        title: 'Query handle',
        message:
          'This field looks useful for filtering, sorting, indexing, or search. It can stay denormalized on the table as a query handle over embedded data.',
        rationale:
          'A top-level query handle can preserve an embedded shape while keeping common queries efficient.',
        fieldNames: ['sourceSearchText'],
      },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Model advice' }));
    expect(screen.getAllByText('Query handle').length).toBeGreaterThan(0);
    expect(screen.getByText(/stay denormalized/i)).toBeInTheDocument();
  });
});
