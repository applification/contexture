/**
 * TypeDetail — one test per TypeDef.kind proving the right form renders
 * and the right op dispatches on blur/change.
 */
import { TypeDetail } from '@renderer/components/detail/TypeDetail';
import type { TypeDef } from '@renderer/model/types';
import type { Op } from '@renderer/store/ops';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

function setup(type: TypeDef) {
  const dispatch = vi.fn<(op: Op) => void>();
  render(<TypeDetail type={type} dispatch={dispatch} />);
  return { dispatch };
}

describe('TypeDetail', () => {
  afterEach(cleanup);

  describe('object kind', () => {
    const type: TypeDef = {
      kind: 'object',
      name: 'Plot',
      fields: [
        { name: 'name', type: { kind: 'string' } },
        { name: 'area', type: { kind: 'number' }, optional: true },
      ],
    };

    it('renders name, kind, and each field summary', () => {
      setup(type);
      expect(screen.getByText('Plot')).toBeInTheDocument();
      expect(screen.getByText('object')).toBeInTheDocument();
      const rows = screen.getAllByTestId('object-field-summary');
      expect(rows).toHaveLength(2);
      expect(rows[1]).toHaveTextContent('area?');
    });

    it('dispatches rename_type when the name input blurs with a new value', () => {
      const { dispatch } = setup(type);
      const input = screen.getByLabelText('Name') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Allotment' } });
      fireEvent.blur(input);
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'rename_type',
        from: 'Plot',
        to: 'Allotment',
      });
    });

    it('dispatches update_type when the description changes', () => {
      const { dispatch } = setup(type);
      const textarea = screen.getByLabelText('Description');
      fireEvent.change(textarea, { target: { value: 'A plot of land.' } });
      fireEvent.blur(textarea);
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'update_type',
        name: 'Plot',
        patch: { description: 'A plot of land.' },
      });
    });
  });

  describe('enum kind', () => {
    const type: TypeDef = {
      kind: 'enum',
      name: 'Season',
      values: [{ value: 'spring' }, { value: 'summer' }],
    };

    it('renders comma-separated values in a textarea', () => {
      setup(type);
      const textarea = screen.getByLabelText(/values/i) as HTMLTextAreaElement;
      expect(textarea.value).toBe('spring, summer');
    });

    it('dispatches update_type with new values when the textarea blurs', () => {
      const { dispatch } = setup(type);
      const textarea = screen.getByLabelText(/values/i);
      fireEvent.change(textarea, { target: { value: 'spring, summer, autumn' } });
      fireEvent.blur(textarea);
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'update_type',
        name: 'Season',
        patch: { values: [{ value: 'spring' }, { value: 'summer' }, { value: 'autumn' }] },
      });
    });
  });

  describe('discriminatedUnion kind', () => {
    const type: TypeDef = {
      kind: 'discriminatedUnion',
      name: 'Event',
      discriminator: 'kind',
      variants: ['Login', 'Logout'],
    };

    it('renders discriminator input + variant list', () => {
      setup(type);
      expect((screen.getByLabelText('Discriminator field') as HTMLInputElement).value).toBe('kind');
      expect(screen.getAllByTestId('du-variant').map((el) => el.textContent)).toEqual([
        'Login',
        'Logout',
      ]);
    });

    it('dispatches set_discriminator when the discriminator input blurs', () => {
      const { dispatch } = setup(type);
      const input = screen.getByLabelText('Discriminator field');
      fireEvent.change(input, { target: { value: 'type' } });
      fireEvent.blur(input);
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'set_discriminator',
        typeName: 'Event',
        discriminator: 'type',
      });
    });
  });

  describe('raw kind', () => {
    const type: TypeDef = {
      kind: 'raw',
      name: 'UnixTime',
      zod: 'z.number().int().nonnegative()',
      jsonSchema: { type: 'integer', minimum: 0 },
    };

    it('renders the Zod expression editable', () => {
      setup(type);
      const ta = screen.getByLabelText('Zod expression') as HTMLTextAreaElement;
      expect(ta.value).toBe('z.number().int().nonnegative()');
    });

    it('dispatches update_type when zod expression changes', () => {
      const { dispatch } = setup(type);
      const ta = screen.getByLabelText('Zod expression');
      fireEvent.change(ta, { target: { value: 'z.number().int()' } });
      fireEvent.blur(ta);
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'update_type',
        name: 'UnixTime',
        patch: { zod: 'z.number().int()' },
      });
    });
  });
});
