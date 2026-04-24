/**
 * TypeDetail — one test per TypeDef.kind proving the right form renders
 * and the right op dispatches on blur/change.
 */
import { TypeDetail } from '@renderer/components/detail/TypeDetail';
import type { TypeDef } from '@renderer/model/ir';
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

  describe('Convex section (object kind)', () => {
    const base: TypeDef = {
      kind: 'object',
      name: 'Post',
      fields: [
        { name: 'author', type: { kind: 'string' } },
        { name: 'title', type: { kind: 'string' } },
      ],
    };

    it('renders the "Use as Convex table" checkbox', () => {
      setup(base);
      expect(screen.getByLabelText('Use as Convex table')).toBeInTheDocument();
    });

    it('dispatches set_table_flag when the checkbox toggles on', () => {
      const { dispatch } = setup(base);
      fireEvent.click(screen.getByLabelText('Use as Convex table'));
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'set_table_flag',
        typeName: 'Post',
        table: true,
      });
    });

    it('dispatches set_table_flag:false when toggled off', () => {
      const { dispatch } = setup({ ...base, table: true });
      fireEvent.click(screen.getByLabelText('Use as Convex table'));
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'set_table_flag',
        typeName: 'Post',
        table: false,
      });
    });

    it('does not show the indexes editor when the type is not a table', () => {
      setup(base);
      expect(screen.queryByText('Indexes')).not.toBeInTheDocument();
    });

    it('shows the indexes editor and add-index button when table:true', () => {
      setup({ ...base, table: true });
      expect(screen.getByText('Indexes')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add index/i })).toBeInTheDocument();
    });

    it('does not render the Convex section for non-object kinds', () => {
      setup({
        kind: 'enum',
        name: 'Role',
        values: [{ value: 'admin' }],
      });
      expect(screen.queryByLabelText('Use as Convex table')).not.toBeInTheDocument();
    });

    it('dispatches add_index with a placeholder name when "Add index" is clicked', () => {
      const { dispatch } = setup({ ...base, table: true });
      fireEvent.click(screen.getByRole('button', { name: /add index/i }));
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'add_index',
          typeName: 'Post',
          index: expect.objectContaining({ fields: [expect.any(String)] }),
        }),
      );
    });

    it('dispatches remove_index when the delete button is clicked', () => {
      const typeWithIndex: TypeDef = {
        ...base,
        table: true,
        indexes: [{ name: 'by_author', fields: ['author'] }],
      };
      const { dispatch } = setup(typeWithIndex);
      fireEvent.click(screen.getByRole('button', { name: /delete index by_author/i }));
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'remove_index',
        typeName: 'Post',
        name: 'by_author',
      });
    });

    it('dispatches update_index when the name input blurs with a new value', () => {
      const typeWithIndex: TypeDef = {
        ...base,
        table: true,
        indexes: [{ name: 'by_author', fields: ['author'] }],
      };
      const { dispatch } = setup(typeWithIndex);
      const input = screen.getByDisplayValue('by_author') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'by_writer' } });
      fireEvent.blur(input);
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'update_index',
        typeName: 'Post',
        name: 'by_author',
        patch: { name: 'by_writer' },
      });
    });

    it('dispatches update_index when a field checkbox toggles', () => {
      const typeWithIndex: TypeDef = {
        ...base,
        table: true,
        indexes: [{ name: 'by_author', fields: ['author'] }],
      };
      const { dispatch } = setup(typeWithIndex);
      // The "title" field is not in the index — toggling it on should patch fields.
      const titleCheckbox = screen.getByLabelText('by_author: title');
      fireEvent.click(titleCheckbox);
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'update_index',
        typeName: 'Post',
        name: 'by_author',
        patch: { fields: ['author', 'title'] },
      });
    });

    it('flags type name starting with "_" as reserved when table:true', () => {
      setup({ ...base, name: '_Post', table: true });
      const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
      expect(nameInput.getAttribute('aria-invalid')).toBe('true');
      expect(nameInput.title).toMatch(/reserves/i);
    });

    it('does not flag type name starting with "_" when table:false', () => {
      setup({ ...base, name: '_Post' });
      const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
      expect(nameInput.getAttribute('aria-invalid')).not.toBe('true');
    });

    it('flags field names starting with "_" in the field summary when table:true', () => {
      const typeWithReserved: TypeDef = {
        ...base,
        table: true,
        fields: [
          { name: '_id', type: { kind: 'string' } },
          { name: 'author', type: { kind: 'string' } },
        ],
      };
      setup(typeWithReserved);
      const rows = screen.getAllByTestId('object-field-summary');
      expect(rows[0].getAttribute('data-reserved')).toBe('true');
      expect(rows[1].getAttribute('data-reserved')).not.toBe('true');
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
