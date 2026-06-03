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
import type { FieldDef, FieldType, IndexDef, Schema, TypeDef } from '@contexture/core/ir';
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
import { Badge } from '../ui/badge';
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

      {type.kind === 'object' && <ObjectBody type={type} dispatch={dispatch} />}
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
  const indexCount = (type.indexes?.length ?? 0) + (type.searchIndexes?.length ?? 0);
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
  dispatch,
  quietControls = false,
  fieldHintsByName,
  fieldHintCount = 0,
  fieldIndexInsights,
}: {
  type: Extract<TypeDef, { kind: 'object' }>;
  dispatch: (op: Op) => void;
  quietControls?: boolean;
  fieldHintsByName?: ReadonlyMap<string, readonly ModelingHint[]>;
  fieldHintCount?: number;
  fieldIndexInsights?: ReadonlyMap<string, FieldIndexInsight>;
}) {
  const fieldOrder = type.fields.map((field) => field.name);
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
    );
  }
  const isTable = type.table === true;
  const showAdviceColumn = Boolean(fieldHintsByName && fieldHintsByName.size > 0);
  return (
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
        <Button type="button" variant="ghost" size="sm" onClick={addField} className="h-7 text-xs">
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
              Discuss in chat
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
  const searchIndexes = type.searchIndexes ?? [];
  const fieldNames = type.fields.map((f) => f.name);
  const stringFieldNames = type.fields
    .filter((field) => field.type.kind === 'string')
    .map((field) => field.name);
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

  const addSearchIndex = () => {
    const seed = stringFieldNames[0];
    if (!seed) return;
    dispatch({
      kind: 'add_search_index',
      typeName: type.name,
      searchIndex: { name: nextSearchIndexName(type), searchField: seed },
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
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <Label>Search indexes</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addSearchIndex}
                disabled={stringFieldNames.length === 0}
                className="h-7 px-2 text-xs"
              >
                <Plus aria-hidden="true" />
                Add search index
              </Button>
            </div>
            {stringFieldNames.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Add a string field before creating a search index.
              </p>
            )}
            {searchIndexes.length === 0 ? (
              <p className="text-xs text-muted-foreground">No search indexes yet.</p>
            ) : (
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-7 px-2">Search index</TableHead>
                    <TableHead className="h-7 px-2">Search field</TableHead>
                    <TableHead className="h-7 px-2">Filter fields</TableHead>
                    <TableHead className="h-7 w-9 px-1 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {searchIndexes.map((index) => (
                    <SearchIndexRow
                      key={index.name}
                      typeName={type.name}
                      index={index}
                      stringFieldNames={stringFieldNames}
                      fieldNames={fieldNames}
                      dispatch={dispatch}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchIndexRow({
  typeName,
  index,
  stringFieldNames,
  fieldNames,
  dispatch,
}: {
  typeName: string;
  index: NonNullable<Extract<TypeDef, { kind: 'object' }>['searchIndexes']>[number];
  stringFieldNames: string[];
  fieldNames: string[];
  dispatch: (op: Op) => void;
}) {
  const filterFields = index.filterFields ?? [];
  const availableFilterFields = fieldNames.filter((fieldName) => !filterFields.includes(fieldName));

  const patchSearchIndex = (
    patch: Partial<NonNullable<Extract<TypeDef, { kind: 'object' }>['searchIndexes']>[number]>,
  ) => {
    dispatch({
      kind: 'update_search_index',
      typeName,
      name: index.name,
      patch,
    });
  };

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className="px-2 py-1.5 align-top">
        <Input
          aria-label={`Search index name for ${index.name}`}
          defaultValue={index.name}
          className="h-8 px-2 text-xs"
          onBlur={(ev) => {
            const next = ev.target.value.trim();
            if (next && next !== index.name) patchSearchIndex({ name: next });
          }}
        />
        {index.staged !== undefined && (
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {index.staged ? 'staged backfill' : 'active'}
          </div>
        )}
      </TableCell>
      <TableCell className="px-2 py-1.5 align-top">
        <Select
          value={index.searchField}
          onValueChange={(searchField) => patchSearchIndex({ searchField })}
        >
          <SelectTrigger
            aria-label={`Search field for ${index.name}`}
            className="h-8 min-w-36 px-2 font-mono text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {stringFieldNames.map((fieldName) => (
              <SelectItem key={fieldName} value={fieldName}>
                {fieldName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="px-2 py-1.5 align-top">
        <div className="flex flex-wrap items-center gap-1.5">
          {filterFields.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">None</span>
          ) : (
            filterFields.map((field) => (
              <Badge
                key={field}
                variant="outline"
                className="inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 font-mono text-[11px]"
                style={toneSurfaceStyle('var(--inspector-index)', 10, 44)}
              >
                {field}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${field} from search index ${index.name}`}
                  onClick={() =>
                    patchSearchIndex({
                      filterFields: filterFields.filter((candidate) => candidate !== field),
                    })
                  }
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                >
                  <X aria-hidden="true" />
                </Button>
              </Badge>
            ))
          )}
          <IndexFieldPicker
            indexName={index.name}
            availableFieldNames={availableFilterFields}
            onSelect={(fieldName) =>
              patchSearchIndex({ filterFields: [...filterFields, fieldName] })
            }
            label="Add filter"
            ariaLabel={`Add filter field to search index ${index.name}`}
          />
        </div>
      </TableCell>
      <TableCell className="w-9 px-1 py-1.5 text-right align-top">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Delete search index ${index.name}`}
          onClick={() => dispatch({ kind: 'remove_search_index', typeName, name: index.name })}
          className="h-8 w-8 text-destructive hover:text-destructive"
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </TableCell>
    </TableRow>
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
  label = 'Add field',
  ariaLabel,
}: {
  indexName: string;
  availableFieldNames: string[];
  onSelect: (fieldName: string) => void;
  label?: string;
  ariaLabel?: string;
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
          aria-label={ariaLabel ?? `Add field to index ${indexName}`}
        >
          <Plus aria-hidden="true" />
          {label}
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

function nextSearchIndexName(type: Extract<TypeDef, { kind: 'object' }>): string {
  const taken = new Set([
    ...(type.indexes ?? []).map((index) => index.name),
    ...(type.searchIndexes ?? []).map((index) => index.name),
  ]);
  let n = (type.searchIndexes?.length ?? 0) + 1;
  while (taken.has(`search${n}`)) n += 1;
  return `search${n}`;
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
  const searchFields = new Set((type.searchIndexes ?? []).map((index) => index.searchField));
  const suggestions: SuggestedIndex[] = [];

  for (const field of type.fields) {
    if (!isIndexSuggestionField(field)) continue;
    if (searchFields.has(field.name)) continue;
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
