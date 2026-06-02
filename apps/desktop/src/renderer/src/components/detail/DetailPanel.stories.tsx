import type { FieldDef, Schema, TypeDef } from '@contexture/core/ir';
import type { ModelingHint } from '@contexture/core/modeling-hints';
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import type { Op } from '../../store/ops';
import { FieldDetail } from './FieldDetail';
import { TypeDetail } from './TypeDetail';

const dispatch = fn<(op: Op) => void>();

const tableType: Extract<TypeDef, { kind: 'object' }> = {
  kind: 'object',
  name: 'Booking',
  description: 'Customer reservation record.',
  table: true,
  fields: [
    { name: 'customerId', type: { kind: 'ref', typeName: 'Customer' } },
    { name: 'status', type: { kind: 'string' } },
    { name: 'partySize', type: { kind: 'number', int: true } },
    { name: 'requestedDates', type: { kind: 'array', element: { kind: 'date' } }, optional: true },
  ],
  indexes: [
    { name: 'by_customerId', fields: ['customerId'] },
    { name: 'by_status_requestedDates', fields: ['status', 'requestedDates'] },
  ],
};

const schema: Schema = {
  version: '1',
  types: [
    tableType,
    {
      kind: 'object',
      name: 'Customer',
      fields: [{ name: 'email', type: { kind: 'string', format: 'email' } }],
    },
  ],
};

const hints: ModelingHint[] = [
  {
    id: 'v1:query_handle:Booking:status',
    kind: 'query_handle',
    signals: ['query_pressure'],
    path: 'types.0.fields.1',
    typeName: 'Booking',
    fieldName: 'status',
    title: 'Query handle',
    message: 'This field looks useful for filtering, sorting, indexing, or search.',
    rationale: 'A top-level query handle can preserve common queries.',
    fieldNames: ['status'],
  },
  {
    id: 'v1:possible_entity:Booking:customerId',
    kind: 'possible_entity',
    signals: ['identity_pressure'],
    path: 'types.0',
    typeName: 'Booking',
    title: 'Possible entity',
    message: 'This table carries identity-like relationships.',
    rationale: 'Identity-like fields often become useful handles.',
    fieldNames: ['customerId'],
  },
];

const selectedField: FieldDef = {
  name: 'customerId',
  type: { kind: 'ref', typeName: 'Customer' },
};

function StoryFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark h-[720px] w-[420px] overflow-hidden border border-border bg-background text-foreground">
      {children}
    </div>
  );
}

const meta = {
  title: 'Components/DetailPanel',
  parameters: {
    layout: 'centered',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const TableProperties: Story = {
  render: () => (
    <StoryFrame>
      <TypeDetail
        type={tableType}
        schema={schema}
        dispatch={dispatch}
        modelingHints={hints}
        validationErrors={[]}
        availableTypeNames={['Customer']}
        availableObjectTypeNames={['Customer']}
      />
    </StoryFrame>
  ),
};

export const FieldProperties: Story = {
  render: () => (
    <StoryFrame>
      <FieldDetail
        typeName="Booking"
        field={selectedField}
        dispatch={dispatch}
        modelingHints={hints.filter((hint) => hint.fieldName === 'status')}
        availableTypeNames={['Customer', 'Venue', 'Payment']}
        tableIndexes={tableType.indexes}
        onBackToType={fn()}
      />
    </StoryFrame>
  ),
};
