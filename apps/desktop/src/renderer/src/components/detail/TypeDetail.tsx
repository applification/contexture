/**
 * TypeDetail — kind-dispatched detail view for a selected `TypeDef`.
 *
 * Each `TypeDef.kind` gets a purpose-built form:
 *   - `object`: name, description, field list
 *   - `enum`: name, description, value list
 *   - `discriminatedUnion`: name, description, discriminator field,
 *     variant type names
 *   - `raw`: name, description, Zod expression (editable)
 *
 * Every mutation dispatches an op through the app's undoable store so
 * direct edits interleave cleanly with chat-driven ops. Edits fire on
 * `blur` (not `change`) to avoid a history entry per keystroke.
 */

import { derivationKindLabel } from '@contexture/core/derivation';
import { listFixtureModules } from '@contexture/core/fixture-generators';
import type {
  FieldDef,
  FieldType,
  IndexDef,
  ObjectInvariant,
  Schema,
  TypeDef,
} from '@contexture/core/ir';
import type { ModelingHint } from '@contexture/core/modeling-hints';
import type { TypeUpdatePatch } from '@contexture/core/ops';
import type { ValidationError } from '@renderer/services/validation';
import { useChatComposerStore } from '@renderer/store/chat-composer';
import { usePlaygroundStore } from '@renderer/store/playground';
import { useGraphSelectionStore } from '@renderer/store/selection';
import { useUIChromeStore } from '@renderer/store/ui-chrome';
import {
  ChevronDown,
  ChevronUp,
  GitBranch,
  Hash,
  Lightbulb,
  MessageSquare,
  Play,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { type CSSProperties, useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Op } from '../../store/ops';
import { nextFieldName } from '../graph/interactions';
import { ScopedPlaygroundWorkbench } from '../playground/PlaygroundPanel';
import { Button } from '../ui/button';
import { ButtonGroup } from '../ui/button-group';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Textarea } from '../ui/textarea';
import { HintBody, ModelShapeHints } from './ModelShapeHints';
import { type ValidationIssueRepair, ValidationIssues } from './ValidationIssues';

const CONVEX_RESERVED_PREFIX_MSG = "Convex reserves names starting with '_'";
export const FOCUS_TYPE_NAME_EVENT = 'contexture:focus-type-name';
const AUTO_SAMPLE_DATA = '__auto__';
const EMPTY_TABLE_RECORDS: readonly unknown[] = [];

function isConvexReservedName(name: string): boolean {
  return name.startsWith('_');
}

function selectFieldFromValidationIssue(type: TypeDef, error: ValidationError): void {
  if (type.kind !== 'object') return;
  const match = error.path.match(/\.fields\.(\d+)/u);
  if (!match) return;
  const field = type.fields[Number(match[1])];
  if (!field) return;
  useGraphSelectionStore.getState().selectField({ typeName: type.name, fieldName: field.name });
}

export interface TypeDetailProps {
  type: TypeDef;
  schema?: Schema;
  /** Dispatch an op. In production this is `useUndoStore.getState().apply`. */
  dispatch: (op: Op) => void;
  /** Dispatch a multi-op user action as one undoable edit. */
  dispatchBatch?: (ops: readonly Op[]) => void;
  modelingHints?: readonly ModelingHint[];
  validationErrors?: readonly ValidationError[];
  validationRepairForIssue?: (error: ValidationError) => ValidationIssueRepair | null;
  availableTypeNames?: readonly string[];
  availableObjectTypeNames?: readonly string[];
}

export function TypeDetail({
  type,
  schema,
  dispatch,
  dispatchBatch,
  modelingHints = [],
  validationErrors = [],
  validationRepairForIssue,
  availableTypeNames = [],
  availableObjectTypeNames = [],
}: TypeDetailProps) {
  const isTable = type.kind === 'object' && type.table === true;
  const nameReserved = isTable && isConvexReservedName(type.name);
  const recordsByType = usePlaygroundStore((state) => state.recordsByType);
  const tableRecords = isTable
    ? (recordsByType[type.name] ?? EMPTY_TABLE_RECORDS)
    : EMPTY_TABLE_RECORDS;

  if (isTable && type.kind === 'object') {
    return (
      <TableTypeDetail
        type={type}
        schema={schema}
        dispatch={dispatch}
        modelingHints={modelingHints}
        validationErrors={validationErrors}
        validationRepairForIssue={validationRepairForIssue}
        recordsCount={tableRecords.length}
        reserved={nameReserved}
      />
    );
  }

  return (
    <div className="space-y-4 p-3 pt-0">
      <header
        className="-mx-3 flex min-h-20 items-center justify-between border-b bg-muted/20 px-3 py-3"
        style={inspectorHeaderStyle(inspectorTypeColor(type))}
        data-testid="type-detail-header"
      >
        <div className="min-w-0">
          <div
            className="truncate text-[11px] font-medium uppercase tracking-wide"
            style={{ color: inspectorTypeColor(type) }}
          >
            {isTable ? 'table' : type.kind}
          </div>
          <h2 className="truncate text-lg font-semibold leading-tight text-foreground">
            {type.name}
          </h2>
          <div
            aria-hidden="true"
            className="h-[1.25rem] truncate text-sm font-medium leading-snug text-muted-foreground"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Delete type ${type.name}`}
            onClick={() => dispatch({ kind: 'delete_type', name: type.name })}
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </header>

      <ValidationIssues
        errors={validationErrors}
        onIssueClick={(error) => selectFieldFromValidationIssue(type, error)}
        repairForIssue={validationRepairForIssue}
      />
      <NameField type={type} dispatch={dispatch} reserved={nameReserved} />
      <DescriptionField type={type} dispatch={dispatch} />
      <ModelShapeHints hints={modelingHints} />

      {type.kind === 'object' && <ObjectBody type={type} schema={schema} dispatch={dispatch} />}
      <SampleDataSection type={type} dispatch={dispatch} />
      {type.kind === 'object' && (
        <ConvexSection type={type} dispatch={dispatch} validationErrors={validationErrors} />
      )}
      {type.kind === 'enum' && <EnumBody type={type} dispatch={dispatch} />}
      {type.kind === 'discriminatedUnion' && (
        <DiscriminatedUnionBody
          type={type}
          dispatch={dispatch}
          dispatchBatch={dispatchBatch}
          availableTypeNames={availableTypeNames}
          availableObjectTypeNames={availableObjectTypeNames}
        />
      )}
      {type.kind === 'raw' && <RawBody type={type} dispatch={dispatch} />}
    </div>
  );
}

function TableTypeDetail({
  type,
  schema,
  dispatch,
  modelingHints,
  validationErrors,
  validationRepairForIssue,
  recordsCount,
  reserved,
}: {
  type: Extract<TypeDef, { kind: 'object' }>;
  schema?: Schema;
  dispatch: (op: Op) => void;
  modelingHints: readonly ModelingHint[];
  validationErrors: readonly ValidationError[];
  validationRepairForIssue?: (error: ValidationError) => ValidationIssueRepair | null;
  recordsCount: number;
  reserved: boolean;
}) {
  const defaultMode = recordsCount > 0 ? 'try' : 'shape';
  const { tableHints, fieldHintsByName } = useMemo(
    () => splitTableModelingHints(modelingHints),
    [modelingHints],
  );
  const fieldHintCount = Array.from(fieldHintsByName.values()).reduce(
    (sum, hints) => sum + hints.length,
    0,
  );
  const fieldIndexInsights = useMemo(() => fieldIndexInsightsForType(type), [type]);
  const indexCount = type.indexes?.length ?? 0;
  const suggestionCount = suggestedIndexes(type).length;

  return (
    <Tabs key={type.name} defaultValue={defaultMode} className="flex h-full min-h-0 flex-col">
      <header
        className="flex min-h-20 shrink-0 items-center justify-between border-b bg-muted/20 px-3 py-3"
        style={inspectorHeaderStyle('var(--inspector-type-table)')}
        data-testid="type-detail-header"
      >
        <div className="min-w-0">
          <div
            className="truncate text-[11px] font-medium uppercase tracking-wide"
            style={{ color: 'var(--inspector-type-table)' }}
          >
            table
          </div>
          <h2 className="truncate text-lg font-semibold leading-tight text-foreground">
            {type.name}
          </h2>
          <div className="mt-2">
            <TabsList asChild>
              <ButtonGroup aria-label="Table inspector mode">
                <TabsTrigger
                  value="shape"
                  className="h-8 gap-1.5 rounded-none border-0 px-3 text-xs first:rounded-l-md last:rounded-r-md data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  <SlidersHorizontal aria-hidden="true" className="size-3.5" />
                  Shape
                </TabsTrigger>
                <TabsTrigger
                  value="try"
                  className="h-8 gap-1.5 rounded-none border-0 px-3 text-xs first:rounded-l-md last:rounded-r-md data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  <Play aria-hidden="true" className="size-3.5" />
                  Try
                </TabsTrigger>
              </ButtonGroup>
            </TabsList>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Delete type ${type.name}`}
          onClick={() => dispatch({ kind: 'delete_type', name: type.name })}
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </header>

      <TabsContent value="shape" className="m-0 min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-4">
          <ValidationIssues
            errors={validationErrors}
            onIssueClick={(error) => selectFieldFromValidationIssue(type, error)}
            repairForIssue={validationRepairForIssue}
          />
          <NameField type={type} dispatch={dispatch} reserved={reserved} />
          <DescriptionField type={type} dispatch={dispatch} />
          <TableModelingAdvisoryStrip hints={tableHints} />
          <ObjectBody
            type={type}
            schema={schema}
            dispatch={dispatch}
            quietControls
            fieldHintsByName={fieldHintsByName}
            fieldHintCount={fieldHintCount}
            fieldIndexInsights={fieldIndexInsights}
          />
          <Collapsible
            defaultOpen
            className="rounded-md border border-border/70 data-[state=open]:bg-muted/20"
          >
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="group h-8 w-full justify-start px-2 text-xs"
              >
                Advanced schema output
                {(indexCount > 0 || suggestionCount > 0) && (
                  <span className="ml-1 truncate text-muted-foreground">
                    · {indexCount} {indexCount === 1 ? 'index' : 'indexes'}
                    {suggestionCount > 0
                      ? ` · ${suggestionCount} ${
                          suggestionCount === 1 ? 'suggestion' : 'suggestions'
                        }`
                      : ''}
                  </span>
                )}
                <ChevronDown
                  aria-hidden="true"
                  className="ml-auto size-3.5 transition-transform group-data-[state=open]:rotate-180"
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col items-stretch gap-2 p-2.5 pt-0">
              <ConvexSection type={type} dispatch={dispatch} validationErrors={validationErrors} />
            </CollapsibleContent>
          </Collapsible>
        </div>
      </TabsContent>

      <TabsContent value="try" className="m-0 min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col">
          <ValidationIssues
            errors={validationErrors}
            onIssueClick={(error) => selectFieldFromValidationIssue(type, error)}
            repairForIssue={validationRepairForIssue}
          />
          <details className="shrink-0 border-b bg-muted/10 px-3 py-2">
            <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
              Generation settings
            </summary>
            <div className="mt-2">
              <SampleDataSection type={type} dispatch={dispatch} compact />
            </div>
          </details>
          {schema ? (
            <ScopedPlaygroundWorkbench schema={schema} typeName={type.name} className="flex-1" />
          ) : (
            <div className="grid flex-1 place-items-center p-6 text-center text-sm text-muted-foreground">
              Sample records need a schema context.
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}

function SampleDataSection({
  type,
  dispatch,
  compact = false,
}: Pick<TypeDetailProps, 'type' | 'dispatch'> & { compact?: boolean }) {
  const modules = listFixtureModules();
  const category = type.sampleData?.category ?? AUTO_SAMPLE_DATA;

  return (
    <section
      className={compact ? 'space-y-2' : 'space-y-2 rounded-md border border-border px-3 py-2'}
    >
      <Label htmlFor="type-sample-data-category" className="text-xs">
        Sample data
      </Label>
      <div className="space-y-1">
        <Select
          value={category}
          onValueChange={(value) => {
            const nextCategory = value === AUTO_SAMPLE_DATA ? undefined : value;
            dispatch({
              kind: 'update_type',
              name: type.name,
              patch: typePatch({
                sampleData: nextCategory
                  ? { ...type.sampleData, category: nextCategory }
                  : undefined,
              }),
            });
          }}
        >
          <SelectTrigger id="type-sample-data-category" className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={AUTO_SAMPLE_DATA}>Auto</SelectItem>
            {modules.map((module) => (
              <SelectItem key={module.id} value={module.id}>
                {module.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </section>
  );
}

function splitTableModelingHints(hints: readonly ModelingHint[]): {
  tableHints: ModelingHint[];
  fieldHintsByName: Map<string, ModelingHint[]>;
} {
  const tableHints: ModelingHint[] = [];
  const fieldHintsByName = new Map<string, ModelingHint[]>();

  for (const hint of hints) {
    if (!hint.fieldName) {
      tableHints.push(hint);
      continue;
    }
    const existing = fieldHintsByName.get(hint.fieldName) ?? [];
    existing.push(hint);
    fieldHintsByName.set(hint.fieldName, existing);
  }

  return { tableHints, fieldHintsByName };
}

function TableModelingAdvisoryStrip({ hints }: { hints: readonly ModelingHint[] }) {
  if (hints.length === 0) return null;
  const [primary, ...secondary] = hints;
  if (!primary) return null;

  return (
    <section
      aria-label="Model shape"
      className="rounded-md border px-3 py-2 text-xs"
      style={toneSurfaceStyle('var(--inspector-advisory)', 16, 58)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="font-medium text-foreground">{primary.title}</div>
          <p className="text-muted-foreground">{primary.message}</p>
        </div>
        {secondary.length > 0 && (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            +{secondary.length} more
          </span>
        )}
      </div>
    </section>
  );
}

function NameField({ type, dispatch, reserved }: TypeDetailProps & { reserved: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onFocusTypeName(event: Event): void {
      const detail = (event as CustomEvent<{ typeName?: unknown }>).detail;
      if (detail?.typeName !== type.name) return;
      inputRef.current?.focus();
      inputRef.current?.select();
    }

    document.addEventListener(FOCUS_TYPE_NAME_EVENT, onFocusTypeName);
    return () => document.removeEventListener(FOCUS_TYPE_NAME_EVENT, onFocusTypeName);
  }, [type.name]);

  return (
    <div className="space-y-1">
      <Label htmlFor="type-name">Name</Label>
      <Input
        ref={inputRef}
        id="type-name"
        defaultValue={type.name}
        aria-invalid={reserved || undefined}
        title={reserved ? CONVEX_RESERVED_PREFIX_MSG : undefined}
        onBlur={(ev) => {
          const next = ev.target.value.trim();
          if (next && next !== type.name)
            dispatch({ kind: 'rename_type', from: type.name, to: next });
        }}
      />
    </div>
  );
}

function DescriptionField({ type, dispatch }: TypeDetailProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor="type-description">Description</Label>
      <Textarea
        id="type-description"
        defaultValue={type.description ?? ''}
        onBlur={(ev) => {
          const next = ev.target.value;
          if (next !== (type.description ?? '')) {
            dispatch({
              kind: 'update_type',
              name: type.name,
              patch: { description: next || undefined },
            });
          }
        }}
      />
    </div>
  );
}

function ObjectBody({
  type,
  schema,
  dispatch,
  quietControls = false,
  fieldHintsByName,
  fieldHintCount = 0,
  fieldIndexInsights,
}: {
  type: Extract<TypeDef, { kind: 'object' }>;
  schema?: Schema;
  dispatch: (op: Op) => void;
  quietControls?: boolean;
  fieldHintsByName?: ReadonlyMap<string, readonly ModelingHint[]>;
  fieldHintCount?: number;
  fieldIndexInsights?: ReadonlyMap<string, FieldIndexInsight>;
}) {
  const fieldOrder = type.fields.map((field) => field.name);
  const inheritedFields = inheritedObjectFields(type, schema);
  const addField = () => {
    const field: FieldDef = { name: nextFieldName(type.fields), type: { kind: 'string' } };
    dispatch({
      kind: 'add_field',
      typeName: type.name,
      field,
    });
    useGraphSelectionStore.getState().selectField({ typeName: type.name, fieldName: field.name });
  };
  const moveField = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= fieldOrder.length) return;
    const nextOrder = [...fieldOrder];
    const [fieldName] = nextOrder.splice(fromIndex, 1);
    if (!fieldName) return;
    nextOrder.splice(toIndex, 0, fieldName);
    dispatch({ kind: 'reorder_fields', typeName: type.name, order: nextOrder });
  };

  if (type.fields.length === 0) {
    return (
      <div className="space-y-4">
        <ObjectInheritanceSection type={type} inheritedFields={inheritedFields} />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Fields</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addField}
              className="h-7 text-xs"
            >
              <Plus aria-hidden="true" />
              Add field
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            No fields yet. Add a field to start shaping this type.
          </p>
        </div>
        <ObjectInvariantsSection type={type} schema={schema} dispatch={dispatch} />
      </div>
    );
  }
  const isTable = type.table === true;
  const showAdviceColumn = Boolean(fieldHintsByName && fieldHintsByName.size > 0);
  return (
    <div className="space-y-4">
      <ObjectInheritanceSection type={type} inheritedFields={inheritedFields} />
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label>Fields</Label>
            {fieldHintCount > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {fieldHintCount} {fieldHintCount === 1 ? 'advisory' : 'advisories'}
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addField}
            className="h-7 text-xs"
          >
            <Plus aria-hidden="true" />
            Add field
          </Button>
        </div>
        <Table className="text-xs">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-7 px-2">Name</TableHead>
              <TableHead className="h-7 w-20 px-2 text-center">Optional</TableHead>
              <TableHead className="h-7 px-2 text-right">Type</TableHead>
              {showAdviceColumn && (
                <TableHead className="h-7 w-14 px-1 text-center">
                  <span className="sr-only">Advice</span>
                </TableHead>
              )}
              <TableHead className="h-7 w-36 px-1 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {type.fields.map((f, fieldIndex) => {
              const reserved = isTable && isConvexReservedName(f.name);
              const fieldHints = fieldHintsByName?.get(f.name) ?? [];
              const fieldIndexInsight = fieldIndexInsights?.get(f.name);
              return (
                <TableRow
                  key={f.name}
                  data-testid="object-field-summary"
                  data-reserved={reserved || undefined}
                  title={reserved ? CONVEX_RESERVED_PREFIX_MSG : undefined}
                  className={cn('group', reserved && 'text-destructive')}
                >
                  <TableCell className="px-2 py-1.5 font-medium">
                    <Input
                      aria-label={`Field name ${f.name}`}
                      defaultValue={f.name}
                      className="h-7 px-2 text-xs font-medium"
                      onBlur={(ev) => {
                        const next = ev.target.value.trim();
                        if (next && next !== f.name) {
                          dispatch({
                            kind: 'update_field',
                            typeName: type.name,
                            fieldName: f.name,
                            patch: { name: next },
                          });
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-center">
                    <Checkbox
                      aria-label={`${f.name} optional`}
                      checked={f.optional === true}
                      onCheckedChange={(v) =>
                        dispatch({
                          kind: 'update_field',
                          typeName: type.name,
                          fieldName: f.name,
                          patch: { optional: v === true },
                        })
                      }
                    />
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      {f.derivation && <FieldDerivationPill field={f} />}
                      <FieldKindPill fieldType={f.type} />
                    </div>
                  </TableCell>
                  {showAdviceColumn && (
                    <TableCell className="w-14 px-1 py-1.5 text-center">
                      <FieldAdvicePopover
                        typeName={type.name}
                        fieldName={f.name}
                        hints={fieldHints}
                      />
                    </TableCell>
                  )}
                  <TableCell className="w-36 px-1 py-1.5 text-right">
                    <div className="inline-flex items-center justify-end gap-0.5">
                      {fieldIndexInsight && (
                        <FieldIndexPopover
                          typeName={type.name}
                          fieldName={f.name}
                          insight={fieldIndexInsight}
                          dispatch={dispatch}
                        />
                      )}
                      <div
                        className={cn(
                          'inline-flex items-center gap-0.5 transition-opacity',
                          quietControls &&
                            'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                        )}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit field ${f.name}`}
                          onClick={() =>
                            useGraphSelectionStore
                              .getState()
                              .selectField({ typeName: type.name, fieldName: f.name })
                          }
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        >
                          <SlidersHorizontal aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Move field ${f.name} earlier`}
                          disabled={fieldIndex === 0}
                          onClick={() => moveField(fieldIndex, fieldIndex - 1)}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        >
                          <ChevronUp aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Move field ${f.name} later`}
                          disabled={fieldIndex === type.fields.length - 1}
                          onClick={() => moveField(fieldIndex, fieldIndex + 1)}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        >
                          <ChevronDown aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete field ${f.name}`}
                          onClick={() =>
                            dispatch({
                              kind: 'remove_field',
                              typeName: type.name,
                              fieldName: f.name,
                            })
                          }
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <ObjectInvariantsSection type={type} schema={schema} dispatch={dispatch} />
    </div>
  );
}

interface InheritedObjectField {
  field: FieldDef;
  sourceTypeName: string;
}

function ObjectInheritanceSection({
  type,
  inheritedFields,
}: {
  type: Extract<TypeDef, { kind: 'object' }>;
  inheritedFields: readonly InheritedObjectField[];
}) {
  if ((type.extends?.length ?? 0) === 0 && inheritedFields.length === 0) return null;
  return (
    <div className="space-y-2 rounded-md border border-border/70 p-2.5">
      <div className="flex items-center gap-2">
        <GitBranch aria-hidden="true" className="size-3.5 text-muted-foreground" />
        <Label>Inheritance</Label>
      </div>
      {(type.extends?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {type.extends?.map((baseName) => (
            <span
              key={baseName}
              className="inline-flex min-h-6 items-center rounded-md border px-1.5 font-mono text-[11px] font-medium"
              style={toneSurfaceStyle('var(--inspector-type-object)', 12, 42)}
            >
              {baseName}
            </span>
          ))}
        </div>
      )}
      {inheritedFields.length > 0 ? (
        <div className="space-y-1">
          {inheritedFields.map(({ field, sourceTypeName }) => (
            <div
              key={`${sourceTypeName}.${field.name}`}
              className="flex min-h-7 items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-1 text-xs"
              data-testid="inherited-field-summary"
            >
              <div className="min-w-0">
                <span className="font-medium text-foreground">{field.name}</span>
                <span className="ml-1 text-[11px] text-muted-foreground">
                  from {sourceTypeName}
                </span>
              </div>
              <FieldKindPill fieldType={field.type} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Base types will show inherited fields here once schema context is available.
        </p>
      )}
    </div>
  );
}

function ObjectInvariantsSection({
  type,
  schema,
  dispatch,
}: {
  type: Extract<TypeDef, { kind: 'object' }>;
  schema?: Schema;
  dispatch: (op: Op) => void;
}) {
  const invariants = type.invariants ?? [];
  const [editing, setEditing] = useState<ObjectInvariant | null>(null);
  const [creating, setCreating] = useState(false);
  const fieldOptions = effectiveObjectFields(type, schema).map((entry) => entry.field);
  const canAdd = fieldOptions.length > 0;

  const closeDialog = () => {
    setCreating(false);
    setEditing(null);
  };

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label>Invariants</Label>
          {invariants.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {invariants.length} {invariants.length === 1 ? 'rule' : 'rules'}
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setCreating(true)}
          disabled={!canAdd}
          title={canAdd ? undefined : 'Add a field before creating an invariant.'}
          className="h-7 px-2 text-xs"
        >
          <Plus aria-hidden="true" />
          Add invariant
        </Button>
      </div>

      {invariants.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No invariants yet. Add rules for conditional fields, exclusive choices, field predicates,
          or array uniqueness.
        </p>
      ) : (
        <div className="space-y-1.5">
          {invariants.map((invariant) => (
            <div
              key={invariant.name}
              className="group flex items-start justify-between gap-2 rounded-md border px-2 py-1.5 text-xs"
              data-testid="object-invariant-row"
              style={toneSurfaceStyle(invariantKindColor(invariant.kind), 10, 34)}
            >
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="rounded border bg-background/80 px-1.5 py-0.5 text-[10px] font-medium">
                    {invariantKindLabel(invariant.kind)}
                  </span>
                  <span className="truncate font-mono text-[11px] font-semibold text-foreground">
                    {invariant.name}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {invariantSummary(invariant)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit invariant ${invariant.name}`}
                  onClick={() => setEditing(invariant)}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                >
                  <SlidersHorizontal aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete invariant ${invariant.name}`}
                  onClick={() =>
                    dispatch({
                      kind: 'remove_invariant',
                      typeName: type.name,
                      name: invariant.name,
                    })
                  }
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <InvariantDialog
          type={type}
          schema={schema}
          invariant={editing}
          open={creating || editing !== null}
          onOpenChange={(open) => {
            if (!open) closeDialog();
          }}
          onSave={(invariant) => {
            if (editing) {
              dispatch({
                kind: 'update_invariant',
                typeName: type.name,
                name: editing.name,
                patch: invariant,
              });
            } else {
              dispatch({ kind: 'add_invariant', typeName: type.name, invariant });
            }
            closeDialog();
          }}
        />
      )}
    </div>
  );
}

function InvariantDialog({
  type,
  schema,
  invariant,
  open,
  onOpenChange,
  onSave,
}: {
  type: Extract<TypeDef, { kind: 'object' }>;
  schema?: Schema;
  invariant: ObjectInvariant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (invariant: ObjectInvariant) => void;
}) {
  const fieldOptions = effectiveObjectFields(type, schema).map((entry) => entry.field);
  const [draft, setDraft] = useState<ObjectInvariant>(
    () => invariant ?? defaultInvariant(type, schema, 'exactlyOneOf'),
  );

  useEffect(() => {
    setDraft(invariant ?? defaultInvariant(type, schema, draft.kind));
  }, [invariant, schema, type, draft.kind]);

  const updateDraft = (next: ObjectInvariant) => setDraft(next);
  const setKind = (kind: ObjectInvariant['kind']) => {
    setDraft(defaultInvariant(type, schema, kind, draft.name));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-4">
        <DialogHeader>
          <DialogTitle>{invariant ? 'Edit invariant' : 'Add invariant'}</DialogTitle>
          <DialogDescription>
            Define a validator-level rule for {type.name}. Generated Zod enforces these rules.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="invariant-name">Name</Label>
              <Input
                id="invariant-name"
                value={draft.name}
                onChange={(ev) => updateDraft({ ...draft, name: ev.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kind</Label>
              <Select
                value={draft.kind}
                onValueChange={(value) => setKind(value as ObjectInvariant['kind'])}
              >
                <SelectTrigger aria-label="Invariant kind" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="requiresWhen">Requires when</SelectItem>
                  <SelectItem value="exactlyOneOf">Exactly one</SelectItem>
                  <SelectItem value="mutuallyExclusive">Mutually exclusive</SelectItem>
                  <SelectItem value="fieldPredicate">Field rule</SelectItem>
                  <SelectItem value="uniqueInArray">Unique in array</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <InvariantKindFields
            draft={draft}
            type={type}
            schema={schema}
            fieldOptions={fieldOptions}
            onChange={updateDraft}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onSave(normalizeInvariantDraft(draft, type))}
            disabled={!draft.name.trim()}
          >
            Save invariant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvariantKindFields({
  draft,
  type,
  schema,
  fieldOptions,
  onChange,
}: {
  draft: ObjectInvariant;
  type: Extract<TypeDef, { kind: 'object' }>;
  schema?: Schema;
  fieldOptions: readonly FieldDef[];
  onChange: (invariant: ObjectInvariant) => void;
}) {
  const fieldNames = fieldOptions.map((field) => field.name);
  switch (draft.kind) {
    case 'requiresWhen':
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
            <FieldSelect
              label="Condition field"
              value={draft.when.field}
              fieldNames={fieldNames}
              onChange={(field) => onChange({ ...draft, when: { ...draft.when, field } })}
            />
            <div className="space-y-1.5">
              <Label htmlFor="condition-value">Equals</Label>
              <Input
                id="condition-value"
                value={String(draft.when.equals)}
                onChange={(ev) =>
                  onChange({ ...draft, when: { ...draft.when, equals: ev.target.value } })
                }
                className="h-8 text-xs"
              />
            </div>
          </div>
          <FieldChecklist
            label="Requires"
            fieldNames={fieldNames}
            selected={draft.requires ?? []}
            onChange={(requires) => onChange({ ...draft, requires })}
          />
          <FieldChecklist
            label="Forbids"
            fieldNames={fieldNames}
            selected={draft.forbids ?? []}
            onChange={(forbids) => onChange({ ...draft, forbids })}
          />
        </div>
      );
    case 'exactlyOneOf':
    case 'mutuallyExclusive':
      return (
        <FieldChecklist
          label="Fields"
          fieldNames={fieldNames}
          selected={draft.fields}
          onChange={(fields) => onChange({ ...draft, fields })}
        />
      );
    case 'fieldPredicate':
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
          <FieldSelect
            label="Field"
            value={draft.field}
            fieldNames={fieldNames}
            onChange={(field) => onChange({ ...draft, field })}
          />
          <div className="space-y-1.5">
            <Label>Predicate</Label>
            <Select
              value={
                draft.predicate.kind === 'weekday'
                  ? `weekday:${draft.predicate.value}`
                  : draft.predicate.kind
              }
              onValueChange={(value) => {
                if (value.startsWith('weekday:')) {
                  onChange({
                    ...draft,
                    predicate: {
                      kind: 'weekday',
                      value: value.slice('weekday:'.length) as WeekdayValue,
                    },
                  });
                  return;
                }
                onChange({ ...draft, predicate: { kind: 'nonEmptyTrimmedString' } });
              }}
            >
              <SelectTrigger aria-label="Field predicate" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nonEmptyTrimmedString">Non-empty trimmed string</SelectItem>
                <SelectItem value="weekday:monday">Weekday: Monday</SelectItem>
                <SelectItem value="weekday:tuesday">Weekday: Tuesday</SelectItem>
                <SelectItem value="weekday:wednesday">Weekday: Wednesday</SelectItem>
                <SelectItem value="weekday:thursday">Weekday: Thursday</SelectItem>
                <SelectItem value="weekday:friday">Weekday: Friday</SelectItem>
                <SelectItem value="weekday:saturday">Weekday: Saturday</SelectItem>
                <SelectItem value="weekday:sunday">Weekday: Sunday</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    case 'uniqueInArray': {
      const arrayFields = fieldOptions.filter((field) => field.type.kind === 'array');
      const arrayFieldNames = arrayFields.map((field) => field.name);
      const childFields = childFieldsForArray(type, schema, draft.arrayField);
      const childFieldNames = childFields.map((field) => field.name);
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
            <FieldSelect
              label="Array field"
              value={draft.arrayField}
              fieldNames={arrayFieldNames}
              onChange={(arrayField) => {
                const [uniqueField] = childFieldsForArray(type, schema, arrayField);
                onChange({
                  ...draft,
                  arrayField,
                  uniqueField: uniqueField?.name ?? draft.uniqueField,
                });
              }}
            />
            <FieldSelect
              label="Unique child field"
              value={draft.uniqueField}
              fieldNames={childFieldNames}
              onChange={(uniqueField) => onChange({ ...draft, uniqueField })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
            <FieldSelect
              label="Where field"
              value={draft.where?.field ?? NO_FIELD_VALUE}
              fieldNames={[NO_FIELD_VALUE, ...childFieldNames]}
              labels={{ [NO_FIELD_VALUE]: 'No condition' }}
              onChange={(field) =>
                onChange({
                  ...draft,
                  where:
                    field === NO_FIELD_VALUE
                      ? undefined
                      : { field, equals: draft.where?.equals ?? '' },
                })
              }
            />
            <div className="space-y-1.5">
              <Label htmlFor="where-value">Where equals</Label>
              <Input
                id="where-value"
                value={String(draft.where?.equals ?? '')}
                disabled={!draft.where}
                onChange={(ev) =>
                  draft.where &&
                  onChange({ ...draft, where: { ...draft.where, equals: ev.target.value } })
                }
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>
      );
    }
  }
}

const NO_FIELD_VALUE = '__none__';

function FieldSelect({
  label,
  value,
  fieldNames,
  labels = {},
  onChange,
}: {
  label: string;
  value: string;
  fieldNames: readonly string[];
  labels?: Record<string, string>;
  onChange: (fieldName: string) => void;
}) {
  const id = useStableDomId('field-select');
  const options = fieldNames.length > 0 ? fieldNames : [value || NO_FIELD_VALUE];
  const safeValue = options.includes(value) ? value : (options[0] ?? NO_FIELD_VALUE);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={safeValue} onValueChange={onChange}>
        <SelectTrigger id={id} aria-label={label} className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((fieldName) => (
            <SelectItem key={fieldName} value={fieldName}>
              {labels[fieldName] ?? fieldName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FieldChecklist({
  label,
  fieldNames,
  selected,
  onChange,
}: {
  label: string;
  fieldNames: readonly string[];
  selected: readonly string[];
  onChange: (fields: string[]) => void;
}) {
  const selectedSet = new Set(selected);
  const toggle = (fieldName: string) => {
    if (selectedSet.has(fieldName)) {
      onChange(selected.filter((field) => field !== fieldName));
      return;
    }
    onChange([...selected, fieldName]);
  };

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {fieldNames.map((fieldName) => (
          <Label
            key={fieldName}
            className="inline-flex min-h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs font-normal"
          >
            <Checkbox
              aria-label={`${label} ${fieldName}`}
              checked={selectedSet.has(fieldName)}
              onCheckedChange={() => toggle(fieldName)}
            />
            {fieldName}
          </Label>
        ))}
      </div>
    </div>
  );
}

function FieldAdvicePopover({
  typeName,
  fieldName,
  hints,
}: {
  typeName: string;
  fieldName: string;
  hints: readonly ModelingHint[];
}) {
  if (hints.length === 0) return <span aria-hidden="true" className="inline-block h-7 w-7" />;

  const [primary, ...secondary] = hints;
  if (!primary) return null;
  const toneColor = advisoryToneColor(hints);
  const openInChat = () => {
    useChatComposerStore.getState().setPendingChatMessage({
      message: advisoryChatPrompt({ typeName, fieldName, primary, hints }),
      context: '',
    });
    useUIChromeStore.getState().setSidebarTab('chat');
    useUIChromeStore.getState().setSidebarVisible(true);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Modeling advice for ${fieldName}`}
          className="relative h-7 w-7 border shadow-[0_0_0_1px_color-mix(in_oklch,currentColor_10%,transparent)] transition-colors hover:bg-accent/70 data-[state=open]:bg-accent"
          style={toneSurfaceStyle(toneColor, 18, 48)}
        >
          <LightbulbIcon color={toneColor} />
          <span
            className="absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full border border-background px-1 text-[9px] font-semibold leading-none"
            style={{
              background: toneColor,
              color:
                toneColor === 'var(--warning)' ? 'var(--warning-foreground)' : 'var(--background)',
            }}
          >
            {hints.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="left" className="w-80 p-3 text-xs">
        <div className="space-y-3">
          <HintBody hint={primary} />
          {secondary.length > 0 && (
            <div className="space-y-2 border-t border-border/70 pt-2">
              {secondary.map((hint) => (
                <HintBody key={hint.id} hint={hint} compact />
              ))}
            </div>
          )}
          <div className="border-t border-border/70 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full justify-start gap-1.5 text-xs"
              onClick={openInChat}
            >
              <MessageSquare aria-hidden="true" className="size-3.5" />
              Ask in chat
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function advisoryChatPrompt({
  typeName,
  fieldName,
  primary,
  hints,
}: {
  typeName: string;
  fieldName: string;
  primary: ModelingHint;
  hints: readonly ModelingHint[];
}): string {
  const signals = [...new Set(hints.flatMap((hint) => hint.signals))].join(', ');
  return [
    `Help me resolve this Contexture modeling advisory for ${typeName}.${fieldName}.`,
    '',
    `Primary advisory: ${primary.title}`,
    `Message: ${primary.message}`,
    `Rationale: ${primary.rationale}`,
    signals ? `Signals: ${signals}` : null,
    '',
    'Please review the current IR and guide me through the smallest safe resolution. If extracting a child table is appropriate, explain the table, refs, ownership scope, and indexes before applying changes.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function LightbulbIcon({ color }: { color: string }): React.JSX.Element {
  return <Lightbulb aria-hidden="true" className="size-3.5" style={{ color }} />;
}

function advisoryToneColor(hints: readonly ModelingHint[]): string {
  return hints.some((hint) =>
    hint.signals.some(
      (signal) => signal === 'concurrency_pressure' || signal === 'document_size_pressure',
    ),
  )
    ? 'var(--warning)'
    : 'var(--inspector-advisory)';
}

function FieldIndexPopover({
  typeName,
  fieldName,
  insight,
  dispatch,
}: {
  typeName: string;
  fieldName: string;
  insight: FieldIndexInsight;
  dispatch: (op: Op) => void;
}) {
  const isIndexed = insight.memberships.length > 0;
  const suggestion = insight.suggestion;
  if (!isIndexed && !suggestion) return null;

  const triggerLabel = isIndexed ? `Index details for ${fieldName}` : `Add index for ${fieldName}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={triggerLabel}
          className={cn(
            'h-7 w-7 border border-transparent text-muted-foreground hover:text-primary data-[state=open]:text-primary',
            !isIndexed &&
              'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
          )}
          style={isIndexed ? toneSurfaceStyle('var(--inspector-index)', 14, 0) : undefined}
        >
          {isIndexed ? (
            <Hash aria-hidden="true" className="size-3.5" />
          ) : (
            <Plus aria-hidden="true" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="left" className="w-72 p-3 text-xs">
        <div className="space-y-3">
          {isIndexed && (
            <div className="space-y-2">
              <div className="font-medium text-foreground">Indexed field</div>
              <div className="space-y-1.5">
                {insight.memberships.map((membership) => (
                  <div
                    key={membership.indexName}
                    className="rounded-md border px-2 py-1.5"
                    style={toneSurfaceStyle('var(--inspector-index)', 14, 50)}
                  >
                    <div className="font-mono text-[11px] text-foreground">
                      {membership.indexName}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {membership.total === 1
                        ? 'Single-field index'
                        : `Position ${membership.position + 1} of ${membership.total}: ${membership.fields.join(
                            ' -> ',
                          )}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {suggestion && (
            <div className={cn('space-y-2', isIndexed && 'border-t border-border/70 pt-2')}>
              <div>
                <div className="font-medium text-foreground">Suggested index</div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Useful for lookups, filtering, or sorting on this field.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  dispatch({
                    kind: 'add_index',
                    typeName,
                    index: { name: suggestion.name, fields: suggestion.fields },
                  })
                }
                className="h-7 px-2 text-xs"
              >
                <Plus aria-hidden="true" />
                Add {suggestion.name}
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// TODO(#119): gate on output config mode once Contexture supports multiple emit targets.
function ConvexSection({
  type,
  dispatch,
  validationErrors,
}: {
  type: Extract<TypeDef, { kind: 'object' }>;
  dispatch: (op: Op) => void;
  validationErrors: readonly ValidationError[];
}) {
  const isTable = type.table === true;
  const indexes = type.indexes ?? [];
  const fieldNames = type.fields.map((f) => f.name);
  const suggestions = suggestedIndexes(type);

  const toggleTable = () => {
    dispatch({ kind: 'set_table_flag', typeName: type.name, table: !isTable });
  };

  const addIndex = () => {
    const name = nextIndexName(indexes);
    // Must have at least one field — seed with the first field if available.
    const seed = fieldNames[0];
    if (!seed) return;
    dispatch({
      kind: 'add_index',
      typeName: type.name,
      index: { name, fields: [seed] },
    });
  };

  return (
    <div className="space-y-2 border-t pt-3">
      <Label htmlFor="convex-table" className="flex items-center gap-2">
        <Checkbox id="convex-table" checked={isTable} onCheckedChange={toggleTable} />
        Use as Convex table
      </Label>
      <p className="text-xs text-muted-foreground">
        Convex tables emit into <code className="font-mono">convex/schema.ts</code> and can own
        query indexes.
      </p>

      {isTable && (
        <div className="space-y-2 pt-1">
          <div className="space-y-1">
            <Label htmlFor="convex-table-name">Emitted table name</Label>
            <Input
              id="convex-table-name"
              defaultValue={type.tableName ?? defaultConvexTableName(type.name)}
              className="h-8 px-2 text-xs"
              aria-invalid={isConvexReservedName(
                type.tableName ?? defaultConvexTableName(type.name),
              )}
              title={
                isConvexReservedName(type.tableName ?? defaultConvexTableName(type.name))
                  ? CONVEX_RESERVED_PREFIX_MSG
                  : undefined
              }
              onBlur={(ev) => {
                const next = ev.target.value.trim();
                const defaultName = defaultConvexTableName(type.name);
                const tableName = next && next !== defaultName ? next : undefined;
                if (tableName !== type.tableName) {
                  dispatch({
                    kind: 'update_type',
                    name: type.name,
                    patch: typePatch({ tableName }),
                  });
                }
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Indexes</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addIndex}
              disabled={fieldNames.length === 0}
              className="h-7 px-2 text-xs"
            >
              <Plus aria-hidden="true" />
              Add index
            </Button>
          </div>
          {fieldNames.length === 0 && (
            <p className="text-xs text-muted-foreground">Add a field before creating an index.</p>
          )}
          {suggestions.length > 0 && (
            <div
              className="flex items-center justify-between gap-3 rounded-md border px-2 py-1.5"
              style={toneSurfaceStyle('var(--inspector-index)', 16, 56)}
            >
              <p className="min-w-0 text-[11px] font-medium text-foreground">
                {suggestions.length}{' '}
                {suggestions.length === 1 ? 'suggested index' : 'suggested indexes'}
              </p>
              <SuggestedIndexesPopover
                typeName={type.name}
                suggestions={suggestions}
                dispatch={dispatch}
              />
            </div>
          )}
          {indexes.length === 0 ? (
            <p className="text-xs text-muted-foreground">No indexes yet.</p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted-foreground">
                Field order affects Convex query prefixes.
              </p>
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-7 px-2">Index</TableHead>
                    <TableHead className="h-7 px-2">Fields</TableHead>
                    <TableHead className="h-7 w-9 px-1 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {indexes.map((idx, indexIndex) => (
                    <IndexRow
                      key={idx.name}
                      typeName={type.name}
                      index={idx}
                      validationErrors={validationErrorsForIndex(validationErrors, indexIndex)}
                      fieldNames={fieldNames}
                      dispatch={dispatch}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SuggestedIndexesPopover({
  typeName,
  suggestions,
  dispatch,
}: {
  typeName: string;
  suggestions: readonly SuggestedIndex[];
  dispatch: (op: Op) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs">
          Review
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3 text-xs">
        <div className="space-y-3">
          <div>
            <div className="font-medium text-foreground">Suggested indexes</div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Suggested from refs and likely lookup fields.
            </p>
          </div>
          <div className="space-y-1.5">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.name}
                className="flex items-start justify-between gap-3 rounded-md border px-2 py-1.5"
                style={toneSurfaceStyle('var(--inspector-index)', 10, 38)}
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-[11px] text-foreground">
                    {suggestion.name}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {suggestionReason(suggestion)}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    dispatch({
                      kind: 'add_index',
                      typeName,
                      index: { name: suggestion.name, fields: suggestion.fields },
                    });
                    setOpen(false);
                  }}
                  className="h-7 shrink-0 px-2 text-xs"
                >
                  <Plus aria-hidden="true" />
                  Add
                </Button>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function IndexRow({
  typeName,
  index,
  validationErrors,
  fieldNames,
  dispatch,
}: {
  typeName: string;
  index: IndexDef;
  validationErrors: readonly ValidationError[];
  fieldNames: string[];
  dispatch: (op: Op) => void;
}) {
  const availableFieldNames = fieldNames.filter((fieldName) => !index.fields.includes(fieldName));
  const hasValidationIssues = validationErrors.length > 0;

  const updateFields = (fields: string[]) => {
    dispatch({
      kind: 'update_index',
      typeName,
      name: index.name,
      patch: { fields },
    });
  };

  const appendField = (fieldName: string) => {
    updateFields([...index.fields, fieldName]);
  };

  const removeField = (fieldName: string) => {
    if (index.fields.length <= 1) return;
    updateFields(index.fields.filter((field) => field !== fieldName));
  };

  const moveField = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= index.fields.length) return;
    const nextFields = [...index.fields];
    const [field] = nextFields.splice(fromIndex, 1);
    if (!field) return;
    nextFields.splice(toIndex, 0, field);
    updateFields(nextFields);
  };

  return (
    <TableRow
      data-testid="convex-index-row"
      data-validation-issues={hasValidationIssues || undefined}
      className={hasValidationIssues ? 'bg-destructive/10' : undefined}
    >
      <TableCell className="w-32 px-2 py-1.5 align-top">
        <Input
          aria-label={`Index name for ${index.name}`}
          defaultValue={index.name}
          aria-invalid={hasValidationIssues || undefined}
          className="h-8 px-2 text-xs"
          onBlur={(ev) => {
            const next = ev.target.value.trim();
            if (next && next !== index.name) {
              dispatch({
                kind: 'update_index',
                typeName,
                name: index.name,
                patch: { name: next },
              });
            }
          }}
        />
      </TableCell>
      <TableCell className="px-2 py-1.5 align-top">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {index.fields.map((fieldName, fieldIndex) => (
              <IndexFieldChip
                key={fieldName}
                indexName={index.name}
                fieldName={fieldName}
                position={fieldIndex}
                total={index.fields.length}
                onMoveEarlier={() => moveField(fieldIndex, fieldIndex - 1)}
                onMoveLater={() => moveField(fieldIndex, fieldIndex + 1)}
                onRemove={() => removeField(fieldName)}
              />
            ))}
            <IndexFieldPicker
              indexName={index.name}
              availableFieldNames={availableFieldNames}
              onSelect={appendField}
            />
          </div>
          {hasValidationIssues && (
            <ul
              className="space-y-0.5 text-[11px] text-destructive"
              aria-label={`Validation issues for index ${index.name}`}
            >
              {validationErrors.map((error) => (
                <li key={`${error.code}:${error.path}`}>{error.message}</li>
              ))}
            </ul>
          )}
        </div>
      </TableCell>
      <TableCell className="w-9 px-1 py-1.5 text-right align-top">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Delete index ${index.name}`}
          onClick={() => dispatch({ kind: 'remove_index', typeName, name: index.name })}
          className="h-8 w-8 text-destructive hover:text-destructive"
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function IndexFieldChip({
  indexName,
  fieldName,
  position,
  total,
  onMoveEarlier,
  onMoveLater,
  onRemove,
}: {
  indexName: string;
  fieldName: string;
  position: number;
  total: number;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
  onRemove: () => void;
}) {
  const displayPosition = position + 1;
  const onlyField = total === 1;

  return (
    <span
      className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-md border px-1.5 text-xs text-foreground"
      style={toneSurfaceStyle('var(--inspector-index)', 14, 48)}
    >
      <span className="sr-only">
        {fieldName}, field {displayPosition} of {total} in index {indexName}
      </span>
      <span
        className="rounded px-1 font-mono text-[10px]"
        style={toneSurfaceStyle('var(--inspector-index)', 24, 0)}
      >
        {displayPosition}
      </span>
      <span className="max-w-32 truncate font-medium">{fieldName}</span>
      <span className="ml-0.5 flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Move ${fieldName} earlier in index ${indexName}`}
          disabled={position === 0}
          onClick={onMoveEarlier}
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <ChevronUp aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Move ${fieldName} later in index ${indexName}`}
          disabled={position === total - 1}
          onClick={onMoveLater}
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <ChevronDown aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove ${fieldName} from index ${indexName}`}
          disabled={onlyField}
          title={onlyField ? 'Indexes need at least one field.' : undefined}
          onClick={onRemove}
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
        >
          <X aria-hidden="true" />
        </Button>
      </span>
    </span>
  );
}

function IndexFieldPicker({
  indexName,
  availableFieldNames,
  onSelect,
}: {
  indexName: string;
  availableFieldNames: string[];
  onSelect: (fieldName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerId = useStableDomId('add-index-field');
  const hasAvailableFields = availableFieldNames.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={triggerId}
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasAvailableFields}
          className="h-7 px-2 text-xs"
          aria-label={`Add field to index ${indexName}`}
        >
          <Plus aria-hidden="true" />
          Add field
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Find a field..." />
          <CommandList>
            <CommandEmpty>No fields available.</CommandEmpty>
            <CommandGroup>
              {availableFieldNames.map((fieldName) => (
                <CommandItem
                  key={fieldName}
                  value={fieldName}
                  onSelect={() => {
                    onSelect(fieldName);
                    setOpen(false);
                  }}
                >
                  {fieldName}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface EffectiveObjectField {
  field: FieldDef;
  sourceTypeName: string;
  inherited: boolean;
}

type WeekdayValue = Extract<
  Extract<ObjectInvariant, { kind: 'fieldPredicate' }>['predicate'],
  { kind: 'weekday' }
>['value'];

function effectiveObjectFields(
  type: Extract<TypeDef, { kind: 'object' }>,
  schema?: Schema,
): EffectiveObjectField[] {
  const fields = new Map<string, EffectiveObjectField>();
  const seen = new Set<string>();
  const byName = new Map(schema?.types.map((candidate) => [candidate.name, candidate]) ?? []);

  function addFrom(current: Extract<TypeDef, { kind: 'object' }>, inherited: boolean): void {
    if (seen.has(current.name)) return;
    seen.add(current.name);
    for (const baseName of current.extends ?? []) {
      const base = byName.get(baseName);
      if (base?.kind === 'object') addFrom(base, true);
    }
    for (const field of current.fields) {
      fields.set(field.name, { field, sourceTypeName: current.name, inherited });
    }
  }

  addFrom(type, false);
  return [...fields.values()];
}

function inheritedObjectFields(
  type: Extract<TypeDef, { kind: 'object' }>,
  schema?: Schema,
): InheritedObjectField[] {
  return effectiveObjectFields(type, schema)
    .filter((entry) => entry.inherited)
    .map(({ field, sourceTypeName }) => ({ field, sourceTypeName }));
}

function childFieldsForArray(
  type: Extract<TypeDef, { kind: 'object' }>,
  schema: Schema | undefined,
  arrayFieldName: string,
): FieldDef[] {
  const arrayField = effectiveObjectFields(type, schema).find(
    (entry) => entry.field.name === arrayFieldName,
  )?.field;
  const arrayType = arrayField?.type;
  if (arrayType?.kind !== 'array') return [];
  const elementType = arrayType.element;
  if (elementType.kind !== 'ref') return [];
  const target = schema?.types.find((candidate) => candidate.name === elementType.typeName);
  if (target?.kind !== 'object') return [];
  return effectiveObjectFields(target, schema).map((entry) => entry.field);
}

function defaultInvariant(
  type: Extract<TypeDef, { kind: 'object' }>,
  schema: Schema | undefined,
  kind: ObjectInvariant['kind'],
  preferredName?: string,
): ObjectInvariant {
  const fields = effectiveObjectFields(type, schema).map((entry) => entry.field);
  const fieldNames = fields.map((field) => field.name);
  const firstField = fieldNames[0] ?? 'field';
  const secondField = fieldNames[1] ?? firstField;
  const name = preferredName?.trim() || nextInvariantName(type, kind);

  switch (kind) {
    case 'requiresWhen':
      return {
        kind,
        name,
        when: { field: firstField, equals: '' },
        requires: [secondField],
        forbids: [],
      };
    case 'exactlyOneOf':
      return { kind, name, fields: uniqueNonEmpty([firstField, secondField]) };
    case 'mutuallyExclusive':
      return { kind, name, fields: uniqueNonEmpty([firstField, secondField]) };
    case 'fieldPredicate':
      return {
        kind,
        name,
        field: firstField,
        predicate: { kind: 'nonEmptyTrimmedString' },
      };
    case 'uniqueInArray': {
      const arrayField = fields.find((field) => field.type.kind === 'array');
      const arrayFieldName = arrayField?.name ?? firstField;
      const childField = childFieldsForArray(type, schema, arrayFieldName)[0]?.name ?? 'id';
      return { kind, name, arrayField: arrayFieldName, uniqueField: childField };
    }
  }
}

function normalizeInvariantDraft(
  draft: ObjectInvariant,
  type: Extract<TypeDef, { kind: 'object' }>,
): ObjectInvariant {
  const name = draft.name.trim() || nextInvariantName(type, draft.kind);
  switch (draft.kind) {
    case 'requiresWhen':
      return {
        ...draft,
        name,
        requires: uniqueNonEmpty(draft.requires ?? []),
        forbids: uniqueNonEmpty(draft.forbids ?? []),
      };
    case 'exactlyOneOf':
    case 'mutuallyExclusive':
      return { ...draft, name, fields: uniqueNonEmpty(draft.fields) };
    case 'fieldPredicate':
      return { ...draft, name };
    case 'uniqueInArray':
      return {
        ...draft,
        name,
        where:
          draft.where && draft.where.field !== NO_FIELD_VALUE && draft.where.field.trim()
            ? draft.where
            : undefined,
      };
  }
}

function uniqueNonEmpty(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function nextInvariantName(
  type: Extract<TypeDef, { kind: 'object' }>,
  kind: ObjectInvariant['kind'],
): string {
  const taken = new Set((type.invariants ?? []).map((invariant) => invariant.name));
  const base = invariantNameBase(kind);
  if (!taken.has(base)) return base;
  for (let i = 2; i <= taken.size + 2; i += 1) {
    const candidate = `${base}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}${taken.size + 1}`;
}

function invariantNameBase(kind: ObjectInvariant['kind']): string {
  switch (kind) {
    case 'requiresWhen':
      return 'conditional_fields';
    case 'exactlyOneOf':
      return 'exactly_one_field';
    case 'mutuallyExclusive':
      return 'mutually_exclusive_fields';
    case 'fieldPredicate':
      return 'field_rule';
    case 'uniqueInArray':
      return 'unique_array_values';
  }
}

function invariantKindLabel(kind: ObjectInvariant['kind']): string {
  switch (kind) {
    case 'requiresWhen':
      return 'Requires when';
    case 'exactlyOneOf':
      return 'Exactly one';
    case 'mutuallyExclusive':
      return 'Mutually exclusive';
    case 'fieldPredicate':
      return 'Field rule';
    case 'uniqueInArray':
      return 'Unique in array';
  }
}

function invariantKindColor(kind: ObjectInvariant['kind']): string {
  switch (kind) {
    case 'requiresWhen':
      return 'var(--inspector-field-literal)';
    case 'exactlyOneOf':
      return 'var(--inspector-type-union)';
    case 'mutuallyExclusive':
      return 'var(--inspector-field-boolean)';
    case 'fieldPredicate':
      return 'var(--inspector-advisory)';
    case 'uniqueInArray':
      return 'var(--inspector-index)';
  }
}

function invariantSummary(invariant: ObjectInvariant): string {
  switch (invariant.kind) {
    case 'requiresWhen': {
      const requires = invariant.requires?.length
        ? `require ${invariant.requires.join(', ')}`
        : 'require no fields';
      const forbids = invariant.forbids?.length
        ? ` and forbid ${invariant.forbids.join(', ')}`
        : '';
      return `When ${invariant.when.field} = ${String(invariant.when.equals)}, ${requires}${forbids}.`;
    }
    case 'exactlyOneOf':
      return `Exactly one of ${invariant.fields.join(', ')} must be present.`;
    case 'mutuallyExclusive':
      return `At most one of ${invariant.fields.join(', ')} may be present.`;
    case 'fieldPredicate':
      if (invariant.predicate.kind === 'weekday') {
        return `${invariant.field} must fall on ${invariant.predicate.value}.`;
      }
      return `${invariant.field} must be a non-empty trimmed string.`;
    case 'uniqueInArray': {
      const where = invariant.where
        ? ` where ${invariant.where.field} = ${String(invariant.where.equals)}`
        : '';
      return `${invariant.uniqueField} must be unique inside ${invariant.arrayField}${where}.`;
    }
  }
}

function validationErrorsForIndex(
  errors: readonly ValidationError[],
  indexIndex: number,
): ValidationError[] {
  return errors.filter((error) => {
    const match = error.path.match(/^types\.\d+\.indexes\.(\d+)(?:\.|$)/u);
    return match ? Number(match[1]) === indexIndex : false;
  });
}

function useStableDomId(prefix: string): string {
  return `${prefix}-${useId().replace(/:/g, '')}`;
}

function nextIndexName(existing: IndexDef[]): string {
  const taken = new Set(existing.map((i) => i.name));
  let n = existing.length + 1;
  while (taken.has(`index${n}`)) n += 1;
  return `index${n}`;
}

interface SuggestedIndex {
  name: string;
  fields: string[];
}

interface FieldIndexMembership {
  indexName: string;
  fields: string[];
  position: number;
  total: number;
}

interface FieldIndexInsight {
  memberships: FieldIndexMembership[];
  suggestion?: SuggestedIndex;
}

function fieldIndexInsightsForType(
  type: Extract<TypeDef, { kind: 'object' }>,
): Map<string, FieldIndexInsight> {
  const insights = new Map<string, FieldIndexInsight>();
  const ensureInsight = (fieldName: string) => {
    const existing = insights.get(fieldName);
    if (existing) return existing;
    const insight: FieldIndexInsight = { memberships: [] };
    insights.set(fieldName, insight);
    return insight;
  };

  for (const index of type.indexes ?? []) {
    index.fields.forEach((fieldName, position) => {
      ensureInsight(fieldName).memberships.push({
        indexName: index.name,
        fields: index.fields,
        position,
        total: index.fields.length,
      });
    });
  }

  for (const suggestion of suggestedIndexes(type)) {
    const [fieldName] = suggestion.fields;
    if (fieldName && suggestion.fields.length === 1) {
      ensureInsight(fieldName).suggestion = suggestion;
    }
  }

  return insights;
}

function suggestedIndexes(type: Extract<TypeDef, { kind: 'object' }>): SuggestedIndex[] {
  if (type.table !== true) return [];
  const existing = type.indexes ?? [];
  const suggestions: SuggestedIndex[] = [];

  for (const field of type.fields) {
    if (!isIndexSuggestionField(field)) continue;
    const fields = [field.name];
    if (existing.some((index) => arraysEqual(index.fields, fields))) continue;
    const name = nextSuggestedIndexName(existing, suggestions, field.name);
    suggestions.push({ name, fields });
  }

  return suggestions;
}

function suggestionReason(suggestion: SuggestedIndex): string {
  if (suggestion.fields.length === 1) {
    return `Lookup and filter by ${suggestion.fields[0]}.`;
  }
  return `Compound query prefix: ${suggestion.fields.join(' -> ')}.`;
}

function isIndexSuggestionField(field: FieldDef): boolean {
  if (hasRef(field.type)) return true;
  if (field.derivation?.kind === 'cachedHandle') return true;
  if (/(^|_)(kind|state|status|slug|key)$|name$|searchtext$|date$|at$|year$/iu.test(field.name)) {
    return true;
  }
  const description = field.description?.toLowerCase() ?? '';
  return (
    description.includes('denormalized') ||
    description.includes('filter') ||
    description.includes('search') ||
    description.includes('index')
  );
}

function hasRef(type: FieldType): boolean {
  if (type.kind === 'ref') return true;
  if (type.kind === 'array') return hasRef(type.element);
  return false;
}

function nextSuggestedIndexName(
  existing: readonly IndexDef[],
  suggestions: readonly SuggestedIndex[],
  fieldName: string,
): string {
  const taken = new Set([
    ...existing.map((index) => index.name),
    ...suggestions.map((s) => s.name),
  ]);
  const base = `by_${fieldName}`;
  if (!taken.has(base)) return base;
  for (let i = 2; i <= taken.size + 2; i++) {
    const candidate = `${base}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}${taken.size + 1}`;
}

function arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function defaultConvexTableName(typeName: string): string {
  return `${typeName.charAt(0).toLowerCase()}${typeName.slice(1)}`;
}

function typePatch(patch: TypeUpdatePatch): TypeUpdatePatch {
  return patch;
}

function EnumBody({
  type,
  dispatch,
}: {
  type: Extract<TypeDef, { kind: 'enum' }>;
  dispatch: (op: Op) => void;
}) {
  const rows = enumValueRows(type.values);
  const addValue = () => {
    dispatch({ kind: 'add_value', typeName: type.name, value: nextEnumValueName(type.values) });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Values</Label>
        <Button type="button" variant="ghost" size="sm" onClick={addValue} className="h-7 text-xs">
          <Plus aria-hidden="true" />
          Add value
        </Button>
      </div>
      {type.values.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No values yet. Add one before using this enum in generated schemas.
        </p>
      ) : (
        <Table className="text-xs">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-7 px-2">Value</TableHead>
              <TableHead className="h-7 px-2">Description</TableHead>
              <TableHead className="h-7 w-9 px-1 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ entry, key, isDuplicate }) => {
              const deleteDisabledReason = enumDeleteDisabledReason(
                type.values.length,
                isDuplicate,
              );
              return (
                <TableRow key={key} data-testid="enum-value-row">
                  <TableCell className="w-36 px-2 py-1.5 align-top">
                    <Input
                      aria-label={`Enum value ${entry.value}`}
                      defaultValue={entry.value}
                      disabled={isDuplicate}
                      title={
                        isDuplicate
                          ? 'Use validation repair to resolve duplicate values.'
                          : undefined
                      }
                      className="h-8 px-2 text-xs font-medium"
                      onBlur={(ev) => {
                        const next = ev.target.value.trim();
                        if (next && next !== entry.value) {
                          dispatch({
                            kind: 'update_value',
                            typeName: type.name,
                            value: entry.value,
                            patch: { value: next },
                          });
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell className="px-2 py-1.5 align-top">
                    <Input
                      aria-label={`Description for ${entry.value}`}
                      defaultValue={entry.description ?? ''}
                      disabled={isDuplicate}
                      title={
                        isDuplicate
                          ? 'Use validation repair to resolve duplicate values.'
                          : undefined
                      }
                      className="h-8 px-2 text-xs"
                      onBlur={(ev) => {
                        const next = ev.target.value;
                        if (next !== (entry.description ?? '')) {
                          dispatch({
                            kind: 'update_value',
                            typeName: type.name,
                            value: entry.value,
                            patch: { description: next || undefined },
                          });
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell className="w-9 px-1 py-1.5 text-right align-top">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete value ${entry.value}`}
                      disabled={deleteDisabledReason !== undefined}
                      title={deleteDisabledReason}
                      onClick={() =>
                        dispatch({ kind: 'remove_value', typeName: type.name, value: entry.value })
                      }
                      className="h-8 w-8 text-destructive hover:text-destructive"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function enumDeleteDisabledReason(valueCount: number, isDuplicate: boolean): string | undefined {
  if (isDuplicate) return 'Use validation repair to resolve duplicate values.';
  if (valueCount <= 1) return 'Enums need at least one value.';
  return undefined;
}

function enumValueRows(values: Extract<TypeDef, { kind: 'enum' }>['values']) {
  const totals = new Map<string, number>();
  for (const entry of values) totals.set(entry.value, (totals.get(entry.value) ?? 0) + 1);
  const seen = new Map<string, number>();
  return values.map((entry) => {
    const count = seen.get(entry.value) ?? 0;
    seen.set(entry.value, count + 1);
    return {
      entry,
      key: count === 0 ? entry.value : `${entry.value}#${count + 1}`,
      isDuplicate: (totals.get(entry.value) ?? 0) > 1,
    };
  });
}

function nextEnumValueName(values: Extract<TypeDef, { kind: 'enum' }>['values']): string {
  const existing = new Set(values.map((entry) => entry.value));
  if (!existing.has('value')) return 'value';
  for (let i = 2; i <= existing.size + 2; i++) {
    const candidate = `value${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `value${existing.size + 1}`;
}

function DiscriminatedUnionBody({
  type,
  dispatch,
  dispatchBatch,
  availableTypeNames,
  availableObjectTypeNames,
}: {
  type: Extract<TypeDef, { kind: 'discriminatedUnion' }>;
  dispatch: (op: Op) => void;
  dispatchBatch?: (ops: readonly Op[]) => void;
  availableTypeNames: readonly string[];
  availableObjectTypeNames: readonly string[];
}) {
  const [newVariant, setNewVariant] = useState('');
  const trimmedNewVariant = newVariant.trim();
  const variantAlreadyAdded = type.variants.includes(trimmedNewVariant);
  const variantTypeExists = availableTypeNames.includes(trimmedNewVariant);
  const variantObjectExists = availableObjectTypeNames.includes(trimmedNewVariant);
  const suggestedVariants = availableObjectTypeNames.filter(
    (typeName) => !type.variants.includes(typeName),
  );
  const addTypedVariant = () => {
    const variant = trimmedNewVariant;
    if (!variant || !variantObjectExists || variantAlreadyAdded) return;
    dispatch({ kind: 'add_variant', typeName: type.name, variant });
    setNewVariant('');
  };
  const createObjectVariant = () => {
    const variant = trimmedNewVariant;
    if (!variant) return;
    const ops: Op[] = [
      {
        kind: 'add_type',
        type: {
          kind: 'object',
          name: variant,
          fields: [
            {
              name: type.discriminator,
              type: { kind: 'literal', value: discriminatorLiteralValue(variant) },
            },
          ],
        },
      },
      { kind: 'add_variant', typeName: type.name, variant },
    ];
    if (dispatchBatch) {
      dispatchBatch(ops);
    } else {
      for (const op of ops) dispatch(op);
    }
    setNewVariant('');
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="du-discriminator">Discriminator field</Label>
        <Input
          id="du-discriminator"
          defaultValue={type.discriminator}
          onBlur={(ev) => {
            const next = ev.target.value.trim();
            if (next && next !== type.discriminator) {
              dispatch({ kind: 'set_discriminator', typeName: type.name, discriminator: next });
            }
          }}
        />
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Variants</Label>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
            <Input
              aria-label="New variant"
              value={newVariant}
              onChange={(ev) => setNewVariant(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter') {
                  ev.preventDefault();
                  addTypedVariant();
                }
              }}
              placeholder="Object type"
              className="h-8 w-36 px-2 text-xs"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={trimmedNewVariant === '' || variantAlreadyAdded || !variantObjectExists}
              title={addVariantDisabledReason(
                trimmedNewVariant,
                variantAlreadyAdded,
                variantTypeExists,
                variantObjectExists,
              )}
              onClick={addTypedVariant}
              className="h-8 px-2 text-xs"
            >
              <Plus aria-hidden="true" />
              Add variant
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={trimmedNewVariant === '' || variantAlreadyAdded || variantTypeExists}
              title={createObjectDisabledReason(
                trimmedNewVariant,
                variantAlreadyAdded,
                variantTypeExists,
                variantObjectExists,
              )}
              onClick={createObjectVariant}
              className="h-8 px-2 text-xs"
            >
              <Plus aria-hidden="true" />
              Create object
            </Button>
          </div>
        </div>
        {suggestedVariants.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">Available object types.</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestedVariants.map((variant) => (
                <Button
                  key={variant}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => dispatch({ kind: 'add_variant', typeName: type.name, variant })}
                  className="h-7 px-2 text-xs"
                >
                  <Plus aria-hidden="true" />
                  {variant}
                </Button>
              ))}
            </div>
          </div>
        )}
        {type.variants.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No variants yet. Add object types that include the discriminator field.
          </p>
        ) : (
          <ul className="space-y-1 text-xs">
            {type.variants.map((variant) => (
              <li
                key={variant}
                data-testid="du-variant"
                className="flex min-h-8 items-center justify-between gap-2 rounded-md border px-2 py-1"
              >
                <span className="font-medium">{variant}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove variant ${variant}`}
                  onClick={() => dispatch({ kind: 'remove_variant', typeName: type.name, variant })}
                  className="h-7 w-7 text-destructive hover:text-destructive"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RawBody({
  type,
  dispatch,
}: {
  type: Extract<TypeDef, { kind: 'raw' }>;
  dispatch: (op: Op) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor="raw-zod">Zod expression</Label>
      <Textarea
        id="raw-zod"
        defaultValue={type.zod}
        rows={4}
        onBlur={(ev) => {
          const next = ev.target.value;
          if (next !== type.zod) {
            dispatch({ kind: 'update_type', name: type.name, patch: typePatch({ zod: next }) });
          }
        }}
      />
      {type.import && (
        <p className="text-xs text-muted-foreground">
          Imported from <code>{type.import.from}</code> as <code>{type.import.name}</code>.
        </p>
      )}
    </div>
  );
}

function createObjectDisabledReason(
  variant: string,
  alreadyAdded: boolean,
  typeExists: boolean,
  objectExists: boolean,
): string | undefined {
  if (variant === '') return undefined;
  if (alreadyAdded) return 'Variant already added.';
  if (objectExists) return 'Object type already exists. Add it as a variant instead.';
  if (typeExists) return 'Type name already exists. Choose a new object name.';
  return undefined;
}

function addVariantDisabledReason(
  variant: string,
  alreadyAdded: boolean,
  typeExists: boolean,
  objectExists: boolean,
): string | undefined {
  if (variant === '') return undefined;
  if (alreadyAdded) return 'Variant already added.';
  if (objectExists) return undefined;
  if (typeExists) return 'Only object types can be added as variants.';
  return 'Create the object type first.';
}

function discriminatorLiteralValue(typeName: string): string {
  return typeName
    .replace(/([a-z0-9])([A-Z])/gu, '$1-$2')
    .replace(/[^A-Za-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .toLowerCase();
}

function FieldKindPill({ fieldType }: { fieldType: FieldType }): React.JSX.Element {
  const color = fieldKindColor(fieldType);
  return (
    <span
      className="inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none"
      style={toneSurfaceStyle(color, 13, 46)}
    >
      {summariseKind(fieldType.kind)}
    </span>
  );
}

function FieldDerivationPill({ field }: { field: FieldDef }): React.JSX.Element | null {
  if (!field.derivation) return null;
  const color =
    field.derivation.kind !== 'snapshot' &&
    (field.derivation.sources?.length ?? 0) > 0 &&
    !field.derivation.refresh &&
    !field.derivation.driftPolicy
      ? 'var(--warning)'
      : 'var(--inspector-advisory)';
  return (
    <span
      className="inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none"
      title={derivationPillTitle(field)}
      style={toneSurfaceStyle(color, 13, 46)}
    >
      {derivationKindLabel(field.derivation.kind)}
    </span>
  );
}

function derivationPillTitle(field: FieldDef): string {
  const derivation = field.derivation;
  if (!derivation) return '';
  if (derivation.kind === 'snapshot') return 'Copied at write time and intentionally frozen.';
  if ((derivation.sources?.length ?? 0) > 0 && !derivation.refresh && !derivation.driftPolicy) {
    return 'Drift risk: source data can change without a refresh or drift policy.';
  }
  return 'Derivation policy declared.';
}

function inspectorTypeColor(type: TypeDef): string {
  if (type.kind === 'object' && type.table === true) return 'var(--inspector-type-table)';
  switch (type.kind) {
    case 'object':
      return 'var(--inspector-type-object)';
    case 'enum':
      return 'var(--inspector-type-enum)';
    case 'discriminatedUnion':
      return 'var(--inspector-type-union)';
    case 'raw':
      return 'var(--inspector-type-raw)';
  }
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

function summariseKind(k: string): string {
  return k;
}
