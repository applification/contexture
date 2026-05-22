import type { Schema, TypeDef } from './ir';
import { save } from './load';
import { bundlePathsFor } from './paths';
import { hashContent } from './pipeline';

export type ModelChangeSource =
  | 'desktop'
  | 'mcp'
  | 'cli'
  | 'schema_agent'
  | 'reconcile'
  | 'external';

export type ModelChangeReason =
  | 'op_applied'
  | 'replace_schema'
  | 'raw_file_change'
  | 'external_sync_accepted'
  | 'generated_emit';

export interface ModelChangeRename {
  from: string;
  to: string;
}

export interface ModelChangeLogEntry {
  id: string;
  irPath: string;
  source: ModelChangeSource;
  reason: ModelChangeReason;
  opKind?: string;
  changedTypes: string[];
  addedTypes: string[];
  removedTypes: string[];
  renamedTypes: ModelChangeRename[];
  changeCount: number;
  beforeHash?: string;
  afterHash: string;
  createdAt: string;
  actor?: string;
  summary?: string;
}

export interface ModelChangeLog {
  version: '1';
  entries: ModelChangeLogEntry[];
}

export interface ModelChangeLogFs {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
}

export interface ModelChangeSummary {
  changedTypes: string[];
  addedTypes: string[];
  removedTypes: string[];
  renamedTypes: ModelChangeRename[];
  changeCount: number;
  summary: string;
}

export interface BuildModelChangeLogEntryInput {
  irPath: string;
  source: ModelChangeSource;
  reason: ModelChangeReason;
  before?: Schema;
  after: Schema;
  opKind?: string;
  actor?: string;
  createdAt?: string;
  id?: string;
  summary?: string;
}

export interface AppendModelChangeLogEntryInput {
  irPath: string;
  fs: ModelChangeLogFs;
  entry: ModelChangeLogEntry;
  limit?: number;
}

export interface LoadModelChangeLogResult {
  log: ModelChangeLog;
  warnings: string[];
}

export const DEFAULT_CHANGE_LOG_LIMIT = 200;

export function changeLogPathFor(irPath: string): string {
  return bundlePathsFor(irPath).changeLog;
}

export function schemaHash(schema: Schema): string {
  return hashContent(save(schema));
}

export function summarizeModelChange(
  before: Schema | undefined,
  after: Schema,
): ModelChangeSummary {
  if (!before) {
    const addedTypes = after.types.map((type) => type.name);
    return {
      changedTypes: [],
      addedTypes,
      removedTypes: [],
      renamedTypes: [],
      changeCount: addedTypes.length,
      summary: summarizeWords({ addedTypes }),
    };
  }

  const beforeByName = new Map(before.types.map((type) => [type.name, type] as const));
  const afterByName = new Map(after.types.map((type) => [type.name, type] as const));
  let addedTypes = after.types
    .filter((type) => !beforeByName.has(type.name))
    .map((type) => type.name);
  let removedTypes = before.types
    .filter((type) => !afterByName.has(type.name))
    .map((type) => type.name);
  const renamedTypes = inferRenames(before, after, removedTypes, addedTypes);
  if (renamedTypes.length > 0) {
    const renamedFrom = new Set(renamedTypes.map((rename) => rename.from));
    const renamedTo = new Set(renamedTypes.map((rename) => rename.to));
    removedTypes = removedTypes.filter((name) => !renamedFrom.has(name));
    addedTypes = addedTypes.filter((name) => !renamedTo.has(name));
  }

  const changedTypes = after.types
    .filter((type) => {
      const previous = beforeByName.get(type.name);
      return previous !== undefined && stableStringify(previous) !== stableStringify(type);
    })
    .map((type) => type.name);

  const changeCount =
    changedTypes.length + addedTypes.length + removedTypes.length + renamedTypes.length;

  return {
    changedTypes,
    addedTypes,
    removedTypes,
    renamedTypes,
    changeCount,
    summary: summarizeWords({ changedTypes, addedTypes, removedTypes, renamedTypes }),
  };
}

export function buildModelChangeLogEntry(
  input: BuildModelChangeLogEntryInput,
): ModelChangeLogEntry {
  const summary = summarizeModelChange(input.before, input.after);
  return {
    id: input.id ?? makeChangeLogId(input.createdAt),
    irPath: input.irPath,
    source: input.source,
    reason: input.reason,
    ...(input.opKind ? { opKind: input.opKind } : {}),
    changedTypes: summary.changedTypes,
    addedTypes: summary.addedTypes,
    removedTypes: summary.removedTypes,
    renamedTypes: summary.renamedTypes,
    changeCount: summary.changeCount,
    ...(input.before ? { beforeHash: schemaHash(input.before) } : {}),
    afterHash: schemaHash(input.after),
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...(input.actor ? { actor: input.actor } : {}),
    summary: input.summary ?? summary.summary,
  };
}

export async function loadModelChangeLog(
  irPath: string,
  fs: Pick<ModelChangeLogFs, 'readFile'>,
): Promise<LoadModelChangeLogResult> {
  try {
    const raw = await fs.readFile(changeLogPathFor(irPath));
    const parsed = JSON.parse(raw);
    return parseModelChangeLog(parsed);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { log: emptyModelChangeLog(), warnings: [] };
    }
    return {
      log: emptyModelChangeLog(),
      warnings: [err instanceof Error ? err.message : String(err)],
    };
  }
}

export async function appendModelChangeLogEntry(
  input: AppendModelChangeLogEntryInput,
): Promise<ModelChangeLog> {
  const loaded = await loadModelChangeLog(input.irPath, input.fs);
  const next = pruneModelChangeLog(
    {
      version: '1',
      entries: [input.entry, ...loaded.log.entries.filter((entry) => entry.id !== input.entry.id)],
    },
    input.limit ?? DEFAULT_CHANGE_LOG_LIMIT,
  );
  await input.fs.writeFile(changeLogPathFor(input.irPath), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export function pruneModelChangeLog(
  log: ModelChangeLog,
  limit = DEFAULT_CHANGE_LOG_LIMIT,
): ModelChangeLog {
  return { version: '1', entries: log.entries.slice(0, Math.max(0, limit)) };
}

export function emptyModelChangeLog(): ModelChangeLog {
  return { version: '1', entries: [] };
}

function parseModelChangeLog(value: unknown): LoadModelChangeLogResult {
  const warnings: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { log: emptyModelChangeLog(), warnings: ['Change log is not an object.'] };
  }
  const record = value as { version?: unknown; entries?: unknown };
  if (record.version !== '1') {
    warnings.push('Change log version is not supported.');
  }
  if (!Array.isArray(record.entries)) {
    return { log: emptyModelChangeLog(), warnings: [...warnings, 'Change log entries missing.'] };
  }
  const entries: ModelChangeLogEntry[] = [];
  let invalidCount = 0;
  for (const entry of record.entries) {
    const parsed = parseEntry(entry);
    if (parsed) entries.push(parsed);
    else invalidCount += 1;
  }
  if (invalidCount > 0) warnings.push(`${invalidCount} change log entries could not be read.`);
  return { log: { version: '1', entries }, warnings };
}

function parseEntry(value: unknown): ModelChangeLogEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.irPath !== 'string' ||
    !isSource(record.source) ||
    !isReason(record.reason) ||
    !Array.isArray(record.changedTypes) ||
    !Array.isArray(record.addedTypes) ||
    !Array.isArray(record.removedTypes) ||
    !Array.isArray(record.renamedTypes) ||
    typeof record.changeCount !== 'number' ||
    typeof record.afterHash !== 'string' ||
    typeof record.createdAt !== 'string'
  ) {
    return null;
  }
  const entry: ModelChangeLogEntry = {
    id: record.id,
    irPath: record.irPath,
    source: record.source,
    reason: record.reason,
    changedTypes: record.changedTypes.filter(isString),
    addedTypes: record.addedTypes.filter(isString),
    removedTypes: record.removedTypes.filter(isString),
    renamedTypes: record.renamedTypes.filter(isRename),
    changeCount: record.changeCount,
    afterHash: record.afterHash,
    createdAt: record.createdAt,
  };
  if (typeof record.opKind === 'string') entry.opKind = record.opKind;
  if (typeof record.beforeHash === 'string') entry.beforeHash = record.beforeHash;
  if (typeof record.actor === 'string') entry.actor = record.actor;
  if (typeof record.summary === 'string') entry.summary = record.summary;
  return entry;
}

function inferRenames(
  before: Schema,
  after: Schema,
  removedTypes: string[],
  addedTypes: string[],
): ModelChangeRename[] {
  if (removedTypes.length === 0 || addedTypes.length === 0) return [];
  const beforeByName = new Map(before.types.map((type) => [type.name, type] as const));
  const afterByName = new Map(after.types.map((type) => [type.name, type] as const));
  const renames: ModelChangeRename[] = [];
  const remainingAdded = new Set(addedTypes);

  for (const from of removedTypes) {
    const previous = beforeByName.get(from);
    if (!previous) continue;
    const match = [...remainingAdded].find((to) => {
      const next = afterByName.get(to);
      return next ? sameExceptName(previous, next) : false;
    });
    if (!match) continue;
    remainingAdded.delete(match);
    renames.push({ from, to: match });
  }
  return renames;
}

function sameExceptName(left: TypeDef, right: TypeDef): boolean {
  return stableStringify({ ...left, name: '' }) === stableStringify({ ...right, name: '' });
}

function summarizeWords(input: {
  changedTypes?: string[];
  addedTypes?: string[];
  removedTypes?: string[];
  renamedTypes?: ModelChangeRename[];
}): string {
  const parts: string[] = [];
  if (input.addedTypes && input.addedTypes.length > 0) {
    parts.push(`Added ${renderNames(input.addedTypes)}`);
  }
  if (input.changedTypes && input.changedTypes.length > 0) {
    parts.push(`Updated ${renderNames(input.changedTypes)}`);
  }
  if (input.removedTypes && input.removedTypes.length > 0) {
    parts.push(`Deleted ${renderNames(input.removedTypes)}`);
  }
  if (input.renamedTypes && input.renamedTypes.length > 0) {
    parts.push(
      `Renamed ${input.renamedTypes.map((rename) => `${rename.from} to ${rename.to}`).join(', ')}`,
    );
  }
  return parts.length > 0 ? parts.join('; ') : 'No visible model changes';
}

function renderNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

function makeChangeLogId(createdAt?: string): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `change-${createdAt ?? Date.now()}-${Math.random()}`;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

function isSource(value: unknown): value is ModelChangeSource {
  return (
    value === 'desktop' ||
    value === 'mcp' ||
    value === 'cli' ||
    value === 'schema_agent' ||
    value === 'reconcile' ||
    value === 'external'
  );
}

function isReason(value: unknown): value is ModelChangeReason {
  return (
    value === 'op_applied' ||
    value === 'replace_schema' ||
    value === 'raw_file_change' ||
    value === 'external_sync_accepted' ||
    value === 'generated_emit'
  );
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isRename(value: unknown): value is ModelChangeRename {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.from === 'string' && typeof record.to === 'string';
}
