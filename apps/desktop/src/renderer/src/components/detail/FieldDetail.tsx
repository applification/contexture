/**
 * FieldDetail — kind-dispatched detail view for a selected field.
 *
 * Routes on `FieldType.kind` (8 variants) so every kind exposes the
 * constraints it actually supports, and nothing it doesn't. A boolean
 * field has no min/max; a string field has regex + format; an array
 * recurses into its element kind so the constraints pertain to the
 * inner type (not the wrapping array — that gets its own min/max).
 *
 * Every edit dispatches `update_field` through the shared op vocabulary;
 * nothing here mutates the store directly.
 */
import type { FieldDef, FieldType } from '../../model/types';
import type { Op } from '../../store/ops';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

export interface FieldDetailProps {
  typeName: string;
  field: FieldDef;
  dispatch: (op: Op) => void;
}

export function FieldDetail({ typeName, field, dispatch }: FieldDetailProps) {
  const update = (patch: Partial<FieldDef>) =>
    dispatch({ kind: 'update_field', typeName, fieldName: field.name, patch });

  return (
    <div className="space-y-4 p-3" data-testid="field-detail">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{field.name}</span>
        <span className="text-xs text-muted-foreground">{field.type.kind}</span>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <Label htmlFor="field-optional" className="flex items-center gap-1">
          <Checkbox
            id="field-optional"
            checked={field.optional === true}
            onCheckedChange={(v) => update({ optional: v === true })}
          />
          optional
        </Label>
        <Label htmlFor="field-nullable" className="flex items-center gap-1">
          <Checkbox
            id="field-nullable"
            checked={field.nullable === true}
            onCheckedChange={(v) => update({ nullable: v === true })}
          />
          nullable
        </Label>
      </div>

      <FieldTypeBody fieldType={field.type} onChange={(nextType) => update({ type: nextType })} />
    </div>
  );
}

/**
 * Exported so tests can exercise each variant directly without
 * reconstructing the enclosing `update_field` op plumbing.
 */
export function FieldTypeBody({
  fieldType,
  onChange,
}: {
  fieldType: FieldType;
  onChange: (next: FieldType) => void;
}) {
  switch (fieldType.kind) {
    case 'string':
      return <StringBody value={fieldType} onChange={onChange} />;
    case 'number':
      return <NumberBody value={fieldType} onChange={onChange} />;
    case 'boolean':
    case 'date':
      return (
        <p className="text-xs text-muted-foreground">No additional constraints for this kind.</p>
      );
    case 'literal':
      return <LiteralBody value={fieldType} onChange={onChange} />;
    case 'ref':
      return <RefBody value={fieldType} onChange={onChange} />;
    case 'array':
      return <ArrayBody value={fieldType} onChange={onChange} />;
  }
}

function StringBody({
  value,
  onChange,
}: {
  value: Extract<FieldType, { kind: 'string' }>;
  onChange: (next: FieldType) => void;
}) {
  return (
    <div className="space-y-2 text-xs">
      <Row label="min">
        <Input
          type="number"
          defaultValue={value.min ?? ''}
          onBlur={(ev) => onChange({ ...value, min: parseOptInt(ev.target.value) })}
        />
      </Row>
      <Row label="max">
        <Input
          type="number"
          defaultValue={value.max ?? ''}
          onBlur={(ev) => onChange({ ...value, max: parseOptInt(ev.target.value) })}
        />
      </Row>
      <Row label="regex">
        <Input
          defaultValue={value.regex ?? ''}
          onBlur={(ev) => onChange({ ...value, regex: ev.target.value || undefined })}
        />
      </Row>
      <Row label="format">
        <select
          defaultValue={value.format ?? ''}
          onChange={(ev) =>
            onChange({
              ...value,
              format: (ev.target.value || undefined) as
                | 'email'
                | 'url'
                | 'uuid'
                | 'datetime'
                | undefined,
            })
          }
          data-testid="string-format-select"
          className="w-full rounded border border-border bg-background p-1"
        >
          <option value="">(none)</option>
          <option value="email">email</option>
          <option value="url">url</option>
          <option value="uuid">uuid</option>
          <option value="datetime">datetime</option>
        </select>
      </Row>
    </div>
  );
}

function NumberBody({
  value,
  onChange,
}: {
  value: Extract<FieldType, { kind: 'number' }>;
  onChange: (next: FieldType) => void;
}) {
  return (
    <div className="space-y-2 text-xs">
      <Row label="min">
        <Input
          type="number"
          defaultValue={value.min ?? ''}
          onBlur={(ev) => onChange({ ...value, min: parseOptNum(ev.target.value) })}
        />
      </Row>
      <Row label="max">
        <Input
          type="number"
          defaultValue={value.max ?? ''}
          onBlur={(ev) => onChange({ ...value, max: parseOptNum(ev.target.value) })}
        />
      </Row>
      <Label htmlFor="field-int" className="flex items-center gap-1">
        <Checkbox
          id="field-int"
          checked={value.int === true}
          onCheckedChange={(v) => onChange({ ...value, int: v === true ? true : undefined })}
        />
        integer
      </Label>
    </div>
  );
}

function LiteralBody({
  value,
  onChange,
}: {
  value: Extract<FieldType, { kind: 'literal' }>;
  onChange: (next: FieldType) => void;
}) {
  return (
    <Row label="value">
      <Input
        defaultValue={String(value.value)}
        onBlur={(ev) => onChange({ kind: 'literal', value: coerceLiteral(ev.target.value) })}
      />
    </Row>
  );
}

function RefBody({
  value,
  onChange,
}: {
  value: Extract<FieldType, { kind: 'ref' }>;
  onChange: (next: FieldType) => void;
}) {
  return (
    <Row label="target">
      <Input
        defaultValue={value.typeName}
        onBlur={(ev) => {
          const next = ev.target.value.trim();
          if (next && next !== value.typeName) onChange({ kind: 'ref', typeName: next });
        }}
      />
    </Row>
  );
}

function ArrayBody({
  value,
  onChange,
}: {
  value: Extract<FieldType, { kind: 'array' }>;
  onChange: (next: FieldType) => void;
}) {
  return (
    <div className="space-y-2 border-l border-border pl-2">
      <span className="text-[10px] uppercase text-muted-foreground">Array element</span>
      <FieldTypeBody
        fieldType={value.element}
        onChange={(el) => onChange({ ...value, element: el })}
      />
      <Row label="min items">
        <Input
          type="number"
          defaultValue={value.min ?? ''}
          onBlur={(ev) => onChange({ ...value, min: parseOptInt(ev.target.value) })}
        />
      </Row>
      <Row label="max items">
        <Input
          type="number"
          defaultValue={value.max ?? ''}
          onBlur={(ev) => onChange({ ...value, max: parseOptInt(ev.target.value) })}
        />
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  // Wrap the label around its control so `getByLabelText` in tests and
  // click-to-focus for users both work without juggling `htmlFor` ids.
  return (
    <Label className="grid grid-cols-[80px_1fr] items-center gap-2 text-[11px] text-muted-foreground">
      <span>{label}</span>
      {children}
    </Label>
  );
}

function parseOptInt(s: string): number | undefined {
  if (s === '') return undefined;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseOptNum(s: string): number | undefined {
  if (s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function coerceLiteral(s: string): string | number | boolean {
  if (s === 'true') return true;
  if (s === 'false') return false;
  const n = Number(s);
  if (s !== '' && Number.isFinite(n)) return n;
  return s;
}
