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
import type { TypeDef } from '../../model/ir';
import type { Op } from '../../store/ops';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

export interface TypeDetailProps {
  type: TypeDef;
  /** Dispatch an op. In production this is `useUndoStore.getState().apply`. */
  dispatch: (op: Op) => void;
}

export function TypeDetail({ type, dispatch }: TypeDetailProps) {
  return (
    <div className="space-y-4 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{type.name}</span>
        <span className="text-xs text-muted-foreground">{type.kind}</span>
      </div>

      <NameField type={type} dispatch={dispatch} />
      <DescriptionField type={type} dispatch={dispatch} />

      {type.kind === 'object' && <ObjectBody type={type} dispatch={dispatch} />}
      {type.kind === 'enum' && <EnumBody type={type} dispatch={dispatch} />}
      {type.kind === 'discriminatedUnion' && (
        <DiscriminatedUnionBody type={type} dispatch={dispatch} />
      )}
      {type.kind === 'raw' && <RawBody type={type} dispatch={dispatch} />}
    </div>
  );
}

function NameField({ type, dispatch }: TypeDetailProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor="type-name">Name</Label>
      <Input
        id="type-name"
        defaultValue={type.name}
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
  return (
    <div className="space-y-1">
      <Label>Fields</Label>
      <ul className="text-xs space-y-1">
        {type.fields.map((f) => (
          <li key={f.name} data-testid="object-field-summary" className="flex justify-between">
            <span>
              {f.name}
              {f.optional ? '?' : ''}
            </span>
            <span className="text-muted-foreground">{summariseKind(f.type.kind)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
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
