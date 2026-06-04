/**
 * TypeDetail — one test per TypeDef.kind proving the right form renders
 * and the right op dispatches on blur/change.
 */

import type { TypeDef } from '@contexture/core/ir';
import type { ModelingHint } from '@contexture/core/modeling-hints';
import { FOCUS_TYPE_NAME_EVENT, TypeDetail } from '@renderer/components/detail/TypeDetail';
import type { ValidationError } from '@renderer/services/validation';
import { useChatComposerStore } from '@renderer/store/chat-composer';
import type { Op } from '@renderer/store/ops';
import { useGraphSelectionStore } from '@renderer/store/selection';
import { useUIChromeStore } from '@renderer/store/ui-chrome';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

function setup(
  type: TypeDef,
  modelingHints: ModelingHint[] = [],
  availableObjectTypeNames: readonly string[] = [],
  validationErrors: ValidationError[] = [],
  availableTypeNames: readonly string[] = availableObjectTypeNames,
) {
  const dispatch = vi.fn<(op: Op) => void>();
  render(
    <TypeDetail
      type={type}
      dispatch={dispatch}
      modelingHints={modelingHints}
      availableTypeNames={availableTypeNames}
      availableObjectTypeNames={availableObjectTypeNames}
      validationErrors={validationErrors}
    />,
  );
  return { dispatch };
}

describe('TypeDetail', () => {
  afterEach(() => {
    useGraphSelectionStore.getState().clear();
    useChatComposerStore.getState().setPendingChatMessage(null);
    useUIChromeStore.getState().setSidebarTab('chat');
    cleanup();
  });

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
      expect(screen.getByLabelText('Name')).toHaveValue('Plot');
      expect(screen.queryByTestId('type-detail-header')).not.toBeInTheDocument();
      const rows = screen.getAllByTestId('object-field-summary');
      expect(rows).toHaveLength(2);
      expect(screen.getByDisplayValue('area')).toBeInTheDocument();
      expect(rows[1]).not.toHaveTextContent('?');
    });

    it('renders field optionality as editable switches', () => {
      setup(type);
      expect(screen.getByLabelText('name optional')).not.toBeChecked();
      expect(screen.getByLabelText('area optional')).toBeChecked();
    });

    it('dispatches add_field when Add field is clicked', () => {
      const { dispatch } = setup(type);
      fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'add_field',
        typeName: 'Plot',
        field: { name: 'field1', type: { kind: 'string' } },
      });
      expect(useGraphSelectionStore.getState().state.selectedField).toEqual({
        typeName: 'Plot',
        fieldName: 'field1',
      });
    });

    it('dispatches add_field for an empty object', () => {
      const { dispatch } = setup({ kind: 'object', name: 'Plot', fields: [] });
      fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'add_field',
        typeName: 'Plot',
        field: { name: 'field1', type: { kind: 'string' } },
      });
      expect(useGraphSelectionStore.getState().state.selectedField).toEqual({
        typeName: 'Plot',
        fieldName: 'field1',
      });
    });

    it('dispatches update_field when a field name is edited', () => {
      const { dispatch } = setup(type);
      const input = screen.getByLabelText('Field name name');
      fireEvent.change(input, { target: { value: 'title' } });
      fireEvent.blur(input);
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'update_field',
        typeName: 'Plot',
        fieldName: 'name',
        patch: { name: 'title' },
      });
    });

    it('dispatches update_field when field optionality toggles', () => {
      const { dispatch } = setup(type);
      fireEvent.click(screen.getByLabelText('name optional'));
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'update_field',
        typeName: 'Plot',
        fieldName: 'name',
        patch: { optional: true },
      });
    });

    it('dispatches remove_field when a field is deleted from the field list', () => {
      const { dispatch } = setup(type);
      fireEvent.click(screen.getByRole('button', { name: 'Delete field area' }));
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'remove_field',
        typeName: 'Plot',
        fieldName: 'area',
      });
    });

    it('raises field-select when a field is opened from the field list', () => {
      setup(type);

      fireEvent.click(screen.getByRole('button', { name: 'Edit field area' }));

      expect(useGraphSelectionStore.getState().state.selectedField).toEqual({
        typeName: 'Plot',
        fieldName: 'area',
      });
    });

    it('raises field-select when a field validation issue is clicked', () => {
      setup(
        type,
        [],
        [],
        [
          {
            code: 'unresolved_ref',
            path: 'types.0.fields.1.type',
            message: 'Unresolved ref "Area".',
          },
        ],
      );

      fireEvent.click(screen.getByRole('button', { name: /Unresolved ref "Area"/i }));

      expect(useGraphSelectionStore.getState().state.selectedField).toEqual({
        typeName: 'Plot',
        fieldName: 'area',
      });
    });

    it('dispatches reorder_fields when a field is dragged later', () => {
      const { dispatch } = setup(type);
      const rows = screen.getAllByTestId('object-field-summary');
      const nameHandle = screen.getByLabelText('Drag field name to reorder');
      const dataTransfer = {
        effectAllowed: '',
        dropEffect: '',
        getData: vi.fn(() => 'name'),
        setData: vi.fn(),
      };
      fireEvent.dragStart(nameHandle, { dataTransfer });
      fireEvent.dragEnter(rows[1]);
      expect(rows[1]).toHaveClass('bg-reference/10');
      fireEvent.dragOver(rows[1]);
      fireEvent.drop(rows[1], { dataTransfer });
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'reorder_fields',
        typeName: 'Plot',
        order: ['area', 'name'],
      });
    });

    it('uses compact drag handles instead of visible move buttons', () => {
      setup(type);
      expect(screen.getByLabelText('Drag field name to reorder')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Move field name earlier' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Move field area later' }),
      ).not.toBeInTheDocument();
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

    it('focuses and selects the name input when requested for the current type', () => {
      setup(type);
      const input = screen.getByLabelText('Name') as HTMLInputElement;
      document.dispatchEvent(
        new CustomEvent(FOCUS_TYPE_NAME_EVENT, { detail: { typeName: 'Plot' } }),
      );

      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(input.value.length);
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

    it('renders advisory model shape guidance when hints are supplied', () => {
      setup(type, [
        {
          id: 'v1:possible_entity:Plot:name',
          kind: 'possible_entity',
          signals: ['identity_pressure'],
          path: 'types.0',
          typeName: 'Plot',
          title: 'Possible entity',
          message:
            'This embedded object has identity-like fields. Keep it embedded if it only belongs to Garden.',
          rationale: 'Identity-like fields often become useful handles.',
          fieldNames: ['name'],
        },
      ]);

      expect(screen.getByRole('region', { name: 'Model shape' })).toBeInTheDocument();
      expect(screen.getByText('Embed for ownership. Extract for identity.')).toBeInTheDocument();
      expect(screen.getByText('Possible entity')).toBeInTheDocument();
      expect(screen.queryByText(/warning/i)).not.toBeInTheDocument();
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

    it('shows field-level modeling advice from the field row popover', () => {
      setup({ ...base, table: true }, [
        {
          id: 'v1:query_handle:Post:title',
          kind: 'query_handle',
          signals: ['query_pressure'],
          path: 'types.0.fields.1',
          typeName: 'Post',
          fieldName: 'title',
          title: 'Query handle',
          message: 'This field looks useful for filtering, sorting, indexing, or search.',
          rationale: 'A top-level query handle can preserve common queries.',
          fieldNames: ['title'],
        },
      ]);

      expect(screen.getByText('1 advisory')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Modeling advice for title' }));

      expect(screen.getByText('Query handle')).toBeInTheDocument();
      expect(screen.getByText(/useful for filtering/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Discuss in chat' }));

      expect(useUIChromeStore.getState().sidebarTab).toBe('chat');
      expect(useChatComposerStore.getState().pendingChatMessage?.message).toContain('Post.title');
      expect(useChatComposerStore.getState().pendingChatMessage?.message).toContain('Query handle');
    });

    it('uses warning emphasis for high-pressure field modeling advice', () => {
      setup({ ...base, table: true }, [
        {
          id: 'v1:embedded_collection:Post:title:PostTitle',
          kind: 'embedded_collection',
          signals: [
            'embedded_collection_pressure',
            'relationship_pressure',
            'concurrency_pressure',
          ],
          path: 'types.0.fields.1',
          typeName: 'Post',
          fieldName: 'title',
          title: 'Collaborative embedded collection',
          message: 'Row identity avoids whole-array lost updates.',
          rationale: 'Collaborative item edits are safer as scoped child table rows.',
          fieldNames: ['title'],
        },
      ]);

      const trigger = screen.getByRole('button', { name: /modeling advice for title/i });
      expect(trigger.getAttribute('style')).toContain('var(--warning)');
      expect(trigger).toHaveTextContent('1');
    });

    it('shows and edits the emitted Convex table name when table:true', () => {
      const { dispatch } = setup({ ...base, table: true, tableName: 'posts' });
      const input = screen.getByLabelText('Emitted table name') as HTMLInputElement;
      expect(input.value).toBe('posts');

      fireEvent.change(input, { target: { value: 'blogPosts' } });
      fireEvent.blur(input);

      expect(dispatch).toHaveBeenCalledWith({
        kind: 'update_type',
        name: 'Post',
        patch: { tableName: 'blogPosts' },
      });
    });

    it('clears explicit tableName when it matches the default emitted name', () => {
      const { dispatch } = setup({ ...base, table: true, tableName: 'posts' });
      const input = screen.getByLabelText('Emitted table name');

      fireEvent.change(input, { target: { value: 'post' } });
      fireEvent.blur(input);

      expect(dispatch).toHaveBeenCalledWith({
        kind: 'update_type',
        name: 'Post',
        patch: { tableName: undefined },
      });
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

    it('dispatches update_index when a field is added from the picker', () => {
      const typeWithIndex: TypeDef = {
        ...base,
        table: true,
        indexes: [{ name: 'by_author', fields: ['author'] }],
      };
      const { dispatch } = setup(typeWithIndex);
      fireEvent.click(screen.getByRole('button', { name: /add field to index by_author/i }));
      fireEvent.click(screen.getByRole('option', { name: 'title' }));
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'update_index',
        typeName: 'Post',
        name: 'by_author',
        patch: { fields: ['author', 'title'] },
      });
    });

    it('dispatches update_index when a selected field is removed', () => {
      const typeWithIndex: TypeDef = {
        ...base,
        table: true,
        indexes: [{ name: 'by_author_title', fields: ['author', 'title'] }],
      };
      const { dispatch } = setup(typeWithIndex);
      fireEvent.click(
        screen.getByRole('button', { name: /remove author from index by_author_title/i }),
      );
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'update_index',
        typeName: 'Post',
        name: 'by_author_title',
        patch: { fields: ['title'] },
      });
    });

    it('disables removing the last selected index field', () => {
      const typeWithIndex: TypeDef = {
        ...base,
        table: true,
        indexes: [{ name: 'by_author', fields: ['author'] }],
      };
      setup(typeWithIndex);
      expect(
        screen.getByRole('button', { name: /remove author from index by_author/i }),
      ).toBeDisabled();
      expect(screen.getByText('Field order affects Convex query prefixes.')).toBeInTheDocument();
    });

    it('dispatches update_index when a selected field is moved later', () => {
      const typeWithIndex: TypeDef = {
        ...base,
        table: true,
        indexes: [{ name: 'by_author_title', fields: ['author', 'title'] }],
      };
      const { dispatch } = setup(typeWithIndex);
      fireEvent.click(
        screen.getByRole('button', { name: /move author later in index by_author_title/i }),
      );
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'update_index',
        typeName: 'Post',
        name: 'by_author_title',
        patch: { fields: ['title', 'author'] },
      });
    });

    it('renders selected index fields in index order without showing unselected fields inline', () => {
      const typeWithIndex: TypeDef = {
        ...base,
        table: true,
        indexes: [{ name: 'by_title', fields: ['title'] }],
      };
      setup(typeWithIndex);
      const row = screen.getByTestId('convex-index-row');
      expect(row).toHaveTextContent('1');
      expect(row).toHaveTextContent('title');
      expect(row).not.toHaveTextContent('author');
    });

    it('shows validation issues inline on the affected index row', () => {
      const typeWithIndex: TypeDef = {
        ...base,
        table: true,
        indexes: [{ name: 'by_missing', fields: ['missing'] }],
      };
      setup(
        typeWithIndex,
        [],
        [],
        [
          {
            code: 'convex_index_unknown_field',
            path: 'types.0.indexes.0.fields.0',
            message: 'Convex index "by_missing" references unknown field "missing".',
          },
        ],
      );

      const row = screen.getByTestId('convex-index-row');
      expect(row.getAttribute('data-validation-issues')).toBe('true');
      expect(screen.getByLabelText('Index name for by_missing')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      expect(
        screen.getByRole('list', { name: 'Validation issues for index by_missing' }),
      ).toHaveTextContent('unknown field "missing"');
    });

    it('suggests indexes for refs and likely lookup fields', () => {
      const { dispatch } = setup({
        kind: 'object',
        name: 'Post',
        table: true,
        fields: [
          { name: 'author', type: { kind: 'ref', typeName: 'User' } },
          { name: 'status', type: { kind: 'string' } },
          { name: 'body', type: { kind: 'string' } },
        ],
      });

      expect(screen.getByText('2 suggested indexes')).toBeInTheDocument();
      expect(screen.getByText(/Advanced schema output/)).toHaveTextContent('2 suggestions');

      fireEvent.click(screen.getByRole('button', { name: 'Review' }));
      expect(screen.getByText('Suggested from refs and likely lookup fields.')).toBeInTheDocument();
      expect(screen.getByText('by_author')).toBeInTheDocument();
      expect(screen.getByText('by_status')).toBeInTheDocument();
      expect(screen.queryByText('by_body')).not.toBeInTheDocument();

      fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'add_index',
        typeName: 'Post',
        index: { name: 'by_author', fields: ['author'] },
      });
    });

    it('hides index suggestions that already exist', () => {
      setup({
        kind: 'object',
        name: 'Post',
        table: true,
        fields: [{ name: 'author', type: { kind: 'ref', typeName: 'User' } }],
        indexes: [{ name: 'by_author', fields: ['author'] }],
      });

      expect(
        screen.queryByText('Suggested from refs and likely lookup fields.'),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'by_author' })).not.toBeInTheDocument();
    });

    it('shows editable search indexes and does not suggest a duplicate plain index for the search field', () => {
      const { dispatch } = setup({
        kind: 'object',
        name: 'Recipe',
        table: true,
        fields: [
          { name: 'householdId', type: { kind: 'string' } },
          { name: 'searchText', type: { kind: 'string' } },
        ],
        indexes: [{ name: 'by_household', fields: ['householdId'] }],
        searchIndexes: [
          {
            name: 'search_recipes',
            searchField: 'searchText',
            filterFields: ['householdId'],
          },
        ],
      });

      expect(screen.getByText('Search indexes')).toBeInTheDocument();
      expect(screen.getByDisplayValue('search_recipes')).toBeInTheDocument();
      expect(
        screen.getByRole('combobox', { name: 'Search field for search_recipes' }),
      ).toHaveTextContent('searchText');
      expect(screen.getAllByText('householdId').length).toBeGreaterThan(0);
      expect(screen.queryByText('by_searchText')).not.toBeInTheDocument();

      const nameInput = screen.getByLabelText('Search index name for search_recipes');
      fireEvent.change(nameInput, { target: { value: 'search_library' } });
      fireEvent.blur(nameInput);
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'update_search_index',
        typeName: 'Recipe',
        name: 'search_recipes',
        patch: { name: 'search_library' },
      });

      fireEvent.click(
        screen.getByRole('button', {
          name: 'Remove householdId from search index search_recipes',
        }),
      );
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'update_search_index',
        typeName: 'Recipe',
        name: 'search_recipes',
        patch: { filterFields: [] },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Delete search index search_recipes' }));
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'remove_search_index',
        typeName: 'Recipe',
        name: 'search_recipes',
      });
    });

    it('dispatches add_search_index from the search indexes section', () => {
      const { dispatch } = setup({
        kind: 'object',
        name: 'Recipe',
        table: true,
        fields: [
          { name: 'searchText', type: { kind: 'string' } },
          { name: 'servings', type: { kind: 'number' } },
        ],
      });

      fireEvent.click(screen.getByRole('button', { name: 'Add search index' }));

      expect(dispatch).toHaveBeenCalledWith({
        kind: 'add_search_index',
        typeName: 'Recipe',
        searchIndex: { name: 'search1', searchField: 'searchText' },
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
      values: [{ value: 'spring', description: 'Planting time.' }, { value: 'summer' }],
    };

    it('renders enum values as editable rows', () => {
      setup(type);
      expect(screen.getAllByTestId('enum-value-row')).toHaveLength(2);
      expect(screen.getByDisplayValue('spring')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Planting time.')).toBeInTheDocument();
    });

    it('renders documented enum compatibility contracts', () => {
      setup({
        ...type,
        compatibility: {
          enumEvolution: {
            unknownValueBehavior: 'preserve',
            fallbackLabel: 'Unknown season',
            clientSurfaces: ['web', 'api'],
            owner: 'client',
            notes: 'Clients must preserve unknown values at the compatibility boundary.',
          },
        },
      });

      expect(screen.getByText('Compatibility contract')).toBeInTheDocument();
      expect(screen.getByText(/preserve raw value/i)).toBeInTheDocument();
      expect(screen.getByText('fallback: Unknown season')).toBeInTheDocument();
      expect(screen.getByText('owner: client')).toBeInTheDocument();
      expect(screen.getByText('web')).toBeInTheDocument();
      expect(screen.getByText('api')).toBeInTheDocument();
    });

    it('dispatches add_value when Add value is clicked', () => {
      const { dispatch } = setup(type);
      fireEvent.click(screen.getByRole('button', { name: 'Add value' }));
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'add_value',
        typeName: 'Season',
        value: 'value',
      });
    });

    it('dispatches add_value with an incremented placeholder when value already exists', () => {
      const { dispatch } = setup({
        kind: 'enum',
        name: 'Status',
        values: [{ value: 'value' }, { value: 'value2' }],
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add value' }));
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'add_value',
        typeName: 'Status',
        value: 'value3',
      });
    });

    it('dispatches update_value when a value is renamed', () => {
      const { dispatch } = setup(type);
      const input = screen.getByLabelText('Enum value spring');
      fireEvent.change(input, { target: { value: 'autumn' } });
      fireEvent.blur(input);
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'update_value',
        typeName: 'Season',
        value: 'spring',
        patch: { value: 'autumn' },
      });
    });

    it('dispatches update_value when a value description changes', () => {
      const { dispatch } = setup(type);
      const input = screen.getByLabelText('Description for summer');
      fireEvent.change(input, { target: { value: 'Harvest time.' } });
      fireEvent.blur(input);
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'update_value',
        typeName: 'Season',
        value: 'summer',
        patch: { description: 'Harvest time.' },
      });
    });

    it('dispatches remove_value when a value is deleted', () => {
      const { dispatch } = setup(type);
      fireEvent.click(screen.getByRole('button', { name: 'Delete value spring' }));
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'remove_value',
        typeName: 'Season',
        value: 'spring',
      });
    });

    it('disables deleting the last enum value', () => {
      setup({
        kind: 'enum',
        name: 'Role',
        values: [{ value: 'admin' }],
      });

      const button = screen.getByRole('button', { name: 'Delete value admin' });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', 'Enums need at least one value.');
    });

    it('disables duplicate enum row edits until validation repair resolves them', () => {
      setup({
        kind: 'enum',
        name: 'Role',
        values: [{ value: 'admin' }, { value: 'admin' }],
      });

      for (const input of screen.getAllByLabelText('Enum value admin')) {
        expect(input).toBeDisabled();
        expect(input).toHaveAttribute(
          'title',
          'Use validation repair to resolve duplicate values.',
        );
      }
      for (const button of screen.getAllByRole('button', { name: 'Delete value admin' })) {
        expect(button).toBeDisabled();
      }
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

    it('dispatches add_variant from the typed variant control for an existing object type', () => {
      const { dispatch } = setup(type, [], ['Login', 'Signup']);
      const input = screen.getByLabelText('New variant');
      fireEvent.change(input, { target: { value: 'Signup' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add variant' }));
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'add_variant',
        typeName: 'Event',
        variant: 'Signup',
      });
    });

    it('disables adding a typed variant before its object type exists', () => {
      const { dispatch } = setup(type, [], ['Login']);
      const input = screen.getByLabelText('New variant');
      fireEvent.change(input, { target: { value: 'Signup' } });

      const addVariant = screen.getByRole('button', { name: 'Add variant' });
      expect(addVariant).toBeDisabled();
      expect(addVariant).toHaveAttribute('title', 'Create the object type first.');
      fireEvent.click(addVariant);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it('creates an object variant with the discriminator field', () => {
      const { dispatch } = setup(type);
      const input = screen.getByLabelText('New variant');
      fireEvent.change(input, { target: { value: 'PasswordReset' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create object' }));
      expect(dispatch).toHaveBeenNthCalledWith(1, {
        kind: 'add_type',
        type: {
          kind: 'object',
          name: 'PasswordReset',
          fields: [{ name: 'kind', type: { kind: 'literal', value: 'password-reset' } }],
        },
      });
      expect(dispatch).toHaveBeenNthCalledWith(2, {
        kind: 'add_variant',
        typeName: 'Event',
        variant: 'PasswordReset',
      });
    });

    it('disables creating an object when the typed variant object already exists', () => {
      setup(type, [], ['Login', 'Signup']);
      const input = screen.getByLabelText('New variant');
      fireEvent.change(input, { target: { value: 'Signup' } });

      expect(screen.getByRole('button', { name: 'Add variant' })).toBeEnabled();
      const createObject = screen.getByRole('button', { name: 'Create object' });
      expect(createObject).toBeDisabled();
      expect(createObject).toHaveAttribute(
        'title',
        'Object type already exists. Add it as a variant instead.',
      );
    });

    it('disables creating an object when the typed variant name is used by a non-object type', () => {
      setup(type, [], ['Login'], [], ['Login', 'Status']);
      const input = screen.getByLabelText('New variant');
      fireEvent.change(input, { target: { value: 'Status' } });

      const addVariant = screen.getByRole('button', { name: 'Add variant' });
      expect(addVariant).toBeDisabled();
      expect(addVariant).toHaveAttribute('title', 'Only object types can be added as variants.');
      const createObject = screen.getByRole('button', { name: 'Create object' });
      expect(createObject).toBeDisabled();
      expect(createObject).toHaveAttribute(
        'title',
        'Type name already exists. Choose a new object name.',
      );
    });

    it('disables adding or creating a variant that is already attached', () => {
      setup(type, [], ['Login', 'Signup']);
      const input = screen.getByLabelText('New variant');
      fireEvent.change(input, { target: { value: 'Login' } });

      for (const buttonName of ['Add variant', 'Create object']) {
        const button = screen.getByRole('button', { name: buttonName });
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('title', 'Variant already added.');
      }
    });

    it('dispatches add_variant from available object suggestions', () => {
      const { dispatch } = setup(type, [], ['Login', 'Signup']);
      expect(screen.getByText('Available object types.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Login' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Signup' }));
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'add_variant',
        typeName: 'Event',
        variant: 'Signup',
      });
    });

    it('dispatches remove_variant when a variant is deleted', () => {
      const { dispatch } = setup(type);
      fireEvent.click(screen.getByRole('button', { name: 'Remove variant Login' }));
      expect(dispatch).toHaveBeenCalledWith({
        kind: 'remove_variant',
        typeName: 'Event',
        variant: 'Login',
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
