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

import { derivationKindLabel } from '@contexture/core/derivation';
import {
  type FixtureValueType,
  listFixtureGenerators,
  listFixtureModules,
} from '@contexture/core/fixture-generators';
import type { DerivationPolicy, FieldDef, FieldType, IndexDef } from '@contexture/core/ir';
import type { ModelingHint } from '@contexture/core/modeling-hints';
import { TYPE_NODE_REF_PREVIEW_EVENT } from '@renderer/components/graph/ref-preview-event';
import type { ValidationError } from '@renderer/services/validation';
import { STDLIB_TYPE_OPTIONS, type StdlibTypeOption } from '@shared/stdlib-registry';
import {
  ArrowLeft,
  ChevronDown,
  ChevronsUpDown,
  Lightbulb,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import type React from 'react';
import type { CSSProperties } from 'react';
import { useState } from 'react';
import type { Op } from '../../store/ops';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Field, FieldGroup, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Separator } from '../ui/separator';
import { Textarea } from '../ui/textarea';
import { HintBody } from './ModelShapeHints';
import { type ValidationIssueRepair, ValidationIssues } from './ValidationIssues';

const AUTO_SAMPLE_DATA = '__auto__';

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
  onBackToType?: () => void;
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
  onBackToType,
}: FieldDetailProps) {
  const update = (patch: Partial<FieldDef>) =>
    dispatch({ kind: 'update_field', typeName, fieldName: field.name, patch });
  const hasSingleFieldIndex =
    tableIndexes?.some((index) => index.fields.length === 1 && index.fields[0] === field.name) ??
    false;
  const indexMemberships =
    tableIndexes
      ?.filter((index) => index.fields.includes(field.name))
      .map((index) => ({ index, position: index.fields.indexOf(field.name) })) ?? [];
  const primaryIndex = indexMemberships[0];
  const parentKindLabel = tableIndexes ? 'table' : 'object';
  const sampleLabel = sampleDataLabel(field);
  const addIndex = () => {
    if (!tableIndexes || hasSingleFieldIndex) return;
    dispatch({
      kind: 'add_index',
      typeName,
      index: { name: nextFieldIndexName(tableIndexes, field.name), fields: [field.name] },
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="field-detail">
      <header
        className="flex min-h-20 shrink-0 items-start justify-between gap-3 border-b bg-muted/20 px-3 py-3"
        style={inspectorHeaderStyle(fieldKindColor(field.type))}
        data-testid="field-detail-header"
      >
        <div className="min-w-0 space-y-2">
          <div
            className="truncate text-[11px] font-medium uppercase tracking-wide"
            style={{ color: fieldKindColor(field.type) }}
          >
            {parentKindLabel} / {typeName}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            {onBackToType && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onBackToType}
                className="h-7 shrink-0 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                aria-label="Back to table fields"
              >
                <ArrowLeft aria-hidden="true" className="size-3.5" />
                Fields
              </Button>
            )}
            <h2 className="truncate text-lg font-semibold leading-tight text-foreground">
              {field.name}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className="h-5 rounded-md px-1.5 text-[11px]"
              style={toneSurfaceStyle(fieldKindColor(field.type), 14, 50)}
            >
              {fieldTypeSummary(field.type)}
            </Badge>
            <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[11px]">
              {field.optional ? 'optional' : 'required'}
            </Badge>
            {field.nullable && (
              <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[11px]">
                nullable
              </Badge>
            )}
            {field.serverDerived && !field.derivation && (
              <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[11px]">
                server derived
              </Badge>
            )}
            {field.derivation && (
              <Badge
                variant="outline"
                className="h-5 rounded-md px-1.5 text-[11px]"
                style={toneSurfaceStyle(derivationTone(field.derivation), 14, 50)}
              >
                {derivationKindLabel(field.derivation.kind)}
              </Badge>
            )}
            {primaryIndex && (
              <Badge
                variant="outline"
                className="h-5 rounded-md px-1.5 text-[11px]"
                style={toneSurfaceStyle('var(--inspector-index)', 14, 50)}
              >
                indexed
              </Badge>
            )}
            <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[11px]">
              sample: {sampleLabel}
            </Badge>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Field actions for ${field.name}`}
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <MoreHorizontal aria-hidden="true" className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => dispatch({ kind: 'remove_field', typeName, fieldName: field.name })}
            >
              <Trash2 aria-hidden="true" />
              Delete field
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-3">
          <ValidationIssues errors={validationErrors} repairForIssue={validationRepairForIssue} />

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="field-name">Name</FieldLabel>
              <Input
                id="field-name"
                className="h-8 text-xs"
                defaultValue={field.name}
                onBlur={(ev) => {
                  const next = ev.target.value.trim();
                  if (next && next !== field.name) update({ name: next });
                }}
              />
            </Field>
            <FieldTypeBody
              sourceType={typeName}
              sourceField={field.name}
              fieldType={field.type}
              onChange={(nextType) => update({ type: nextType })}
              availableTypeNames={availableTypeNames}
              onCreateRefTarget={onCreateRefTarget}
              onCreateAndSelectRefTarget={onCreateAndSelectRefTarget}
            />
          </FieldGroup>

          <Separator />

          <PresenceRow field={field} update={update} />
          <DerivationRow field={field} update={update} />
          <DescriptionRow field={field} update={update} />
          <DefaultValueRow field={field} update={update} />

          <Separator />

          {tableIndexes && (
            <IndexSummaryRow
              fieldName={field.name}
              indexes={indexMemberships}
              hasSingleFieldIndex={hasSingleFieldIndex}
              onAddIndex={addIndex}
            />
          )}
          <SampleDataRow field={field} update={update} />
          <ModelAdviceRow
            hints={modelingHints}
            onUseStdlibType={(stdlibTypeName) =>
              update({ type: { kind: 'ref', typeName: stdlibTypeName } })
            }
          />
        </div>
      </div>
    </div>
  );
}

function PresenceRow({
  field,
  update,
}: {
  field: FieldDef;
  update: (patch: Partial<FieldDef>) => void;
}) {
  return (
    <InspectorRow label="Presence">
      <div className="flex flex-wrap justify-end gap-2">
        <CheckboxOption
          id="field-optional"
          label="Optional"
          description="May be omitted"
          checked={field.optional === true}
          onCheckedChange={(v) => update({ optional: v === true })}
        />
        <CheckboxOption
          id="field-nullable"
          label="Nullable"
          description="Allows null"
          checked={field.nullable === true}
          onCheckedChange={(v) => update({ nullable: v === true })}
        />
      </div>
    </InspectorRow>
  );
}

function DerivationRow({
  field,
  update,
}: {
  field: FieldDef;
  update: (patch: Partial<FieldDef>) => void;
}) {
  const derivation = field.derivation;
  const mode = derivation?.kind ?? 'stored';
  const summary = derivationSummary(derivation);
  return (
    <InspectorRow label="Derivation">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="field-derivation-kind">Mode</FieldLabel>
            <Select
              value={mode}
              onValueChange={(value) => {
                if (value === 'stored') {
                  update({ derivation: undefined, serverDerived: undefined });
                  return;
                }
                const kind = value as DerivationPolicy['kind'];
                update({
                  derivation: {
                    ...defaultDerivation(kind),
                    ...derivation,
                    kind,
                  },
                  serverDerived:
                    (derivation?.owner ?? defaultDerivation(kind).owner) === 'backend'
                      ? true
                      : undefined,
                });
              }}
            >
              <SelectTrigger id="field-derivation-kind" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stored">Stored input</SelectItem>
                <SelectItem value="computed">Computed</SelectItem>
                <SelectItem value="cachedHandle">Cached handle</SelectItem>
                <SelectItem value="snapshot">Snapshot</SelectItem>
                <SelectItem value="rollup">Rollup</SelectItem>
                <SelectItem value="estimate">Estimate</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="field-derivation-owner">Owner</FieldLabel>
            <Select
              value={derivation?.owner ?? (field.serverDerived ? 'backend' : 'client')}
              disabled={!derivation}
              onValueChange={(value) => {
                if (!derivation) return;
                const owner = value as NonNullable<DerivationPolicy['owner']>;
                update({
                  derivation: { ...derivation, owner },
                  serverDerived: owner === 'backend' ? true : undefined,
                });
              }}
            >
              <SelectTrigger id="field-derivation-owner" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="backend">Backend only</SelectItem>
                <SelectItem value="client">Client writable</SelectItem>
                <SelectItem value="external">External system</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">{summary}</p>
        {derivation && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="field-derivation-sources">Sources</FieldLabel>
              <Input
                id="field-derivation-sources"
                className="h-8 text-xs"
                placeholder="ingredients[].grams, Ingredient.allergens"
                defaultValue={(derivation.sources ?? []).join(', ')}
                onBlur={(ev) =>
                  update({
                    derivation: {
                      ...derivation,
                      sources: parseSourceList(ev.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="field-derivation-refresh">Refresh</FieldLabel>
              <Select
                value={derivation.refresh ?? 'none'}
                onValueChange={(value) =>
                  update({
                    derivation: {
                      ...derivation,
                      refresh:
                        value === 'none' ? undefined : (value as DerivationPolicy['refresh']),
                    },
                  })
                }
              >
                <SelectTrigger id="field-derivation-refresh" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not declared</SelectItem>
                  <SelectItem value="onWrite">On write</SelectItem>
                  <SelectItem value="asyncJob">Async job</SelectItem>
                  <SelectItem value="onRead">On read</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="frozen">Frozen</SelectItem>
                  <SelectItem value="external">External</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="field-derivation-drift">Drift policy</FieldLabel>
              <Select
                value={derivation.driftPolicy ?? 'none'}
                onValueChange={(value) =>
                  update({
                    derivation: {
                      ...derivation,
                      driftPolicy:
                        value === 'none' ? undefined : (value as DerivationPolicy['driftPolicy']),
                    },
                  })
                }
              >
                <SelectTrigger id="field-derivation-drift" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not declared</SelectItem>
                  <SelectItem value="mustMatch">Must match</SelectItem>
                  <SelectItem value="eventual">Eventually consistent</SelectItem>
                  <SelectItem value="allowed">Allowed</SelectItem>
                  <SelectItem value="warnWhenStale">Warn when stale</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="field-derivation-stale">Stale field</FieldLabel>
              <Input
                id="field-derivation-stale"
                className="h-8 text-xs"
                placeholder="isStale"
                defaultValue={derivation.staleField ?? ''}
                onBlur={(ev) =>
                  update({
                    derivation: { ...derivation, staleField: ev.target.value.trim() || undefined },
                  })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="field-derivation-confidence">Confidence field</FieldLabel>
              <Input
                id="field-derivation-confidence"
                className="h-8 text-xs"
                placeholder="confidence"
                defaultValue={derivation.confidenceField ?? ''}
                onBlur={(ev) =>
                  update({
                    derivation: {
                      ...derivation,
                      confidenceField: ev.target.value.trim() || undefined,
                    },
                  })
                }
              />
            </Field>
          </div>
        )}
      </div>
    </InspectorRow>
  );
}

function DescriptionRow({
  field,
  update,
}: {
  field: FieldDef;
  update: (patch: Partial<FieldDef>) => void;
}) {
  const hasDescription = Boolean(field.description);
  return (
    <Collapsible defaultOpen={hasDescription}>
      <InspectorRow label="Description">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={hasDescription ? 'Edit description' : 'Add description'}
            className="h-7 min-w-0 px-2 text-xs"
          >
            <span className="max-w-64 truncate text-muted-foreground">
              {field.description || 'None'}
            </span>
            <span className="text-foreground">{hasDescription ? 'Edit' : 'Add'}</span>
          </Button>
        </CollapsibleTrigger>
      </InspectorRow>
      <CollapsibleContent className="pt-2">
        <Textarea
          id="field-description"
          aria-label="Description"
          defaultValue={field.description ?? ''}
          rows={2}
          className="text-xs"
          onBlur={(ev) => {
            const next = ev.target.value;
            if (next !== (field.description ?? '')) {
              update({ description: next || undefined });
            }
          }}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

function DefaultValueRow({
  field,
  update,
}: {
  field: FieldDef;
  update: (patch: Partial<FieldDef>) => void;
}) {
  const hasDefault = field.default !== undefined;
  return (
    <Collapsible defaultOpen={hasDefault}>
      <InspectorRow label="Default value">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={hasDefault ? 'Edit default value' : 'Set default value'}
            className="h-7 min-w-0 px-2 text-xs"
          >
            <span className="max-w-64 truncate text-muted-foreground">
              {hasDefault ? defaultInputValue(field.default) : 'None'}
            </span>
            <span className="text-foreground">{hasDefault ? 'Edit' : 'Set'}</span>
          </Button>
        </CollapsibleTrigger>
      </InspectorRow>
      <CollapsibleContent className="pt-2">
        <Input
          id="field-default"
          aria-label="Default value"
          className="h-8 text-xs"
          defaultValue={defaultInputValue(field.default)}
          onBlur={(ev) => {
            const next = parseDefaultInput(ev.target.value, field.type);
            if (!Object.is(next, field.default)) update({ default: next });
          }}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

function IndexSummaryRow({
  fieldName,
  indexes,
  hasSingleFieldIndex,
  onAddIndex,
}: {
  fieldName: string;
  indexes: Array<{ index: IndexDef; position: number }>;
  hasSingleFieldIndex: boolean;
  onAddIndex: () => void;
}) {
  const primary = indexes[0];
  return (
    <InspectorRow label="Index">
      {primary ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs">
              <span className="font-mono text-muted-foreground">{primary.index.name}</span>
              {indexes.length > 1 && (
                <Badge variant="secondary" className="ml-1 h-5 rounded-md px-1.5 text-[10px]">
                  {indexes.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-3 text-xs">
            <div className="space-y-2">
              <div className="font-medium text-foreground">Index usage</div>
              {indexes.map(({ index, position }) => (
                <div key={index.name} className="rounded-md border px-2 py-1.5">
                  <div className="font-mono text-[11px]">{index.name}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {index.fields.length === 1
                      ? 'Single-field index'
                      : `Position ${position + 1} of ${index.fields.length}: ${index.fields.join(
                          ' -> ',
                        )}`}
                  </div>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Not indexed</span>
          {!hasSingleFieldIndex && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              aria-label={`Add index for ${fieldName}`}
              onClick={onAddIndex}
            >
              Add index
            </Button>
          )}
        </div>
      )}
      <span className="sr-only">{fieldName}</span>
    </InspectorRow>
  );
}

function SampleDataRow({
  field,
  update,
}: {
  field: FieldDef;
  update: (patch: Partial<FieldDef>) => void;
}) {
  return (
    <InspectorRow label="Sample data">
      <FieldSampleDataPicker field={field} update={update} />
    </InspectorRow>
  );
}

function ModelAdviceRow({
  hints,
  onUseStdlibType,
}: {
  hints: readonly ModelingHint[];
  onUseStdlibType: (typeName: string) => void;
}) {
  if (hints.length === 0) return null;
  const [primary, ...secondary] = hints;
  if (!primary) return null;
  return (
    <InspectorRow label="Model advice">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Model advice"
            className="h-7 px-2 text-xs"
          >
            <Lightbulb aria-hidden="true" className="size-3.5 text-primary" />
            <span>{primary.title}</span>
            {secondary.length > 0 && (
              <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[10px]">
                {hints.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" side="left" className="w-80 p-3 text-xs">
          <div className="space-y-3">
            <HintBody hint={primary} />
            <HintAction hint={primary} onUseStdlibType={onUseStdlibType} />
            {secondary.length > 0 && (
              <div className="space-y-2 border-t border-border/70 pt-2">
                {secondary.map((hint) => (
                  <div key={hint.id} className="space-y-2">
                    <HintBody hint={hint} compact />
                    <HintAction hint={hint} onUseStdlibType={onUseStdlibType} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </InspectorRow>
  );
}

function HintAction({
  hint,
  onUseStdlibType,
}: {
  hint: ModelingHint;
  onUseStdlibType: (typeName: string) => void;
}) {
  const action = hint.action;
  if (action?.kind !== 'use_stdlib_type') return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 px-2 text-xs"
      onClick={() => onUseStdlibType(action.typeName)}
    >
      Use {action.typeName}
    </Button>
  );
}

function InspectorRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-9 grid-cols-[112px_1fr] items-center gap-3 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="flex min-w-0 justify-end">{children}</div>
    </div>
  );
}

function FieldSampleDataPicker({
  field,
  update,
}: {
  field: FieldDef;
  update: (patch: Partial<FieldDef>) => void;
}) {
  const [open, setOpen] = useState(false);
  const generators = listFixtureGenerators({ valueType: fixtureValueTypeForField(field.type) });
  const modules = listFixtureModules().filter((module) =>
    generators.some((generator) => generator.module === module.id),
  );
  const selectedGenerator = field.sampleData?.generator ?? AUTO_SAMPLE_DATA;
  const selected = generators.find((generator) => generator.id === selectedGenerator);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id="field-sample-data-generator"
          type="button"
          variant="ghost"
          aria-expanded={open}
          className="h-7 min-w-0 px-2 text-xs font-normal"
        >
          <span className="max-w-64 truncate text-muted-foreground">
            {selected ? selected.label : 'Auto'}
          </span>
          <ChevronsUpDown aria-hidden="true" className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <Command>
          <CommandInput placeholder="Find a generator..." />
          <CommandList className="max-h-72">
            <CommandEmpty>No generators found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="auto"
                onSelect={() => {
                  update({ sampleData: undefined });
                  setOpen(false);
                }}
              >
                Auto
              </CommandItem>
            </CommandGroup>
            {modules.map((module) => (
              <CommandGroup key={module.id} heading={module.label}>
                {generators
                  .filter((generator) => generator.module === module.id)
                  .map((generator) => (
                    <CommandItem
                      key={generator.id}
                      value={`${generator.moduleLabel} ${generator.label} ${generator.id}`}
                      onSelect={() => {
                        update({
                          sampleData: { ...field.sampleData, generator: generator.id },
                        });
                        setOpen(false);
                      }}
                    >
                      {generator.label}
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function fixtureValueTypeForField(fieldType: FieldType): FixtureValueType {
  switch (fieldType.kind) {
    case 'string':
    case 'literal':
    case 'ref':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'date';
    case 'array':
      return 'unknown';
  }
}

function fieldTypeSummary(fieldType: FieldType): string {
  if (fieldType.kind === 'array') return `list<${fieldTypeSummary(fieldType.element)}>`;
  if (fieldType.kind === 'ref') return `ref ${fieldType.typeName}`;
  return fieldType.kind;
}

function sampleDataLabel(field: FieldDef): string {
  const generatorId = field.sampleData?.generator;
  if (!generatorId) return 'Auto';
  return (
    listFixtureGenerators({ valueType: fixtureValueTypeForField(field.type) }).find(
      (generator) => generator.id === generatorId,
    )?.label ?? generatorId
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
        <CheckboxOption
          label="List"
          description="Store multiple values"
          checked={fieldType.kind === 'array'}
          onCheckedChange={(checked) => {
            if (checked === true && fieldType.kind !== 'array') {
              onChange({ kind: 'array', element: fieldType });
            } else if (checked !== true && fieldType.kind === 'array') {
              onChange(fieldType.element);
            }
          }}
        />
      )}
      <Row label="type">
        <Select
          value={fieldType.kind}
          onValueChange={(value) => {
            const next = defaultFieldType(value as FieldType['kind'], refTargets, fieldType);
            onChange(next);
          }}
        >
          <SelectTrigger aria-label="Field type" className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="string">string</SelectItem>
            <SelectItem value="number">number</SelectItem>
            <SelectItem value="boolean">boolean</SelectItem>
            <SelectItem value="date">date</SelectItem>
            <SelectItem value="literal">literal</SelectItem>
            <SelectItem value="ref">ref</SelectItem>
            <SelectItem value="array">array</SelectItem>
          </SelectContent>
        </Select>
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
      <Row label="format">
        <Select
          value={value.format ?? 'none'}
          onValueChange={(nextValue) =>
            onChange({
              ...value,
              format: (nextValue === 'none' ? undefined : nextValue) as
                | 'email'
                | 'url'
                | 'uuid'
                | 'datetime'
                | undefined,
            })
          }
        >
          <SelectTrigger
            aria-label="String format"
            data-testid="string-format-select"
            className="h-8 text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">(none)</SelectItem>
            <SelectItem value="email">email</SelectItem>
            <SelectItem value="url">url</SelectItem>
            <SelectItem value="uuid">uuid</SelectItem>
            <SelectItem value="datetime">datetime</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <div className="grid gap-2 sm:grid-cols-2">
        <Label className="space-y-1 text-[11px] text-muted-foreground">
          <span>min</span>
          <Input
            type="number"
            className="h-8 text-xs"
            defaultValue={value.min ?? ''}
            onBlur={(ev) => onChange({ ...value, min: parseOptInt(ev.target.value) })}
          />
        </Label>
        <Label className="space-y-1 text-[11px] text-muted-foreground">
          <span>max</span>
          <Input
            type="number"
            className="h-8 text-xs"
            defaultValue={value.max ?? ''}
            onBlur={(ev) => onChange({ ...value, max: parseOptInt(ev.target.value) })}
          />
        </Label>
      </div>
      <Collapsible defaultOpen={Boolean(value.regex)}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-full justify-between px-2 text-xs"
          >
            Pattern
            <ChevronDown aria-hidden="true" className="size-3.5" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-1">
          <Row label="regex">
            <Input
              className="h-8 text-xs"
              defaultValue={value.regex ?? ''}
              onBlur={(ev) => onChange({ ...value, regex: ev.target.value || undefined })}
            />
          </Row>
        </CollapsibleContent>
      </Collapsible>
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
      <div className="grid gap-2 sm:grid-cols-2">
        <Label className="space-y-1 text-[11px] text-muted-foreground">
          <span>min</span>
          <Input
            type="number"
            className="h-8 text-xs"
            defaultValue={value.min ?? ''}
            onBlur={(ev) => onChange({ ...value, min: parseOptNum(ev.target.value) })}
          />
        </Label>
        <Label className="space-y-1 text-[11px] text-muted-foreground">
          <span>max</span>
          <Input
            type="number"
            className="h-8 text-xs"
            defaultValue={value.max ?? ''}
            onBlur={(ev) => onChange({ ...value, max: parseOptNum(ev.target.value) })}
          />
        </Label>
      </div>
      <CheckboxOption
        id="field-int"
        label="Integer"
        description="No decimals"
        checked={value.int === true}
        onCheckedChange={(v) => onChange({ ...value, int: v === true ? true : undefined })}
      />
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

function CheckboxOption({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id?: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean | 'indeterminate') => void;
}) {
  const checkboxId = id ?? `field-${label.replace(/\s+/gu, '-')}`;
  const labelId = `${checkboxId}-label`;
  const descriptionId = `${checkboxId}-description`;

  return (
    <Label
      htmlFor={checkboxId}
      className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border/70 px-2 text-xs transition-colors hover:border-border hover:bg-muted/30 focus-within:border-ring focus-within:bg-muted/30"
    >
      <Checkbox
        id={checkboxId}
        checked={checked}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        onCheckedChange={onCheckedChange}
        className="size-3.5"
      />
      <span className="min-w-0">
        <span id={labelId} className="block leading-none">
          {label}
        </span>
        <p id={descriptionId} className="sr-only">
          {description}
        </p>
      </span>
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

function defaultDerivation(kind: DerivationPolicy['kind']): DerivationPolicy {
  switch (kind) {
    case 'computed':
    case 'cachedHandle':
    case 'rollup':
    case 'estimate':
      return { kind, owner: 'backend' };
    case 'snapshot':
      return { kind, owner: 'backend', refresh: 'frozen', driftPolicy: 'allowed' };
  }
}

function derivationSummary(derivation: DerivationPolicy | undefined): string {
  if (!derivation) return 'Stored directly. No derivation policy.';
  switch (derivation.kind) {
    case 'computed':
      return 'Computed from source fields. Recompute when sources change.';
    case 'cachedHandle':
      return 'Stored for querying over embedded or resolved data.';
    case 'snapshot':
      return 'Copied at write time. Does not update automatically.';
    case 'rollup':
      return 'Aggregated from related records. Needs a refresh policy.';
    case 'estimate':
      return 'Derived with uncertainty. Track confidence or coverage.';
  }
}

function parseSourceList(value: string): string[] | undefined {
  const sources = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return sources.length > 0 ? sources : undefined;
}

function derivationTone(derivation: DerivationPolicy): string {
  if (
    derivation.kind !== 'snapshot' &&
    (derivation.sources?.length ?? 0) > 0 &&
    !derivation.refresh &&
    !derivation.driftPolicy
  ) {
    return 'var(--warning)';
  }
  return derivation.kind === 'snapshot' ? 'var(--success)' : 'var(--inspector-advisory)';
}

function fieldKindColor(fieldType: FieldType): string {
  switch (fieldType.kind) {
    case 'string':
      return 'var(--inspector-field-string)';
    case 'number':
      return 'var(--inspector-field-number)';
    case 'boolean':
      return 'var(--inspector-field-boolean)';
    case 'date':
      return 'var(--inspector-field-date)';
    case 'literal':
      return 'var(--inspector-field-literal)';
    case 'ref':
      return 'var(--inspector-field-ref)';
    case 'array':
      return 'var(--inspector-field-array)';
  }
}

function inspectorHeaderStyle(color: string): CSSProperties {
  return {
    background: 'var(--background)',
    borderColor: `color-mix(in oklch, ${color} 34%, var(--border))`,
    boxShadow: `inset 0 -2px 0 color-mix(in oklch, ${color} 24%, transparent)`,
  };
}

function toneSurfaceStyle(color: string, background = 12, border = 44): CSSProperties {
  return {
    background: `color-mix(in oklch, ${color} ${background}%, transparent)`,
    borderColor: `color-mix(in oklch, ${color} ${border}%, var(--border))`,
    color: `color-mix(in oklch, ${color} 78%, var(--foreground))`,
  };
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
