/**
 * TypeDetail — kind-dispatched detail view for a selected `TypeDef`.
 *
 * Each `TypeDef.kind` gets a purpose-built form:
 *   - `object`: name, description, field list
 *   - `enum`: name, description, values (comma-separated editor)
 *   - `discriminatedUnion`: name, description, discriminator field,
 *     variant type names
 *   - `raw`: name, description, Zod expression (editable)
 *
 * Every mutation dispatches an op through the app's undoable store so
 * direct edits interleave cleanly with chat-driven ops. Edits fire on
 * `blur` (not `change`) to avoid a history entry per keystroke.
 */
import type { IndexDef, TypeDef } from '@contexture/core/ir';
import { Plus, Trash2 } from 'lucide-react';
import { useId } from 'react';
import type { Op } from '../../store/ops';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Textarea } from '../ui/textarea';

const CONVEX_RESERVED_PREFIX_MSG = "Convex reserves names starting with '_'";

function isConvexReservedName(name: string): boolean {
  return name.startsWith('_');
}

export interface TypeDetailProps {
  type: TypeDef;
  /** Dispatch an op. In production this is `useUndoStore.getState().apply`. */
  dispatch: (op: Op) => void;
}

export function TypeDetail({ type, dispatch }: TypeDetailProps) {
  const isTable = type.kind === 'object' && type.table === true;
  const nameReserved = isTable && isConvexReservedName(type.name);

  return (
    <div className="space-y-4 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{type.name}</span>
        <span className="text-xs text-muted-foreground">{type.kind}</span>
      </div>

      <NameField type={type} dispatch={dispatch} reserved={nameReserved} />
      <DescriptionField type={type} dispatch={dispatch} />

      {type.kind === 'object' && <ObjectBody type={type} dispatch={dispatch} />}
      {type.kind === 'object' && <ConvexSection type={type} dispatch={dispatch} />}
      {type.kind === 'enum' && <EnumBody type={type} dispatch={dispatch} />}
      {type.kind === 'discriminatedUnion' && (
        <DiscriminatedUnionBody type={type} dispatch={dispatch} />
      )}
      {type.kind === 'raw' && <RawBody type={type} dispatch={dispatch} />}
    </div>
  );
}

function NameField({ type, dispatch, reserved }: TypeDetailProps & { reserved: boolean }) {
  return (
    <div className="space-y-1">
      <Label htmlFor="type-name">Name</Label>
      <Input
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
  dispatch: _dispatch,
}: {
  type: Extract<TypeDef, { kind: 'object' }>;
  dispatch: (op: Op) => void;
}) {
  if (type.fields.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No fields. Use the canvas or chat to add one.</p>
    );
  }
  const isTable = type.table === true;
  return (
    <div className="space-y-1">
      <Label>Fields</Label>
      <Table className="text-xs">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-7 px-2">Name</TableHead>
            <TableHead className="h-7 px-2 text-right">Type</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {type.fields.map((f) => {
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
                  {f.name}
                  {f.optional ? '?' : ''}
                </TableCell>
                <TableCell className="px-2 py-1.5 text-right text-muted-foreground">
                  {summariseKind(f.type.kind)}
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
}: {
  type: Extract<TypeDef, { kind: 'object' }>;
  dispatch: (op: Op) => void;
}) {
  const isTable = type.table === true;
  const indexes = type.indexes ?? [];
  const fieldNames = type.fields.map((f) => f.name);

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

      {isTable && (
        <div className="space-y-2 pt-1">
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
          {indexes.length === 0 ? (
            <p className="text-xs text-muted-foreground">No indexes yet.</p>
          ) : (
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
                {indexes.map((idx) => (
                  <IndexRow
                    key={idx.name}
                    typeName={type.name}
                    index={idx}
                    fieldNames={fieldNames}
                    dispatch={dispatch}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}

function IndexRow({
  typeName,
  index,
  fieldNames,
  dispatch,
}: {
  typeName: string;
  index: IndexDef;
  fieldNames: string[];
  dispatch: (op: Op) => void;
}) {
  const fieldGroupId = useStableDomId('index-fields');
  const fieldRequirementId = `${fieldGroupId}-requirement`;

  return (
    <TableRow data-testid="convex-index-row">
      <TableCell className="w-32 px-2 py-1.5 align-top">
        <Input
          aria-label={`Index name for ${index.name}`}
          defaultValue={index.name}
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
        <fieldset aria-describedby={fieldRequirementId} className="flex flex-wrap gap-1.5">
          <legend className="sr-only">Fields for index {index.name}</legend>
          {fieldNames.map((fname) => {
            const checked = index.fields.includes(fname);
            const locked = checked && index.fields.length === 1;
            const checkboxId = `${fieldGroupId}-${slugForDomId(fname)}`;

            return (
              <Label
                key={fname}
                htmlFor={checkboxId}
                data-checked={checked || undefined}
                className="flex min-h-7 items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 text-xs text-muted-foreground transition-colors data-[checked=true]:border-primary/40 data-[checked=true]:bg-primary/10 data-[checked=true]:text-foreground"
              >
                <Checkbox
                  id={checkboxId}
                  aria-label={`${index.name}: ${fname}`}
                  aria-describedby={locked ? fieldRequirementId : undefined}
                  checked={checked}
                  disabled={locked}
                  onCheckedChange={(v) => {
                    const want = v === true;
                    const nextFields = want
                      ? [...index.fields, fname]
                      : index.fields.filter((f) => f !== fname);
                    dispatch({
                      kind: 'update_index',
                      typeName,
                      name: index.name,
                      patch: { fields: nextFields },
                    });
                  }}
                />
                <span className="max-w-24 truncate">{fname}</span>
              </Label>
            );
          })}
        </fieldset>
        <p id={fieldRequirementId} className="mt-1 text-[11px] text-muted-foreground">
          Indexes need at least one field.
        </p>
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

function useStableDomId(prefix: string): string {
  return `${prefix}-${useId().replace(/:/g, '')}`;
}

function slugForDomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function nextIndexName(existing: IndexDef[]): string {
  const taken = new Set(existing.map((i) => i.name));
  let n = existing.length + 1;
  while (taken.has(`index${n}`)) n += 1;
  return `index${n}`;
}

function EnumBody({
  type,
  dispatch,
}: {
  type: Extract<TypeDef, { kind: 'enum' }>;
  dispatch: (op: Op) => void;
}) {
  const asText = type.values.map((v) => v.value).join(', ');
  return (
    <div className="space-y-1">
      <Label htmlFor="enum-values">Values (comma-separated)</Label>
      <Textarea
        id="enum-values"
        defaultValue={asText}
        onBlur={(ev) => {
          const next = parseCommaList(ev.target.value);
          if (
            arraysEqual(
              next,
              type.values.map((v) => v.value),
            )
          )
            return;
          // Enum-only patch: the runtime kind is narrowed by EnumBody's
          // caller, but `update_type`'s `patch` distributes across every
          // TypeDef variant so TS can't prove `values` belongs here.
          dispatch({
            kind: 'update_type',
            name: type.name,
            patch: { values: next.map((value) => ({ value })) },
          } as Op);
        }}
      />
    </div>
  );
}

function DiscriminatedUnionBody({
  type,
  dispatch,
}: {
  type: Extract<TypeDef, { kind: 'discriminatedUnion' }>;
  dispatch: (op: Op) => void;
}) {
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
      <div className="space-y-1">
        <Label>Variants</Label>
        <ul className="text-xs space-y-0.5">
          {type.variants.map((v) => (
            <li key={v} data-testid="du-variant">
              {v}
            </li>
          ))}
        </ul>
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
            // Raw-only patch; see the enum note above — cast narrows the
            // distributed union.
            dispatch({ kind: 'update_type', name: type.name, patch: { zod: next } } as Op);
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

function summariseKind(k: string): string {
  return k;
}

function parseCommaList(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x === b[i]);
}
