/**
 * FieldDetail — one test per FieldType.kind proving the right controls
 * render and the right `update_field` op flows.
 */
import { FieldDetail } from '@renderer/components/detail/FieldDetail';
import type { FieldDef } from '@renderer/model/types';
import type { Op } from '@renderer/store/ops';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

function setup(field: FieldDef) {
  const dispatch = vi.fn<(op: Op) => void>();
  render(<FieldDetail typeName="Plot" field={field} dispatch={dispatch} />);
  return { dispatch };
}

describe('FieldDetail', () => {
  afterEach(cleanup);

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

  it('string: format select dispatches with correct format', () => {
    const { dispatch } = setup({ name: 'email', type: { kind: 'string' } });
    const select = screen.getByTestId('string-format-select');
    fireEvent.change(select, { target: { value: 'email' } });
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'email',
      patch: { type: { kind: 'string', format: 'email' } },
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

  it('ref: target input dispatches with new typeName', () => {
    const { dispatch } = setup({ name: 'harvest', type: { kind: 'ref', typeName: 'Harvest' } });
    const input = screen.getByLabelText('target');
    fireEvent.change(input, { target: { value: 'HarvestLog' } });
    fireEvent.blur(input);
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'harvest',
      patch: { type: { kind: 'ref', typeName: 'HarvestLog' } },
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
    // First checkbox is "optional".
    const optional = screen.getAllByRole('checkbox')[0];
    fireEvent.click(optional);
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'update_field',
      typeName: 'Plot',
      fieldName: 'n',
      patch: { optional: true },
    });
  });
});
