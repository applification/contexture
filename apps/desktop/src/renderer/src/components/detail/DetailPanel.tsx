/**
 * DetailPanel — selection router.
 *
 * Reads the UI store's selection (node + optional field + edge id) and
 * the IR from the undoable store, then dispatches to the appropriate
 * kind-specific sub-panel. If nothing is selected we render an empty
 * state rather than a blank panel so new users know where to click.
 *
 * Selection semantics:
 *   - `selectedNodeId` alone → TypeDetail
 *   - `selectedNodeId` + `selectedFieldName` → FieldDetail
 *   - `selectedEdgeId` → EdgeDetail (parsed from the edge's data)
 *
 * The selection state is a UI concern; the IR lookup is a store
 * concern. Splitting them like this keeps the panel test-only on the
 * selection prop surface.
 */

import type { TypeDef } from '@contexture/core/ir';
import { analyzeModelingHints } from '@contexture/core/modeling-hints';
import { type ValidationError, validate } from '@renderer/services/validation';
import { repairForValidationError } from '@renderer/services/validation-repairs';
import { STDLIB_REGISTRY, STDLIB_TYPE_DEFINITIONS } from '@shared/stdlib-registry';
import { useMemo, useSyncExternalStore } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useChatComposerStore } from '../../store/chat-composer';
import type { Op } from '../../store/ops';
import { useGraphSelectionStore } from '../../store/selection';
import { useUIChromeStore } from '../../store/ui-chrome';
import { useUndoStore } from '../../store/undo';
import type { RefEdgeData } from '../graph/schema-to-graph';
import { EdgeDetail } from './EdgeDetail';
import { FieldDetail } from './FieldDetail';
import { FOCUS_TYPE_NAME_EVENT, TypeDetail } from './TypeDetail';

export interface Selection {
  typeName?: string;
  fieldName?: string;
  edge?: RefEdgeData;
}

export interface DetailPanelProps {
  selection: Selection;
  onClearSelection?: () => void;
  onClearSelectedField?: () => void;
  onSelectField?: (typeName: string, fieldName: string) => void;
}

export function DetailPanel({
  selection,
  onClearSelection,
  onClearSelectedField,
  onSelectField,
}: DetailPanelProps) {
  const schema = useSyncExternalStore(useUndoStore.subscribe, () => useUndoStore.getState().schema);
  const modelingHints = useMemo(() => analyzeModelingHints(schema), [schema]);
  const validationErrors = useMemo(() => validate(schema, { stdlib: STDLIB_REGISTRY }), [schema]);
  const dispatch = (op: Op) => {
    const result = useUndoStore.getState().apply(op);
    if ('error' in result) return;
    if (op.kind === 'delete_type' && op.name === selection.typeName) {
      useGraphSelectionStore.getState().clearNodes();
      onClearSelection?.();
    }
    if (
      op.kind === 'remove_field' &&
      op.typeName === selection.typeName &&
      op.fieldName === selection.fieldName
    ) {
      onClearSelectedField?.();
      useGraphSelectionStore.getState().click(op.typeName, 'replace');
      useGraphSelectionStore.getState().focus(op.typeName);
    }
    if (
      op.kind === 'update_field' &&
      op.typeName === selection.typeName &&
      op.fieldName === selection.fieldName &&
      typeof op.patch.name === 'string' &&
      op.patch.name.length > 0 &&
      op.patch.name !== selection.fieldName
    ) {
      useGraphSelectionStore
        .getState()
        .selectField({ typeName: op.typeName, fieldName: op.patch.name });
      useGraphSelectionStore.getState().focus({ nodeId: op.typeName, fieldName: op.patch.name });
      onSelectField?.(op.typeName, op.patch.name);
    }
  };
  const dispatchBatch = (ops: readonly Op[]): boolean => {
    const undo = useUndoStore.getState();
    undo.begin();
    for (const op of ops) {
      const result = useUndoStore.getState().apply(op);
      if ('error' in result) {
        useUndoStore.getState().rollback();
        return false;
      }
    }
    useUndoStore.getState().commit();
    return true;
  };
  const repairForIssue = (error: ValidationError) => {
    const repair = repairForValidationError(schema, error);
    if (!repair) return null;
    return {
      label: repair.label,
      onApply: () => {
        const result = useUndoStore.getState().apply(repair.op);
        if ('error' in result || !repair.focusTypeName) return;
        useGraphSelectionStore.getState().click(repair.focusTypeName, 'replace');
        useGraphSelectionStore.getState().focus(repair.focusTypeName);
      },
    };
  };
  const discussIssue = (error: ValidationError): void => {
    useChatComposerStore.getState().setPendingChatMessage({
      message: validationChatPrompt(error),
      context: '',
    });
    useUIChromeStore.getState().setSidebarTab('chat');
    useUIChromeStore.getState().setSidebarVisible(true);
  };

  if (selection.edge) {
    return (
      <EdgeDetail
        data={selection.edge}
        onEditField={(typeName, fieldName) => {
          useGraphSelectionStore.getState().click(typeName, 'replace');
          useGraphSelectionStore.getState().focus({ nodeId: typeName, fieldName });
          onSelectField?.(typeName, fieldName);
        }}
      />
    );
  }

  if (!selection.typeName) {
    return <EmptyState message="Select a type, field, or edge to see details." />;
  }

  const typeIndex = schema.types.findIndex((t) => t.name === selection.typeName);
  const type = schema.types[typeIndex];
  if (!type) {
    const externalType = STDLIB_TYPE_DEFINITIONS.get(selection.typeName);
    if (externalType) {
      return <ExternalTypeDetail qualifiedName={selection.typeName} type={externalType} />;
    }
    return <EmptyState message={`No type named "${selection.typeName}" in the current schema.`} />;
  }
  const typeValidationErrors = validationErrorsForType(validationErrors, typeIndex);

  if (selection.fieldName) {
    if (type.kind !== 'object') {
      return <EmptyState message="Fields only exist on object types." />;
    }
    const fieldIndex = type.fields.findIndex((f) => f.name === selection.fieldName);
    const field = type.fields[fieldIndex];
    if (!field) {
      return <EmptyState message={`No field named "${selection.fieldName}".`} />;
    }
    return (
      <FieldDetail
        typeName={type.name}
        field={field}
        dispatch={dispatch}
        onCreateRefTarget={() => createReferencedObjectType(field.name)}
        onCreateAndSelectRefTarget={(selectTarget) =>
          createReferencedObjectTypeAndSelect(field.name, selectTarget)
        }
        onBackToType={() => {
          onClearSelectedField?.();
          useGraphSelectionStore.getState().selectField(null);
          useGraphSelectionStore.getState().focus(type.name);
        }}
        validationErrors={validationErrorsForField(validationErrors, typeIndex, fieldIndex)}
        validationRepairForIssue={repairForIssue}
        onDiscussValidationIssue={discussIssue}
        availableTypeNames={schema.types
          .filter((candidate) => candidate.name !== type.name)
          .map((candidate) => candidate.name)}
        tableIndexes={type.table === true ? (type.indexes ?? []) : undefined}
        modelingHints={modelingHints.filter(
          (hint) => hint.typeName === type.name && hint.fieldName === field.name,
        )}
      />
    );
  }

  return (
    <TypeDetail
      type={type}
      schema={schema}
      dispatch={dispatch}
      dispatchBatch={dispatchBatch}
      modelingHints={modelingHints.filter((hint) => hint.typeName === type.name)}
      validationErrors={typeValidationErrors}
      validationRepairForIssue={repairForIssue}
      onDiscussValidationIssue={discussIssue}
      availableTypeNames={schema.types
        .filter((candidate) => candidate.name !== type.name)
        .map((candidate) => candidate.name)}
      availableObjectTypeNames={schema.types
        .filter((candidate) => candidate.kind === 'object' && candidate.name !== type.name)
        .map((candidate) => candidate.name)}
    />
  );

  function createReferencedObjectType(fieldName: string): string | undefined {
    const typeName = nextReferencedTypeName(useUndoStore.getState().schema, fieldName);
    const result = useUndoStore.getState().apply({
      kind: 'add_type',
      type: { kind: 'object', name: typeName, fields: [] },
    });
    if ('error' in result) return undefined;

    window.setTimeout(() => {
      useGraphSelectionStore.getState().click(typeName, 'replace');
      useGraphSelectionStore.getState().focus(typeName);
      useUIChromeStore.getState().setSidebarVisible(true);
      useUIChromeStore.getState().setSidebarTab('properties');
      document.dispatchEvent(new CustomEvent(FOCUS_TYPE_NAME_EVENT, { detail: { typeName } }));
    }, 0);

    return typeName;
  }

  function createReferencedObjectTypeAndSelect(
    fieldName: string,
    selectTarget: (typeName: string) => void,
  ): void {
    if (!selection.typeName) return;
    const selectedType = useUndoStore
      .getState()
      .schema.types.find((candidate) => candidate.name === selection.typeName);
    const selectedField =
      selectedType?.kind === 'object'
        ? selectedType.fields.find((candidate) => candidate.name === fieldName)
        : undefined;
    if (!selectedField) return;
    const typeName = nextReferencedTypeName(useUndoStore.getState().schema, fieldName);
    const fieldType =
      selectedField.type.kind === 'array'
        ? { ...selectedField.type, element: { kind: 'ref' as const, typeName } }
        : { kind: 'ref' as const, typeName };
    const completed = dispatchBatch([
      { kind: 'add_type', type: { kind: 'object', name: typeName, fields: [] } },
      {
        kind: 'update_field',
        typeName: selection.typeName,
        fieldName,
        patch: { type: fieldType },
      },
    ]);
    if (!completed) return;

    selectTarget(typeName);
    window.setTimeout(() => {
      useGraphSelectionStore.getState().click(typeName, 'replace');
      useGraphSelectionStore.getState().focus(typeName);
      useUIChromeStore.getState().setSidebarVisible(true);
      useUIChromeStore.getState().setSidebarTab('properties');
      document.dispatchEvent(new CustomEvent(FOCUS_TYPE_NAME_EVENT, { detail: { typeName } }));
    }, 0);
  }
}

function validationChatPrompt(error: ValidationError): string {
  return [
    'Help me resolve this Contexture validation issue.',
    '',
    `Code: ${error.code}`,
    `Severity: ${error.severity}`,
    `Path: ${error.path}`,
    `Message: ${error.message}`,
    error.hint ? `Hint: ${error.hint}` : null,
    '',
    'Please review the current IR and suggest the smallest safe model change. If the fix should be app-runtime owned instead of modeled, explain the runtime contract to document.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function EmptyState({ message }: { message: string }) {
  return <p className="p-4 text-xs text-muted-foreground">{message}</p>;
}

function ExternalTypeDetail({
  qualifiedName,
  type,
}: {
  qualifiedName: string;
  type: TypeDef;
}): React.JSX.Element {
  const openStdlib = (): void => {
    useUIChromeStore.getState().setSidebarVisible(true);
    useUIChromeStore.getState().setSidebarTab('stdlib');
  };

  return (
    <div className="space-y-4 p-3 pt-0" data-testid="external-type-detail">
      <header className="-mx-3 flex min-h-20 items-center justify-between border-b bg-muted/20 px-3 py-3">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            stdlib {type.kind}
          </div>
          <h2 className="truncate text-lg font-semibold leading-tight text-foreground">
            {qualifiedName}
          </h2>
          <div className="mt-1">
            <Badge variant="secondary">Read-only library type</Badge>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-3 shrink-0"
          onClick={openStdlib}
        >
          View in Stdlib
        </Button>
      </header>

      {type.description && (
        <section className="space-y-1">
          <h3 className="text-xs font-medium text-muted-foreground">Description</h3>
          <p className="text-sm text-foreground">{type.description}</p>
        </section>
      )}

      {type.kind === 'raw' && (
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">Raw schema</h3>
          <pre className="max-h-56 overflow-auto rounded-md border bg-muted/30 p-2 text-xs">
            {JSON.stringify(type.jsonSchema, null, 2)}
          </pre>
        </section>
      )}

      {type.kind === 'enum' && (
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">Values</h3>
          <div className="flex flex-wrap gap-1.5">
            {type.values.slice(0, 80).map((value) => (
              <Badge key={value.value} variant="outline">
                {value.value}
              </Badge>
            ))}
            {type.values.length > 80 && (
              <Badge variant="secondary">+{type.values.length - 80}</Badge>
            )}
          </div>
        </section>
      )}

      {type.kind === 'object' && (
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">Fields</h3>
          <div className="space-y-1">
            {type.fields.map((field) => (
              <div
                key={field.name}
                className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-2 py-1.5 text-xs"
              >
                <span className="font-medium">{field.name}</span>
                <span className="text-muted-foreground">{field.type.kind}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function validationErrorsForType(
  errors: readonly ValidationError[],
  typeIndex: number,
): ValidationError[] {
  const prefix = `types.${typeIndex}`;
  return errors.filter((error) => error.path === prefix || error.path.startsWith(`${prefix}.`));
}

function validationErrorsForField(
  errors: readonly ValidationError[],
  typeIndex: number,
  fieldIndex: number,
): ValidationError[] {
  const prefix = `types.${typeIndex}.fields.${fieldIndex}`;
  return errors.filter((error) => error.path === prefix || error.path.startsWith(`${prefix}.`));
}

function nextReferencedTypeName(
  schema: { types: ReadonlyArray<{ name: string }> },
  fieldName: string,
): string {
  const base = fieldNameToTypeName(fieldName);
  const existing = new Set(schema.types.map((type) => type.name));
  if (!existing.has(base)) return base;
  for (let i = 2; i <= existing.size + 2; i++) {
    const candidate = `${base}${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base}${existing.size + 1}`;
}

function fieldNameToTypeName(fieldName: string): string {
  const withoutId = fieldName.replace(/Ids?$/u, '');
  const words = withoutId
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean);
  const name = words.map(capitalize).join('');
  return name || 'ReferencedType';
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
