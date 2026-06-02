import type { Schema } from '@contexture/core/ir';
import {
  buildPlaygroundContract,
  emptyEntityValue,
  type PlaygroundArrayControl,
  type PlaygroundArrayElementControl,
  type PlaygroundControl,
  type PlaygroundEntity,
  type PlaygroundRefControl,
} from '@contexture/core/playground-contract';
import { generatePlaygroundFixtures } from '@contexture/core/playground-fixtures';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Check,
  Database,
  FileJson2,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, type FieldValues, useForm } from 'react-hook-form';
import { z } from 'zod';
import { cn } from '@/lib/utils';
import { type PlaygroundRecord, usePlaygroundStore } from '@/store/playground';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Textarea } from '../ui/textarea';

interface PlaygroundPanelProps {
  schema: Schema;
}

export function PlaygroundPanel({ schema }: PlaygroundPanelProps): React.JSX.Element {
  const [panelRef, isCompact] = useCompactPanel();
  const [formOpen, setFormOpen] = useState(false);
  const contract = useMemo(() => buildPlaygroundContract(schema), [schema]);
  const selectedTypeName = usePlaygroundStore((state) => state.selectedTypeName);
  const selectedRecordId = usePlaygroundStore((state) => state.selectedRecordId);
  const recordsByType = usePlaygroundStore((state) => state.recordsByType);
  const selectType = usePlaygroundStore((state) => state.selectType);
  const selectRecord = usePlaygroundStore((state) => state.selectRecord);
  const upsertRecord = usePlaygroundStore((state) => state.upsertRecord);
  const insertRecords = usePlaygroundStore((state) => state.insertRecords);
  const deleteRecord = usePlaygroundStore((state) => state.deleteRecord);
  const clearType = usePlaygroundStore((state) => state.clearType);
  const setScope = usePlaygroundStore((state) => state.setScope);
  const scopeId = useMemo(() => schemaScopeId(schema), [schema]);

  useEffect(() => {
    const typeNames = contract.entities.map((entity) => entity.typeName);
    setScope(scopeId, typeNames);
    if (typeNames.length > 0 && (!selectedTypeName || !typeNames.includes(selectedTypeName))) {
      selectType(typeNames[0] ?? null);
    }
  }, [contract.entities, scopeId, selectType, selectedTypeName, setScope]);

  const selectedEntity =
    contract.entities.find((entity) => entity.typeName === selectedTypeName) ??
    contract.entities[0] ??
    null;
  const records = selectedEntity ? (recordsByType[selectedEntity.typeName] ?? []) : [];
  const selectedRecord = records.find((record) => record.id === selectedRecordId) ?? null;
  const recordCount = Object.values(recordsByType).reduce((sum, list) => sum + list.length, 0);
  const formRecord = formOpen ? selectedRecord : null;
  const [seedNotice, setSeedNotice] = useState<string | null>(null);

  const openNewRecord = () => {
    if (!selectedEntity) return;
    selectRecord(selectedEntity.typeName, null);
    setFormOpen(true);
  };

  const openExistingRecord = (recordId: string) => {
    if (!selectedEntity) return;
    selectRecord(selectedEntity.typeName, recordId);
    setFormOpen(true);
  };

  const closeForm = () => setFormOpen(false);

  const seedRecords = (scope: 'current' | 'all') => {
    if (scope === 'current' && !selectedEntity) return;
    const result = generatePlaygroundFixtures(schema, {
      seed: `${scope}:${Date.now()}`,
      count: 5,
      typeNames: scope === 'current' && selectedEntity ? [selectedEntity.typeName] : undefined,
      existingRecordsByType: recordsByType,
    });
    insertRecords(result.recordsByType);
    const generatedCount = Object.values(result.recordsByType).reduce(
      (sum, list) => sum + list.length,
      0,
    );
    setSeedNotice(
      result.warnings.length > 0
        ? `Seeded ${generatedCount} records with ${result.warnings.length} warnings.`
        : `Seeded ${generatedCount} records.`,
    );
  };

  if (contract.entities.length === 0) {
    return (
      <div ref={panelRef} className="flex h-full flex-col">
        <PanelHeader recordCount={0} />
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div className="max-w-sm space-y-2">
            <Database className="mx-auto size-8 text-muted-foreground" />
            <h2 className="text-base font-semibold">No table types yet</h2>
            <p className="text-sm text-muted-foreground">
              Mark an object type as a table to create sample records and test how the model feels.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={panelRef} className="flex h-full min-h-0 flex-col overflow-hidden">
      <PanelHeader recordCount={recordCount} />
      {isCompact ? (
        <div className="flex min-h-0 flex-1 flex-col border-t">
          <EntityNav
            entities={contract.entities}
            selectedTypeName={selectedEntity?.typeName ?? null}
            recordsByType={recordsByType}
            onSelect={selectType}
            compact
          />
          {selectedEntity && (
            <section className="flex min-h-0 flex-1 flex-col">
              <EntityToolbar
                entity={selectedEntity}
                records={records}
                onNew={openNewRecord}
                onSeedCurrent={() => seedRecords('current')}
                onSeedAll={() => seedRecords('all')}
                onClear={() => clearType(selectedEntity.typeName)}
              />
              {seedNotice && (
                <SeedNotice message={seedNotice} onDismiss={() => setSeedNotice(null)} />
              )}
              <div className="relative min-h-0 flex-1">
                <RecordTable
                  entity={selectedEntity}
                  records={records}
                  selectedRecordId={selectedRecordId}
                  recordsByType={recordsByType}
                  entities={contract.entities}
                  onSelect={openExistingRecord}
                  compact
                />
                {formOpen && (
                  <PlaygroundFormOverlay
                    entity={selectedEntity}
                    record={formRecord}
                    recordsByType={recordsByType}
                    entities={contract.entities}
                    onClose={closeForm}
                    onSubmit={(value) => {
                      upsertRecord(selectedEntity.typeName, formRecord?.id ?? null, value);
                      closeForm();
                    }}
                    onDelete={
                      formRecord
                        ? () => {
                            deleteRecord(selectedEntity.typeName, formRecord.id);
                            closeForm();
                          }
                        : undefined
                    }
                  />
                )}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[12rem_minmax(0,1fr)] border-t">
          <EntityNav
            entities={contract.entities}
            selectedTypeName={selectedEntity?.typeName ?? null}
            recordsByType={recordsByType}
            onSelect={selectType}
          />
          {selectedEntity && (
            <section className="flex min-h-0 flex-col">
              <EntityToolbar
                entity={selectedEntity}
                records={records}
                onNew={openNewRecord}
                onSeedCurrent={() => seedRecords('current')}
                onSeedAll={() => seedRecords('all')}
                onClear={() => clearType(selectedEntity.typeName)}
              />
              {seedNotice && (
                <SeedNotice message={seedNotice} onDismiss={() => setSeedNotice(null)} />
              )}
              <div className="relative min-h-0 flex-1">
                <RecordTable
                  entity={selectedEntity}
                  records={records}
                  selectedRecordId={selectedRecordId}
                  recordsByType={recordsByType}
                  entities={contract.entities}
                  onSelect={openExistingRecord}
                />
                {formOpen && (
                  <PlaygroundFormOverlay
                    entity={selectedEntity}
                    record={formRecord}
                    recordsByType={recordsByType}
                    entities={contract.entities}
                    onClose={closeForm}
                    onSubmit={(value) => {
                      upsertRecord(selectedEntity.typeName, formRecord?.id ?? null, value);
                      closeForm();
                    }}
                    onDelete={
                      formRecord
                        ? () => {
                            deleteRecord(selectedEntity.typeName, formRecord.id);
                            closeForm();
                          }
                        : undefined
                    }
                  />
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export function ScopedPlaygroundWorkbench({
  schema,
  typeName,
  className,
}: {
  schema: Schema;
  typeName: string;
  className?: string;
}): React.JSX.Element | null {
  const [panelRef, isCompact] = useCompactPanel(680);
  const [formOpen, setFormOpen] = useState(false);
  const [seedNotice, setSeedNotice] = useState<string | null>(null);
  const contract = useMemo(() => buildPlaygroundContract(schema), [schema]);
  const selectedRecordId = usePlaygroundStore((state) => state.selectedRecordId);
  const recordsByType = usePlaygroundStore((state) => state.recordsByType);
  const selectRecord = usePlaygroundStore((state) => state.selectRecord);
  const upsertRecord = usePlaygroundStore((state) => state.upsertRecord);
  const insertRecords = usePlaygroundStore((state) => state.insertRecords);
  const deleteRecord = usePlaygroundStore((state) => state.deleteRecord);
  const clearType = usePlaygroundStore((state) => state.clearType);
  const setScope = usePlaygroundStore((state) => state.setScope);
  const scopeId = useMemo(() => schemaScopeId(schema), [schema]);

  useEffect(() => {
    setScope(
      scopeId,
      contract.entities.map((entity) => entity.typeName),
    );
  }, [contract.entities, scopeId, setScope]);

  const entity = contract.entities.find((candidate) => candidate.typeName === typeName) ?? null;
  if (!entity) return null;

  const records = recordsByType[entity.typeName] ?? [];
  const selectedRecord = records.find((record) => record.id === selectedRecordId) ?? null;
  const formRecord = formOpen ? selectedRecord : null;

  const openNewRecord = () => {
    selectRecord(entity.typeName, null);
    setFormOpen(true);
  };

  const openExistingRecord = (recordId: string) => {
    selectRecord(entity.typeName, recordId);
    setFormOpen(true);
  };

  const seedRecords = () => {
    const result = generatePlaygroundFixtures(schema, {
      seed: `table-workbench:${entity.typeName}:${Date.now()}`,
      count: 5,
      typeNames: [entity.typeName],
      existingRecordsByType: recordsByType,
    });
    insertRecords(result.recordsByType);
    const generatedCount = Object.values(result.recordsByType).reduce(
      (sum, list) => sum + list.length,
      0,
    );
    setSeedNotice(
      result.warnings.length > 0
        ? `Seeded ${generatedCount} records with ${result.warnings.length} warnings.`
        : `Seeded ${generatedCount} records.`,
    );
  };

  return (
    <section
      ref={panelRef}
      className={cn('flex min-h-[24rem] flex-col overflow-hidden bg-background', className)}
      aria-label={`${entity.typeName} sample records`}
    >
      <EntityToolbar
        entity={entity}
        records={records}
        onNew={openNewRecord}
        onSeedCurrent={seedRecords}
        onSeedAll={seedRecords}
        onClear={() => clearType(entity.typeName)}
        scoped
      />
      {seedNotice && <SeedNotice message={seedNotice} onDismiss={() => setSeedNotice(null)} />}
      <div
        className={cn(
          'relative grid min-h-0 flex-1 bg-muted/10',
          formOpen && !isCompact ? 'grid-cols-[minmax(0,1fr)_minmax(18rem,0.85fr)]' : 'grid-cols-1',
        )}
      >
        <div className="min-h-0">
          <RecordTable
            entity={entity}
            records={records}
            selectedRecordId={selectedRecordId}
            recordsByType={recordsByType}
            entities={contract.entities}
            onSelect={openExistingRecord}
            compact={isCompact}
          />
        </div>
        {formOpen && (
          <InlineRecordEditor
            entity={entity}
            record={formRecord}
            recordsByType={recordsByType}
            entities={contract.entities}
            onClose={() => setFormOpen(false)}
            onSubmit={(value) => {
              upsertRecord(entity.typeName, formRecord?.id ?? null, value);
              setFormOpen(false);
            }}
            onDelete={
              formRecord
                ? () => {
                    deleteRecord(entity.typeName, formRecord.id);
                    setFormOpen(false);
                  }
                : undefined
            }
            compact={isCompact}
          />
        )}
      </div>
    </section>
  );
}

function useCompactPanel(threshold = 760): readonly [RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const update = () => setIsCompact(node.getBoundingClientRect().width < threshold);
    update();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, isCompact] as const;
}

function EntityNav({
  entities,
  selectedTypeName,
  recordsByType,
  onSelect,
  compact = false,
}: {
  entities: PlaygroundEntity[];
  selectedTypeName: string | null;
  recordsByType: Record<string, PlaygroundRecord[]>;
  onSelect: (typeName: string | null) => void;
  compact?: boolean;
}): React.JSX.Element {
  if (compact) {
    const selectedEntity = entities.find((entity) => entity.typeName === selectedTypeName);
    const selectedCount = selectedEntity
      ? (recordsByType[selectedEntity.typeName]?.length ?? 0)
      : 0;

    return (
      <section className="border-b bg-muted/15 p-2">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <div className="text-xs font-medium uppercase text-muted-foreground">Entity</div>
          <Badge variant="outline">{selectedCount}</Badge>
        </div>
        <Select value={selectedTypeName ?? undefined} onValueChange={(value) => onSelect(value)}>
          <SelectTrigger aria-label="Select entity" className="bg-background">
            <SelectValue placeholder="Select entity" />
          </SelectTrigger>
          <SelectContent>
            {entities.map((entity) => {
              const count = recordsByType[entity.typeName]?.length ?? 0;
              return (
                <SelectItem key={entity.typeName} value={entity.typeName}>
                  {entity.typeName} ({count})
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </section>
    );
  }

  const buttons = entities.map((entity) => {
    const count = recordsByType[entity.typeName]?.length ?? 0;
    return (
      <button
        type="button"
        key={entity.typeName}
        onClick={() => onSelect(entity.typeName)}
        className={cn(
          'flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors',
          selectedTypeName === entity.typeName
            ? 'bg-primary/10 text-primary'
            : 'text-foreground hover:bg-muted',
        )}
      >
        <span className="min-w-0 truncate">{entity.typeName}</span>
        <Badge variant="secondary" className="ml-2 shrink-0">
          {count}
        </Badge>
      </button>
    );
  });

  return (
    <aside className="min-h-0 overflow-y-auto border-r bg-muted/15 p-2">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="text-xs font-medium uppercase text-muted-foreground">Entities</div>
      </div>
      <div className="space-y-1">{buttons}</div>
    </aside>
  );
}

function PanelHeader({ recordCount }: { recordCount: number }): React.JSX.Element {
  return (
    <header className="flex h-14 items-center justify-between px-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">Playground</h2>
        <p className="truncate text-xs text-muted-foreground">
          Create sample records from the model.
        </p>
      </div>
      <Badge variant="outline">{recordCount} records</Badge>
    </header>
  );
}

function EntityToolbar({
  entity,
  records,
  onNew,
  onSeedCurrent,
  onSeedAll,
  onClear,
  scoped = false,
}: {
  entity: PlaygroundEntity;
  records: PlaygroundRecord[];
  onNew: () => void;
  onSeedCurrent: () => void;
  onSeedAll: () => void;
  onClear: () => void;
  scoped?: boolean;
}): React.JSX.Element {
  if (scoped) {
    return (
      <div className="flex min-h-14 items-center justify-between gap-3 border-b px-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{entity.typeName}</h3>
            <Badge variant="secondary" className="shrink-0">
              {entity.tableName}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {records.length} sample {records.length === 1 ? 'record' : 'records'}
          </p>
        </div>
        {records.length === 0 ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button type="button" size="sm" className="h-8" onClick={onSeedCurrent}>
              <Sparkles aria-hidden="true" />
              Generate 5 records
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8" onClick={onNew}>
              <Plus aria-hidden="true" />
              Add manually
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" size="sm" className="h-8" onClick={onNew}>
              <Plus aria-hidden="true" />
              Add record
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Record actions"
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onSeedCurrent}>
                  <Sparkles aria-hidden="true" />
                  Generate 5 more
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onClear} className="text-destructive">
                  <RotateCcw aria-hidden="true" />
                  Clear records
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-14 items-center justify-between gap-3 border-b px-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold">{entity.typeName}</h3>
          <Badge variant="secondary" className="shrink-0">
            {entity.tableName}
          </Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {records.length} sample {records.length === 1 ? 'record' : 'records'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="New record"
          aria-label="New record"
          onClick={onNew}
        >
          <Plus aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Seed current entity"
          aria-label="Seed current entity"
          onClick={onSeedCurrent}
        >
          <Sparkles aria-hidden="true" />
        </Button>
        {!scoped && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            aria-label="Seed all entities"
            onClick={onSeedAll}
          >
            <Sparkles aria-hidden="true" />
            All
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Clear records"
          aria-label="Clear records"
          onClick={onClear}
          disabled={records.length === 0}
        >
          <RotateCcw aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function InlineRecordEditor({
  entity,
  record,
  recordsByType,
  entities,
  onSubmit,
  onDelete,
  onClose,
  compact,
}: {
  entity: PlaygroundEntity;
  record: PlaygroundRecord | null;
  recordsByType: Record<string, PlaygroundRecord[]>;
  entities: PlaygroundEntity[];
  onSubmit: (value: Record<string, unknown>) => void;
  onDelete?: () => void;
  onClose: () => void;
  compact: boolean;
}): React.JSX.Element {
  return (
    <aside
      className={cn(
        'flex min-h-0 flex-col border-l bg-background',
        compact && 'absolute inset-0 z-20 border-l-0',
      )}
    >
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b px-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">
              {record ? `Edit ${entity.typeName}` : `New ${entity.typeName}`}
            </h3>
            <Badge variant="secondary" className="shrink-0">
              {entity.tableName}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {record ? recordLabel(entity, record) : 'Create a sample record'}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Close form" onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </header>
      <div className="min-h-0 flex-1">
        <PlaygroundRecordForm
          key={`${entity.typeName}:${record?.id ?? 'new'}`}
          entity={entity}
          record={record}
          recordsByType={recordsByType}
          entities={entities}
          onSubmit={onSubmit}
          onDelete={onDelete}
        />
      </div>
    </aside>
  );
}

function SeedNotice({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2 border-b bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
      <span className="min-w-0 truncate">{message}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        aria-label="Dismiss seed notice"
        onClick={onDismiss}
      >
        <X aria-hidden="true" className="size-3" />
      </Button>
    </div>
  );
}

function PlaygroundRecordForm({
  entity,
  record,
  recordsByType,
  entities,
  onSubmit,
  onDelete,
}: {
  entity: PlaygroundEntity;
  record: PlaygroundRecord | null;
  recordsByType: Record<string, PlaygroundRecord[]>;
  entities: PlaygroundEntity[];
  onSubmit: (value: Record<string, unknown>) => void;
  onDelete?: () => void;
}): React.JSX.Element {
  const resolver = useMemo(() => zodResolver(zodSchemaForControls(entity.fields)), [entity]);
  const form = useForm<FieldValues>({
    mode: 'onChange',
    defaultValues: formValuesFor(entity, record?.value ?? emptyEntityValue(entity)),
    resolver,
  });

  return (
    <form
      className="flex h-full min-h-0 flex-col"
      onSubmit={form.handleSubmit((value) => onSubmit(normalizeSubmitValue(entity.fields, value)))}
    >
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto p-3">
        {entity.fields.map((control) => (
          <PlaygroundControlField
            key={control.fieldName}
            control={control}
            controlPath={control.fieldName}
            form={form}
            recordsByType={recordsByType}
            entities={entities}
          />
        ))}
      </FieldGroup>
      <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-background p-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => form.reset(formValuesFor(entity, emptyEntityValue(entity)))}
        >
          Reset
        </Button>
        <div className="flex items-center gap-2">
          {onDelete && (
            <Button
              type="button"
              variant="ghost"
              onClick={onDelete}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          )}
          <Button type="submit">
            <Check aria-hidden="true" />
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}

function PlaygroundFormOverlay({
  entity,
  record,
  recordsByType,
  entities,
  onSubmit,
  onDelete,
  onClose,
}: {
  entity: PlaygroundEntity;
  record: PlaygroundRecord | null;
  recordsByType: Record<string, PlaygroundRecord[]>;
  entities: PlaygroundEntity[];
  onSubmit: (value: Record<string, unknown>) => void;
  onDelete?: () => void;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-background">
      <header className="flex min-h-14 items-center justify-between gap-3 border-b px-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">
              {record ? `Edit ${entity.typeName}` : `New ${entity.typeName}`}
            </h3>
            <Badge variant="secondary" className="shrink-0">
              {entity.tableName}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {record ? recordLabel(entity, record) : 'Create a sample record'}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Close form"
          aria-label="Close form"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </header>
      <div className="min-h-0 flex-1">
        <PlaygroundRecordForm
          key={`${entity.typeName}:${record?.id ?? 'new'}`}
          entity={entity}
          record={record}
          recordsByType={recordsByType}
          entities={entities}
          onSubmit={onSubmit}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

function PlaygroundControlField({
  control,
  controlPath,
  form,
  recordsByType,
  entities,
}: {
  control: PlaygroundControl;
  controlPath: string;
  form: ReturnType<typeof useForm<FieldValues>>;
  recordsByType: Record<string, PlaygroundRecord[]>;
  entities: PlaygroundEntity[];
}): React.JSX.Element {
  if (control.serverDerived) {
    return (
      <Field>
        <FieldLabel>{control.label}</FieldLabel>
        <Input value="Server derived" disabled />
        <FieldDescription>This field is generated by the runtime.</FieldDescription>
      </Field>
    );
  }

  if (control.kind === 'object') {
    return (
      <div className="rounded-md border bg-muted/10 p-3">
        <div className="mb-3">
          <div className="text-sm font-medium">{control.label}</div>
          {control.description && (
            <p className="text-xs text-muted-foreground">{control.description}</p>
          )}
        </div>
        <FieldGroup>
          {control.fields.map((field) => (
            <PlaygroundControlField
              key={field.fieldName}
              control={field}
              controlPath={`${controlPath}.${field.fieldName}`}
              form={form}
              recordsByType={recordsByType}
              entities={entities}
            />
          ))}
        </FieldGroup>
      </div>
    );
  }

  if (control.kind === 'boolean') {
    return (
      <Controller
        name={controlPath}
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <div className="flex items-start gap-2">
              <Checkbox
                id={controlPath}
                checked={field.value === true}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                aria-invalid={fieldState.invalid}
              />
              <div className="grid gap-1">
                <FieldLabel htmlFor={controlPath}>{control.label}</FieldLabel>
                {control.description && <FieldDescription>{control.description}</FieldDescription>}
                <FieldError errors={[fieldState.error]} />
              </div>
            </div>
          </Field>
        )}
      />
    );
  }

  if (control.kind === 'enum') {
    return (
      <Controller
        name={controlPath}
        control={form.control}
        rules={rulesFor(control)}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={controlPath}>{control.label}</FieldLabel>
            <Select value={field.value ?? ''} onValueChange={field.onChange}>
              <SelectTrigger id={controlPath} aria-invalid={fieldState.invalid}>
                <SelectValue placeholder="Select value" />
              </SelectTrigger>
              <SelectContent>
                {control.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {control.description && <FieldDescription>{control.description}</FieldDescription>}
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    );
  }

  if (control.kind === 'ref') {
    return (
      <RefField
        control={control}
        controlPath={controlPath}
        form={form}
        recordsByType={recordsByType}
        entities={entities}
      />
    );
  }

  if (control.kind === 'array') {
    return <ArrayField control={control} controlPath={controlPath} form={form} />;
  }

  if (control.kind === 'unsupported') {
    return (
      <Field>
        <FieldLabel>{control.label}</FieldLabel>
        <Input value={control.reason} disabled />
      </Field>
    );
  }

  return (
    <Controller
      name={controlPath}
      control={form.control}
      rules={rulesFor(control)}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={controlPath}>{control.label}</FieldLabel>
          <Input
            id={controlPath}
            value={field.value ?? ''}
            type={inputTypeFor(control)}
            min={control.constraints.min}
            max={control.constraints.max}
            readOnly={control.kind === 'literal'}
            aria-invalid={fieldState.invalid}
            onChange={(event) => {
              if (control.kind === 'number') {
                field.onChange(event.target.value === '' ? '' : Number(event.target.value));
                return;
              }
              field.onChange(event.target.value);
            }}
          />
          {control.description && <FieldDescription>{control.description}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

function RefField({
  control,
  controlPath,
  form,
  recordsByType,
  entities,
}: {
  control: PlaygroundRefControl;
  controlPath: string;
  form: ReturnType<typeof useForm<FieldValues>>;
  recordsByType: Record<string, PlaygroundRecord[]>;
  entities: PlaygroundEntity[];
}): React.JSX.Element {
  const targetEntity = entities.find((entity) => entity.typeName === control.targetTypeName);
  const records = recordsByType[control.targetTypeName] ?? [];

  return (
    <Controller
      name={controlPath}
      control={form.control}
      rules={rulesFor(control)}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={controlPath}>{control.label}</FieldLabel>
          <Select value={field.value ?? ''} onValueChange={field.onChange}>
            <SelectTrigger id={controlPath} aria-invalid={fieldState.invalid}>
              <SelectValue placeholder={`Select ${control.targetTypeName}`} />
            </SelectTrigger>
            <SelectContent>
              {records.map((record) => (
                <SelectItem key={record.id} value={record.id}>
                  {targetEntity ? recordLabel(targetEntity, record) : record.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            {records.length === 0
              ? `Create a ${control.targetTypeName} record before linking this field.`
              : `Links to ${control.targetTypeName}.`}
          </FieldDescription>
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

function ArrayField({
  control,
  controlPath,
  form,
}: {
  control: PlaygroundArrayControl;
  controlPath: string;
  form: ReturnType<typeof useForm<FieldValues>>;
}): React.JSX.Element {
  return (
    <Controller
      name={controlPath}
      control={form.control}
      rules={{
        validate: (value) => {
          if (!control.required && !value) return true;
          try {
            const parsed = JSON.parse(String(value || '[]'));
            if (!Array.isArray(parsed)) return 'Enter a JSON array.';
            if (control.min !== undefined && parsed.length < control.min) {
              return `Use at least ${control.min} items.`;
            }
            if (control.max !== undefined && parsed.length > control.max) {
              return `Use at most ${control.max} items.`;
            }
            return true;
          } catch {
            return 'Enter valid JSON.';
          }
        },
      }}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor={controlPath}>{control.label}</FieldLabel>
            <Badge variant="outline" className="gap-1">
              <FileJson2 className="size-3" />
              JSON
            </Badge>
          </div>
          <Textarea
            id={controlPath}
            value={
              typeof field.value === 'string'
                ? field.value
                : JSON.stringify(field.value ?? [], null, 2)
            }
            rows={4}
            className="font-mono text-xs"
            aria-invalid={fieldState.invalid}
            onChange={field.onChange}
          />
          {control.description && <FieldDescription>{control.description}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

function RecordTable({
  entity,
  records,
  selectedRecordId,
  onSelect,
  recordsByType,
  entities,
  compact = false,
}: {
  entity: PlaygroundEntity;
  records: PlaygroundRecord[];
  selectedRecordId: string | null;
  onSelect: (recordId: string) => void;
  recordsByType: Record<string, PlaygroundRecord[]>;
  entities: PlaygroundEntity[];
  compact?: boolean;
}): React.JSX.Element {
  const columns = recordTableColumns(entity, compact ? 3 : 5);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-muted/10">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="text-xs font-medium uppercase text-muted-foreground">Records</div>
        <Badge variant="outline">{records.length}</Badge>
      </div>
      {records.length === 0 ? (
        <div className="grid min-h-0 flex-1 place-items-center px-4 py-8 text-center">
          <div className="max-w-64 space-y-1">
            <p className="text-sm font-medium">No sample records yet</p>
            <p className="text-xs text-muted-foreground">
              Use the plus button to create the first {entity.typeName} record.
            </p>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <Table className="min-w-[34rem] text-xs">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-40">Record</TableHead>
                {columns.map((control) => (
                  <TableHead key={control.fieldName} className="min-w-28">
                    {control.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow
                  key={record.id}
                  onClick={() => onSelect(record.id)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    onSelect(record.id);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Edit ${recordLabel(entity, record)}`}
                  className={cn(
                    'cursor-pointer',
                    selectedRecordId === record.id && 'bg-primary/10 hover:bg-primary/10',
                  )}
                >
                  <TableCell className="max-w-40">
                    <div className="truncate font-medium">{recordLabel(entity, record)}</div>
                    <div className="truncate text-muted-foreground">{record.id.slice(0, 8)}</div>
                  </TableCell>
                  {columns.map((control) => (
                    <TableCell key={control.fieldName} className="max-w-36 truncate">
                      {formatRecordValue(
                        control,
                        record.value[control.fieldName],
                        recordsByType,
                        entities,
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function recordTableColumns(entity: PlaygroundEntity, limit: number): readonly PlaygroundControl[] {
  const display = entity.displayFieldName
    ? entity.fields.find((field) => field.fieldName === entity.displayFieldName)
    : undefined;
  const fields = entity.fields.filter(
    (field) =>
      !field.serverDerived &&
      field.fieldName !== entity.displayFieldName &&
      field.kind !== 'object' &&
      field.kind !== 'array' &&
      field.kind !== 'unsupported',
  );
  return [display, ...fields]
    .filter((field): field is PlaygroundControl => Boolean(field))
    .slice(0, limit);
}

function formatRecordValue(
  control: PlaygroundControl,
  value: unknown,
  recordsByType: Record<string, PlaygroundRecord[]>,
  entities: readonly PlaygroundEntity[],
): string {
  if (value === undefined || value === null || value === '') return '-';
  if (control.kind === 'boolean') return value === true ? 'Yes' : 'No';
  if (control.kind === 'ref' && typeof value === 'string') {
    const targetEntity = entities.find((entity) => entity.typeName === control.targetTypeName);
    const targetRecord = recordsByType[control.targetTypeName]?.find(
      (record) => record.id === value,
    );
    return targetEntity && targetRecord
      ? recordLabel(targetEntity, targetRecord)
      : value.slice(0, 8);
  }
  if (Array.isArray(value)) return `${value.length} items`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function rulesFor(control: PlaygroundControl) {
  const rules: {
    required?: string;
    minLength?: { value: number; message: string };
    maxLength?: { value: number; message: string };
    min?: { value: number; message: string };
    max?: { value: number; message: string };
    pattern?: { value: RegExp; message: string };
    validate?: (value: unknown) => true | string;
  } = {};

  if (control.required) rules.required = `${control.label} is required.`;
  if (control.kind === 'text') {
    if (control.constraints.min !== undefined) {
      rules.minLength = {
        value: control.constraints.min,
        message: `Use at least ${control.constraints.min} characters.`,
      };
    }
    if (control.constraints.max !== undefined) {
      rules.maxLength = {
        value: control.constraints.max,
        message: `Use at most ${control.constraints.max} characters.`,
      };
    }
    if (control.constraints.regex) {
      rules.pattern = {
        value: new RegExp(control.constraints.regex),
        message: 'Use the required format.',
      };
    }
  }
  if (control.kind === 'number') {
    if (control.constraints.min !== undefined) {
      rules.min = {
        value: control.constraints.min,
        message: `Use ${control.constraints.min} or more.`,
      };
    }
    if (control.constraints.max !== undefined) {
      rules.max = {
        value: control.constraints.max,
        message: `Use ${control.constraints.max} or less.`,
      };
    }
    if (control.constraints.int) {
      rules.validate = (value) => Number.isInteger(Number(value)) || 'Use a whole number.';
    }
  }
  if (control.kind === 'literal') {
    rules.validate = (value) =>
      value === control.constraints.literalValue ||
      `Must equal ${String(control.constraints.literalValue)}.`;
  }

  return rules;
}

function inputTypeFor(control: PlaygroundControl): string {
  if (control.kind === 'number') return 'number';
  if (control.kind === 'date') return 'date';
  if (control.kind === 'text' && control.constraints.format === 'email') return 'email';
  if (control.kind === 'text' && control.constraints.format === 'url') return 'url';
  return 'text';
}

function formValuesFor(entity: PlaygroundEntity, value: Record<string, unknown>): FieldValues {
  return arrayValuesToJson(entity.fields, value);
}

function arrayValuesToJson(
  controls: readonly PlaygroundControl[],
  value: Record<string, unknown>,
): FieldValues {
  const next: FieldValues = { ...value };
  for (const control of controls) {
    if (control.kind === 'array') {
      next[control.fieldName] = JSON.stringify(value[control.fieldName] ?? [], null, 2);
    }
    if (control.kind === 'object') {
      next[control.fieldName] = arrayValuesToJson(
        control.fields,
        (value[control.fieldName] as Record<string, unknown> | undefined) ?? {},
      );
    }
  }
  return next;
}

function normalizeSubmitValue(
  controls: readonly PlaygroundControl[],
  value: FieldValues,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const control of controls) {
    const raw = value[control.fieldName];
    if (!control.required && (raw === '' || raw === undefined || raw === null)) continue;
    if (control.kind === 'array') {
      next[control.fieldName] = JSON.parse(String(raw || '[]'));
      continue;
    }
    if (control.kind === 'object') {
      next[control.fieldName] = normalizeSubmitValue(
        control.fields,
        (raw as FieldValues | undefined) ?? {},
      );
      continue;
    }
    next[control.fieldName] = raw;
  }
  return next;
}

function zodSchemaForControls(controls: readonly PlaygroundControl[]): z.ZodObject<z.ZodRawShape> {
  const shape: Record<string, z.ZodType> = {};
  for (const control of controls) {
    shape[control.fieldName] = zodSchemaForControl(control);
  }
  return z.object(shape);
}

function zodSchemaForControl(control: PlaygroundControl): z.ZodType {
  let schema: z.ZodType;

  switch (control.kind) {
    case 'text': {
      let stringSchema = z.string();
      if (control.required && !control.serverDerived && control.constraints.min === undefined)
        stringSchema = stringSchema.min(1, 'Required.');
      if (control.constraints.min !== undefined)
        stringSchema = stringSchema.min(control.constraints.min);
      if (control.constraints.max !== undefined)
        stringSchema = stringSchema.max(control.constraints.max);
      if (control.constraints.regex)
        stringSchema = stringSchema.regex(new RegExp(control.constraints.regex));
      if (control.constraints.format === 'email') stringSchema = stringSchema.email();
      if (control.constraints.format === 'url') stringSchema = stringSchema.url();
      if (control.constraints.format === 'uuid') stringSchema = stringSchema.uuid();
      if (control.constraints.format === 'datetime') stringSchema = stringSchema.datetime();
      schema = stringSchema;
      break;
    }
    case 'number': {
      let numberSchema = z.number();
      if (control.constraints.int) numberSchema = numberSchema.int();
      if (control.constraints.min !== undefined)
        numberSchema = numberSchema.min(control.constraints.min);
      if (control.constraints.max !== undefined)
        numberSchema = numberSchema.max(control.constraints.max);
      schema = z.preprocess((value) => {
        if (value === '') return undefined;
        return typeof value === 'number' ? value : Number(value);
      }, numberSchema);
      break;
    }
    case 'boolean':
      schema = z.boolean();
      break;
    case 'date':
      schema = requiredStringSchema(control);
      break;
    case 'literal':
      schema = z.literal(control.constraints.literalValue);
      break;
    case 'enum':
      schema =
        control.options.length > 0
          ? z.enum(control.options.map((option) => option.value) as [string, ...string[]])
          : z.string();
      break;
    case 'ref':
      schema = requiredStringSchema(control);
      break;
    case 'array':
      schema = z.string().superRefine((value, ctx) => {
        const parsed = parseJsonArray(value);
        if (!parsed.ok) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid JSON array.' });
          return;
        }
        if (control.min !== undefined && parsed.value.length < control.min) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Enter at least ${control.min} items.`,
          });
          return;
        }
        if (control.max !== undefined && parsed.value.length > control.max) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Enter at most ${control.max} items.`,
          });
          return;
        }
        const elementSchema = zodSchemaForArrayElement(control.element);
        for (const [index, item] of parsed.value.entries()) {
          if (!elementSchema.safeParse(item).success) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Item ${index + 1} does not match the array element type.`,
            });
            return;
          }
        }
      });
      break;
    case 'object':
      schema = zodSchemaForControls(control.fields);
      break;
    case 'unsupported':
      schema = z.unknown();
      break;
  }

  if (control.nullable) schema = schema.nullable();
  if (!control.required || control.serverDerived)
    schema = emptyStringToUndefined(schema.optional());
  return schema;
}

function requiredStringSchema(control: PlaygroundControl): z.ZodString {
  return control.required && !control.serverDerived ? z.string().min(1, 'Required.') : z.string();
}

function zodSchemaForArrayElement(element: PlaygroundArrayElementControl): z.ZodType {
  switch (element.kind) {
    case 'text': {
      let stringSchema = z.string();
      if (element.constraints.min !== undefined)
        stringSchema = stringSchema.min(element.constraints.min);
      if (element.constraints.max !== undefined)
        stringSchema = stringSchema.max(element.constraints.max);
      if (element.constraints.regex)
        stringSchema = stringSchema.regex(new RegExp(element.constraints.regex));
      if (element.constraints.format === 'email') stringSchema = stringSchema.email();
      if (element.constraints.format === 'url') stringSchema = stringSchema.url();
      if (element.constraints.format === 'uuid') stringSchema = stringSchema.uuid();
      if (element.constraints.format === 'datetime') stringSchema = stringSchema.datetime();
      return stringSchema;
    }
    case 'number': {
      let numberSchema = z.number();
      if (element.constraints.int) numberSchema = numberSchema.int();
      if (element.constraints.min !== undefined)
        numberSchema = numberSchema.min(element.constraints.min);
      if (element.constraints.max !== undefined)
        numberSchema = numberSchema.max(element.constraints.max);
      return numberSchema;
    }
    case 'boolean':
      return z.boolean();
    case 'date':
    case 'ref':
      return z.string().min(1);
    case 'literal':
      return z.literal(element.constraints.literalValue);
    case 'enum':
      return element.options.length > 0
        ? z.enum(element.options.map((option) => option.value) as [string, ...string[]])
        : z.string();
    case 'array':
      return z.array(zodSchemaForArrayElement(element.element));
    case 'object':
      return zodSchemaForControls(element.fields);
    case 'unsupported':
      return z.unknown();
  }
}

function parseJsonArray(value: string): { ok: true; value: unknown[] } | { ok: false } {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? { ok: true, value: parsed } : { ok: false };
  } catch {
    return { ok: false };
  }
}

function emptyStringToUndefined(schema: z.ZodType): z.ZodType {
  return z.preprocess((value) => (value === '' ? undefined : value), schema);
}

function schemaScopeId(schema: Schema): string {
  return `schema:${JSON.stringify(schema)}`;
}

function recordLabel(entity: PlaygroundEntity, record: PlaygroundRecord): string {
  const displayValue: string | null =
    entity.displayFieldName && typeof record.value[entity.displayFieldName] === 'string'
      ? String(record.value[entity.displayFieldName])
      : null;
  return displayValue || `${entity.typeName} ${record.id.slice(0, 8)}`;
}
