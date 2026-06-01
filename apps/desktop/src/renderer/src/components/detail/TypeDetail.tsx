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

import { listFixtureModules } from '@contexture/core/fixture-generators';
import type { FieldDef, FieldType, IndexDef, TypeDef } from '@contexture/core/ir';
import type { ModelingHint } from '@contexture/core/modeling-hints';
import type { TypeUpdatePatch } from '@contexture/core/ops';
import type { ValidationError } from '@renderer/services/validation';
import { useGraphSelectionStore } from '@renderer/store/selection';
import { ChevronDown, ChevronUp, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { Op } from '../../store/ops';
import { nextFieldName } from '../graph/interactions';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Textarea } from '../ui/textarea';
import { ModelShapeHints } from './ModelShapeHints';
import { type ValidationIssueRepair, ValidationIssues } from './ValidationIssues';

const CONVEX_RESERVED_PREFIX_MSG = "Convex reserves names starting with '_'";
export const FOCUS_TYPE_NAME_EVENT = 'contexture:focus-type-name';
const AUTO_SAMPLE_DATA = '__auto__';

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

  return (
    <div className="space-y-4 p-3 pt-0">
      <header
        className="-mx-3 flex min-h-20 items-center justify-between border-b bg-muted/20 px-3 py-3"
        data-testid="type-detail-header"
      >
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
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

function SampleDataSection({ type, dispatch }: TypeDetailProps) {
  const modules = listFixtureModules();
  const category = type.sampleData?.category ?? AUTO_SAMPLE_DATA;

  return (
    <section className="space-y-2 rounded-md border border-border px-3 py-2">
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
}: {
  type: Extract<TypeDef, { kind: 'object' }>;
  dispatch: (op: Op) => void;
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
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label>Fields</Label>
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
            <TableHead className="h-7 w-28 px-1 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {type.fields.map((f, fieldIndex) => {
            const reserved = isTable && isConvexReservedName(f.name);
            return (
              <TableRow
                key={f.name}
                data-testid="object-field-summary"
                data-reserved={reserved || undefined}
                title={reserved ? CONVEX_RESERVED_PREFIX_MSG : undefined}
                className={reserved ? 'text-destructive' : undefined}
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
                <TableCell className="px-2 py-1.5 text-right text-muted-foreground">
                  {summariseKind(f.type.kind)}
                </TableCell>
                <TableCell className="w-28 px-1 py-1.5 text-right">
                  <div className="inline-flex items-center gap-0.5">
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
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
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
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground">
                Suggested from refs and likely lookup fields.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((suggestion) => (
                  <Button
                    key={suggestion.name}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      dispatch({
                        kind: 'add_index',
                        typeName: type.name,
                        index: { name: suggestion.name, fields: suggestion.fields },
                      })
                    }
                    className="h-7 px-2 text-xs"
                  >
                    <Plus aria-hidden="true" />
                    {suggestion.name}
                  </Button>
                ))}
              </div>
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
    <span className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-md border border-primary/35 bg-primary/10 px-1.5 text-xs text-foreground">
      <span className="sr-only">
        {fieldName}, field {displayPosition} of {total} in index {indexName}
      </span>
      <span className="rounded bg-primary/15 px-1 font-mono text-[10px] text-primary">
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

function isIndexSuggestionField(field: FieldDef): boolean {
  if (hasRef(field.type)) return true;
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

function summariseKind(k: string): string {
  return k;
}
