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
import type { FieldDef, FieldType, IndexDef } from '@contexture/core/ir';
import type { ModelingHint } from '@contexture/core/modeling-hints';
import { TYPE_NODE_REF_PREVIEW_EVENT } from '@renderer/components/graph/ref-preview-event';
import type { ValidationError } from '@renderer/services/validation';
import { STDLIB_TYPE_OPTIONS, type StdlibTypeOption } from '@shared/stdlib-registry';
import { ChevronsUpDown, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Op } from '../../store/ops';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Textarea } from '../ui/textarea';
import { ModelShapeHints } from './ModelShapeHints';
import { type ValidationIssueRepair, ValidationIssues } from './ValidationIssues';

export interface FieldDetailProps {
  typeName: string;
  field: FieldDef;
  dispatch: (op: Op) => void;
  modelingHints?: readonly ModelingHint[];
  validationErrors?: readonly ValidationError[];
  validationRepairForIssue?: (error: ValidationError) => ValidationIssueRepair | null;
  availableTypeNames?: readonly string[];
  tableIndexes?: readonly IndexDef[];
  onCreateRefTarget?: () => string | undefined;
  onCreateAndSelectRefTarget?: (selectTarget: (typeName: string) => void) => void;
}

export function FieldDetail({
  typeName,
  field,
  dispatch,
  modelingHints = [],
  validationErrors = [],
  validationRepairForIssue,
  availableTypeNames = [],
  tableIndexes,
  onCreateRefTarget,
  onCreateAndSelectRefTarget,
}: FieldDetailProps) {
  const update = (patch: Partial<FieldDef>) =>
    dispatch({ kind: 'update_field', typeName, fieldName: field.name, patch });
  const hasSingleFieldIndex =
    tableIndexes?.some((index) => index.fields.length === 1 && index.fields[0] === field.name) ??
    false;
  const addIndex = () => {
    if (!tableIndexes || hasSingleFieldIndex) return;
    dispatch({
      kind: 'add_index',
      typeName,
      index: { name: nextFieldIndexName(tableIndexes, field.name), fields: [field.name] },
    });
  };

  return (
    <div className="space-y-4 p-3" data-testid="field-detail">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{field.name}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{field.type.kind}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Delete field ${field.name}`}
            onClick={() => dispatch({ kind: 'remove_field', typeName, fieldName: field.name })}
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>

      <ValidationIssues errors={validationErrors} repairForIssue={validationRepairForIssue} />

      <div className="space-y-1">
        <Label htmlFor="field-name">Name</Label>
        <Input
          id="field-name"
          defaultValue={field.name}
          onBlur={(ev) => {
            const next = ev.target.value.trim();
            if (next && next !== field.name) update({ name: next });
          }}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="field-default">Default value</Label>
        <Input
          id="field-default"
          defaultValue={defaultInputValue(field.default)}
          onBlur={(ev) => {
            const next = parseDefaultInput(ev.target.value, field.type);
            if (!Object.is(next, field.default)) update({ default: next });
          }}
        />
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
        <Label htmlFor="field-server-derived" className="flex items-center gap-1">
          <Checkbox
            id="field-server-derived"
            checked={field.serverDerived === true}
            onCheckedChange={(v) => update({ serverDerived: v === true ? true : undefined })}
          />
          server derived
        </Label>
      </div>

      {tableIndexes && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-xs">
          <span className="font-medium">Index</span>
          {hasSingleFieldIndex ? (
            <span className="text-muted-foreground">Indexed</span>
          ) : (
            <Button type="button" variant="outline" size="sm" className="h-7" onClick={addIndex}>
              Add index
            </Button>
          )}
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="field-description">Description</Label>
        <Textarea
          id="field-description"
          defaultValue={field.description ?? ''}
          rows={2}
          onBlur={(ev) => {
            const next = ev.target.value;
            if (next !== (field.description ?? '')) update({ description: next || undefined });
          }}
        />
      </div>

      <FieldTypeBody
        sourceType={typeName}
        sourceField={field.name}
        fieldType={field.type}
        onChange={(nextType) => update({ type: nextType })}
        availableTypeNames={availableTypeNames}
        onCreateRefTarget={onCreateRefTarget}
        onCreateAndSelectRefTarget={onCreateAndSelectRefTarget}
      />
      <ModelShapeHints hints={modelingHints} />
    </div>
  );
}

/**
 * Exported so tests can exercise each variant directly without
 * reconstructing the enclosing `update_field` op plumbing.
 */
export function FieldTypeBody({
  sourceType,
  sourceField,
  fieldType,
  onChange,
  availableTypeNames = [],
  onCreateRefTarget,
  onCreateAndSelectRefTarget,
  allowListToggle = true,
}: {
  sourceType: string;
  sourceField: string;
  fieldType: FieldType;
  onChange: (next: FieldType) => void;
  availableTypeNames?: readonly string[];
  onCreateRefTarget?: () => string | undefined;
  onCreateAndSelectRefTarget?: (selectTarget: (typeName: string) => void) => void;
  allowListToggle?: boolean;
}) {
  const refTargets = refTargetOptions(availableTypeNames);
  return (
    <div className="space-y-3">
      {allowListToggle && (
        <Label className="flex items-center gap-1 text-xs">
          <Checkbox
            checked={fieldType.kind === 'array'}
            onCheckedChange={(checked) => {
              if (checked === true && fieldType.kind !== 'array') {
                onChange({ kind: 'array', element: fieldType });
              } else if (checked !== true && fieldType.kind === 'array') {
                onChange(fieldType.element);
              }
            }}
          />
          list
        </Label>
      )}
      <Row label="type">
        <select
          value={fieldType.kind}
          aria-label="Field type"
          onChange={(ev) => {
            const next = defaultFieldType(
              ev.target.value as FieldType['kind'],
              refTargets,
              fieldType,
            );
            onChange(next);
          }}
          className="w-full rounded border border-border bg-background p-1"
        >
          <option value="string">string</option>
          <option value="number">number</option>
          <option value="boolean">boolean</option>
          <option value="date">date</option>
          <option value="literal">literal</option>
          <option value="ref">ref</option>
          <option value="array">array</option>
        </select>
      </Row>
      {fieldTypeBody(
        fieldType,
        onChange,
        refTargets,
        sourceType,
        sourceField,
        onCreateRefTarget,
        onCreateAndSelectRefTarget,
      )}
    </div>
  );
}

function fieldTypeBody(
  fieldType: FieldType,
  onChange: (next: FieldType) => void,
  refTargets: RefTargetOptions,
  sourceType: string,
  sourceField: string,
  onCreateRefTarget: (() => string | undefined) | undefined,
  onCreateAndSelectRefTarget: ((selectTarget: (typeName: string) => void) => void) | undefined,
): React.ReactNode {
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
      return (
        <RefBody
          value={fieldType}
          onChange={onChange}
          refTargets={refTargets}
          sourceType={sourceType}
          sourceField={sourceField}
          onCreateRefTarget={onCreateRefTarget}
          onCreateAndSelectRefTarget={onCreateAndSelectRefTarget}
        />
      );
    case 'array':
      return (
        <ArrayBody
          value={fieldType}
          onChange={onChange}
          refTargets={refTargets}
          sourceType={sourceType}
          sourceField={sourceField}
          onCreateRefTarget={onCreateRefTarget}
          onCreateAndSelectRefTarget={onCreateAndSelectRefTarget}
        />
      );
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
  refTargets,
  sourceType,
  sourceField,
  onCreateRefTarget,
  onCreateAndSelectRefTarget,
}: {
  value: Extract<FieldType, { kind: 'ref' }>;
  onChange: (next: FieldType) => void;
  refTargets: RefTargetOptions;
  sourceType: string;
  sourceField: string;
  onCreateRefTarget?: () => string | undefined;
  onCreateAndSelectRefTarget?: (selectTarget: (typeName: string) => void) => void;
}) {
  const hasKnownCurrent = refTargets.all.some((target) => target.value === value.typeName);
  if (refTargets.all.length > 0) {
    return (
      <Row label="target">
        <RefTargetPicker
          sourceType={sourceType}
          sourceField={sourceField}
          value={value.typeName}
          unknownCurrent={hasKnownCurrent ? undefined : value.typeName}
          refTargets={refTargets}
          onSelect={(typeName) => onChange({ kind: 'ref', typeName })}
          onCreateRefTarget={onCreateRefTarget}
          onCreateAndSelectRefTarget={onCreateAndSelectRefTarget}
        />
      </Row>
    );
  }

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

function RefTargetPicker({
  sourceType,
  sourceField,
  value,
  unknownCurrent,
  refTargets,
  onSelect,
  onCreateRefTarget,
  onCreateAndSelectRefTarget,
}: {
  sourceType: string;
  sourceField: string;
  value: string;
  unknownCurrent?: string;
  refTargets: RefTargetOptions;
  onSelect: (typeName: string) => void;
  onCreateRefTarget?: () => string | undefined;
  onCreateAndSelectRefTarget?: (selectTarget: (typeName: string) => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedTarget = refTargets.all.find((target) => target.value === value);
  const currentLabel = selectedTarget?.label ?? value;

  const select = (typeName: string) => {
    onSelect(typeName);
    setOpen(false);
  };
  const createAndSelect = () => {
    if (onCreateAndSelectRefTarget) {
      onCreateAndSelectRefTarget(() => setOpen(false));
      return;
    }
    const typeName = onCreateRefTarget?.();
    if (typeName) select(typeName);
  };
  const preview = (targetType: string, active: boolean) => {
    document.dispatchEvent(
      new CustomEvent(TYPE_NODE_REF_PREVIEW_EVENT, {
        detail: { sourceType, sourceField, targetType, active },
      }),
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label="target"
          aria-expanded={open}
          className="h-8 w-full justify-between px-2 text-left text-xs font-normal"
        >
          <span className="truncate">{currentLabel}</span>
          <ChevronsUpDown aria-hidden="true" className="ml-2 h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Find a type..." />
          <CommandList>
            <CommandEmpty>No matching types.</CommandEmpty>
            {unknownCurrent && (
              <CommandGroup heading="Current target">
                <CommandItem value={unknownCurrent} onSelect={() => select(unknownCurrent)}>
                  {unknownCurrent}
                </CommandItem>
              </CommandGroup>
            )}
            {refTargets.local.length > 0 && (
              <CommandGroup heading="Model types">
                {refTargets.local.map((target) => (
                  <CommandItem
                    key={target.value}
                    value={`${target.value} ${target.label}`}
                    onSelect={() => select(target.value)}
                    onMouseEnter={() => preview(target.value, true)}
                    onMouseLeave={() => preview(target.value, false)}
                    onFocus={() => preview(target.value, true)}
                    onBlur={() => preview(target.value, false)}
                  >
                    {target.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {refTargets.stdlibByNamespace.map((group) => (
              <CommandGroup key={group.namespace} heading={group.namespace}>
                {group.options.map((target) => (
                  <CommandItem
                    key={target.value}
                    value={`${target.value} ${target.label}`}
                    onSelect={() => select(target.value)}
                  >
                    <RefTargetOptionLabel target={target} />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        {onCreateRefTarget && (
          <div className="border-t p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={createAndSelect}
              className="h-8 w-full justify-start px-2 text-xs"
            >
              Create object target
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function RefTargetOptionLabel({ target }: { target: RefTarget }) {
  if (!target.description && !target.example) return <>{target.label}</>;
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate">{target.label}</span>
      {target.example && (
        <span className="truncate text-[10px] text-muted-foreground">
          Example: <code>{target.example}</code>
        </span>
      )}
    </span>
  );
}

function ArrayBody({
  value,
  onChange,
  refTargets,
  sourceType,
  sourceField,
  onCreateRefTarget,
  onCreateAndSelectRefTarget,
}: {
  value: Extract<FieldType, { kind: 'array' }>;
  onChange: (next: FieldType) => void;
  refTargets: RefTargetOptions;
  sourceType: string;
  sourceField: string;
  onCreateRefTarget?: () => string | undefined;
  onCreateAndSelectRefTarget?: (selectTarget: (typeName: string) => void) => void;
}) {
  return (
    <div className="space-y-2 border-l border-border pl-2">
      <span className="text-[10px] uppercase text-muted-foreground">Array element</span>
      <FieldTypeBody
        sourceType={sourceType}
        sourceField={sourceField}
        fieldType={value.element}
        onChange={(el) => onChange({ ...value, element: el })}
        availableTypeNames={refTargets.local.map((target) => target.value)}
        onCreateRefTarget={onCreateRefTarget}
        onCreateAndSelectRefTarget={onCreateAndSelectRefTarget}
        allowListToggle={false}
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

function defaultFieldType(
  kind: FieldType['kind'],
  refTargets: RefTargetOptions,
  previous: FieldType,
): FieldType {
  switch (kind) {
    case 'string':
      return { kind: 'string' };
    case 'number':
      return { kind: 'number' };
    case 'boolean':
      return { kind: 'boolean' };
    case 'date':
      return { kind: 'date' };
    case 'literal':
      return { kind: 'literal', value: 'value' };
    case 'ref':
      return {
        kind: 'ref',
        typeName:
          previous.kind === 'ref'
            ? previous.typeName
            : (refTargets.all[0]?.value ?? 'common.Email'),
      };
    case 'array':
      return {
        kind: 'array',
        element: previous.kind === 'array' ? previous.element : { kind: 'string' },
      };
  }
}

interface RefTarget {
  value: string;
  label: string;
  description?: string;
  example?: string;
}

interface RefTargetOptions {
  local: RefTarget[];
  stdlibByNamespace: Array<{ namespace: string; options: RefTarget[] }>;
  all: RefTarget[];
}

function refTargetOptions(availableTypeNames: readonly string[]): RefTargetOptions {
  const local = availableTypeNames.map((typeName) => ({ value: typeName, label: typeName }));
  const stdlibByNamespace = groupStdlibOptions(STDLIB_TYPE_OPTIONS);
  return {
    local,
    stdlibByNamespace,
    all: [...local, ...stdlibByNamespace.flatMap((group) => group.options)],
  };
}

function groupStdlibOptions(
  options: readonly StdlibTypeOption[],
): Array<{ namespace: string; options: RefTarget[] }> {
  const byNamespace = new Map<string, RefTarget[]>();
  for (const option of options) {
    const entries = byNamespace.get(option.namespace) ?? [];
    entries.push({
      value: option.qualifiedName,
      label: option.description ? `${option.name} - ${option.description}` : option.name,
      description: option.description,
      example: option.example,
    });
    byNamespace.set(option.namespace, entries);
  }
  return Array.from(byNamespace, ([namespace, options]) => ({ namespace, options }));
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

function defaultInputValue(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function parseDefaultInput(value: string, fieldType: FieldType): unknown {
  if (value === '') return undefined;
  switch (fieldType.kind) {
    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'boolean':
      if (value === 'true') return true;
      if (value === 'false') return false;
      return undefined;
    case 'literal':
      return coerceLiteral(value);
    case 'array':
      try {
        return JSON.parse(value);
      } catch {
        return undefined;
      }
    case 'string':
    case 'date':
    case 'ref':
      return value;
  }
}

function nextFieldIndexName(indexes: readonly IndexDef[], fieldName: string): string {
  const taken = new Set(indexes.map((index) => index.name));
  const base = `by_${fieldName}`;
  if (!taken.has(base)) return base;
  for (let i = 2; i <= taken.size + 2; i++) {
    const candidate = `${base}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}${taken.size + 1}`;
}
