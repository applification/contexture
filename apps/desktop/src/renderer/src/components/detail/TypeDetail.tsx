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
import type { IndexDef, TypeDef } from '../../model/ir';
import type { DocumentMode } from '../../store/document';
import type { Op } from '../../store/ops';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

const CONVEX_RESERVED_PREFIX_MSG = "Convex reserves names starting with '_'";

function isConvexReservedName(name: string): boolean {
  return name.startsWith('_');
}

export interface TypeDetailProps {
  type: TypeDef;
  /** Dispatch an op. In production this is `useUndoStore.getState().apply`. */
  dispatch: (op: Op) => void;
  /** Document mode — `scratch` hides Convex-specific affordances. */
  mode?: DocumentMode;
}

export function TypeDetail({ type, dispatch, mode = 'scratch' }: TypeDetailProps) {
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
      {type.kind === 'object' && mode === 'project' && (
        <ConvexSection type={type} dispatch={dispatch} />
      )}
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
      <ul className="text-xs space-y-1">
        {type.fields.map((f) => {
          const reserved = isTable && isConvexReservedName(f.name);
          return (
            <li
              key={f.name}
              data-testid="object-field-summary"
              data-reserved={reserved || undefined}
              title={reserved ? CONVEX_RESERVED_PREFIX_MSG : undefined}
              className={`flex justify-between ${reserved ? 'text-destructive' : ''}`}
            >
              <span>
                {f.name}
                {f.optional ? '?' : ''}
              </span>
              <span className="text-muted-foreground">{summariseKind(f.type.kind)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ConvexSection is rendered in project mode only. TODO(#119): gate on project
// mode via a DocumentStore-derived context — always-on for now.
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
            <button
              type="button"
              onClick={addIndex}
              disabled={fieldNames.length === 0}
              className="text-xs underline disabled:opacity-40 disabled:no-underline"
            >
              Add index
            </button>
          </div>
          {indexes.length === 0 ? (
            <p className="text-xs text-muted-foreground">No indexes.</p>
          ) : (
            <ul className="space-y-2">
              {indexes.map((idx) => (
                <IndexRow
                  key={idx.name}
                  typeName={type.name}
                  index={idx}
                  fieldNames={fieldNames}
                  dispatch={dispatch}
                />
              ))}
            </ul>
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
  return (
    <li className="space-y-1 rounded border p-2" data-testid="convex-index-row">
      <div className="flex items-center gap-2">
        <Input
          aria-label={`Index name for ${index.name}`}
          defaultValue={index.name}
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
        <button
          type="button"
          aria-label={`Delete index ${index.name}`}
          onClick={() => dispatch({ kind: 'remove_index', typeName, name: index.name })}
          className="text-xs text-destructive underline"
        >
          Delete
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {fieldNames.map((fname) => {
          const checked = index.fields.includes(fname);
          return (
            <Label
              key={fname}
              htmlFor={`idx-${index.name}-${fname}`}
              className="flex items-center gap-1 text-xs"
            >
              <Checkbox
                id={`idx-${index.name}-${fname}`}
                aria-label={`${index.name}: ${fname}`}
                checked={checked}
                onCheckedChange={(v) => {
                  const want = v === true;
                  const nextFields = want
                    ? [...index.fields, fname]
                    : index.fields.filter((f) => f !== fname);
                  if (nextFields.length === 0) return;
                  dispatch({
                    kind: 'update_index',
                    typeName,
                    name: index.name,
                    patch: { fields: nextFields },
                  });
                }}
              />
              {fname}
            </Label>
          );
        })}
      </div>
    </li>
  );
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
