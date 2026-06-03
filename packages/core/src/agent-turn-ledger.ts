import type { IndexDef, Schema, SearchIndexDef, TypeDef } from './ir';
import type { Op } from './ops';

export type AgentTurnStatus = 'running' | 'committed' | 'rolled_back';

export interface AgentTurnOpResult {
  id: string;
  name: string;
  op?: Op;
  input?: unknown;
  status: 'pending' | 'applied' | 'rejected' | 'non_op';
  error?: string;
  result?: unknown;
}

export interface AgentTurnRecord {
  id: string;
  status: AgentTurnStatus;
  startedAt: string;
  finishedAt?: string;
  userMessage?: string;
  assistantText?: string;
  provider?: string;
  model?: string;
  providerThreadRef?: unknown;
  beforeHash?: string;
  afterHash?: string;
  before?: Schema;
  after?: Schema;
  ops: AgentTurnOpResult[];
  summary: string;
}

export interface BuildAgentTurnSummaryInput {
  status: AgentTurnStatus;
  ops: Array<{ status: AgentTurnOpResult['status']; name?: string; result?: unknown }>;
}

export interface AgentTurnSchemaDiff {
  addedTypes: string[];
  removedTypes: string[];
  changedTypes: string[];
  addedFields: string[];
  removedFields: string[];
  changedFields: string[];
  addedIndexes: string[];
  removedIndexes: string[];
  changedIndexes: string[];
  addedSearchIndexes: string[];
  removedSearchIndexes: string[];
  changedSearchIndexes: string[];
  importChanged: boolean;
  outputChanged: boolean;
}

export function describeAgentTurnOp(op: Pick<AgentTurnOpResult, 'name' | 'op'>): string {
  if (!op.op) return op.name;
  switch (op.op.kind) {
    case 'add_type':
      return `Added ${op.op.type.name}`;
    case 'update_type':
      return `Updated ${op.op.name}`;
    case 'rename_type':
      return `Renamed ${op.op.from} to ${op.op.to}`;
    case 'delete_type':
      return `Deleted ${op.op.name}`;
    case 'add_field':
      return `Added field ${op.op.typeName}.${op.op.field.name}`;
    case 'update_field':
      return `Updated field ${op.op.typeName}.${op.op.fieldName}`;
    case 'remove_field':
      return `Removed field ${op.op.typeName}.${op.op.fieldName}`;
    case 'add_invariant':
      return `Added invariant ${op.op.typeName}.${op.op.invariant.name}`;
    case 'update_invariant':
      return `Updated invariant ${op.op.typeName}.${op.op.name}`;
    case 'remove_invariant':
      return `Removed invariant ${op.op.typeName}.${op.op.name}`;
    case 'add_value':
      return `Added value ${op.op.typeName}.${op.op.value}`;
    case 'update_value':
      return `Updated value ${op.op.typeName}.${op.op.value}`;
    case 'remove_value':
      return `Removed value ${op.op.typeName}.${op.op.value}`;
    case 'reorder_fields':
      return `Reordered fields on ${op.op.typeName}`;
    case 'add_variant':
      return `Added variant ${op.op.typeName}.${op.op.variant}`;
    case 'remove_variant':
      return `Removed variant ${op.op.typeName}.${op.op.variant}`;
    case 'set_discriminator':
      return `Set discriminator on ${op.op.typeName}`;
    case 'add_import':
      return `Added import ${op.op.import.alias}`;
    case 'remove_import':
      return `Removed import ${op.op.alias}`;
    case 'remove_import_at':
      return `Removed import at ${op.op.index}`;
    case 'set_table_flag':
      return op.op.table
        ? `Marked ${op.op.typeName} as table`
        : `Unmarked ${op.op.typeName} as table`;
    case 'add_index':
      return `Added index ${op.op.typeName}.${op.op.index.name}`;
    case 'remove_index':
      return `Removed index ${op.op.typeName}.${op.op.name}`;
    case 'update_index':
      return `Updated index ${op.op.typeName}.${op.op.name}`;
    case 'add_search_index':
      return `Added search index ${op.op.typeName}.${op.op.searchIndex.name}`;
    case 'remove_search_index':
      return `Removed search index ${op.op.typeName}.${op.op.name}`;
    case 'update_search_index':
      return `Updated search index ${op.op.typeName}.${op.op.name}`;
    case 'replace_schema':
      return 'Replaced schema';
  }
}

export function buildAgentTurnSummary(input: BuildAgentTurnSummaryInput): string {
  const attempted = input.ops.filter((op) => op.status !== 'non_op').length;
  const applied = input.ops.filter((op) => op.status === 'applied').length;
  const rejected = input.ops.filter((op) => op.status === 'rejected').length;
  const pending = input.ops.filter((op) => op.status === 'pending').length;
  const nonOpSummaries = summarizeNonOpTools(input.ops);

  if (attempted === 0) {
    if (input.status === 'running') return 'Agent is working on your request';
    if (input.status === 'rolled_back') return 'Agent turn rolled back with no model changes';
    if (nonOpSummaries.length > 0) return `Agent ${joinSummaryList(nonOpSummaries)}`;
    return 'Agent turn completed with no model changes';
  }

  const proposed = attempted === 1 ? '1 model change' : `${attempted} model changes`;
  if (input.status === 'running') {
    return `Agent is working on ${proposed}: ${applied} applied, ${rejected} rejected, ${pending} pending`;
  }
  if (input.status === 'rolled_back') {
    return applied === 1
      ? 'Agent turn undone: 1 model change rolled back'
      : `Agent turn undone: ${applied} model changes rolled back`;
  }
  if (rejected === 0) {
    return applied === 1
      ? 'Agent applied 1 model change'
      : `Agent applied ${applied} model changes`;
  }
  return `Agent proposed ${proposed}: ${applied} applied, ${rejected} rejected`;
}

export function diffAgentTurnSchema(before?: Schema, after?: Schema): AgentTurnSchemaDiff {
  const diff: AgentTurnSchemaDiff = {
    addedTypes: [],
    removedTypes: [],
    changedTypes: [],
    addedFields: [],
    removedFields: [],
    changedFields: [],
    addedIndexes: [],
    removedIndexes: [],
    changedIndexes: [],
    addedSearchIndexes: [],
    removedSearchIndexes: [],
    changedSearchIndexes: [],
    importChanged: false,
    outputChanged: false,
  };
  if (!before || !after) return diff;

  const beforeTypes = byName(before.types);
  const afterTypes = byName(after.types);
  for (const name of afterTypes.keys()) {
    if (!beforeTypes.has(name)) diff.addedTypes.push(name);
  }
  for (const name of beforeTypes.keys()) {
    if (!afterTypes.has(name)) diff.removedTypes.push(name);
  }
  for (const [name, beforeType] of beforeTypes) {
    const afterType = afterTypes.get(name);
    if (!afterType) continue;
    diffType(name, beforeType, afterType, diff);
  }

  diff.importChanged = stableJson(before.imports ?? []) !== stableJson(after.imports ?? []);
  diff.outputChanged = stableJson(before.outputs ?? {}) !== stableJson(after.outputs ?? {});
  return sortDiff(diff);
}

export function summarizeAgentTurnSchemaDiff(diff: AgentTurnSchemaDiff): string[] {
  const rows: string[] = [];
  rows.push(...diff.addedTypes.map((name) => `Added type ${name}`));
  rows.push(...diff.removedTypes.map((name) => `Removed type ${name}`));
  rows.push(...diff.changedTypes.map((name) => `Changed type ${name}`));
  rows.push(...diff.addedFields.map((name) => `Added field ${name}`));
  rows.push(...diff.removedFields.map((name) => `Removed field ${name}`));
  rows.push(...diff.changedFields.map((name) => `Changed field ${name}`));
  rows.push(...diff.addedIndexes.map((name) => `Added index ${name}`));
  rows.push(...diff.removedIndexes.map((name) => `Removed index ${name}`));
  rows.push(...diff.changedIndexes.map((name) => `Changed index ${name}`));
  rows.push(...diff.addedSearchIndexes.map((name) => `Added search index ${name}`));
  rows.push(...diff.removedSearchIndexes.map((name) => `Removed search index ${name}`));
  rows.push(...diff.changedSearchIndexes.map((name) => `Changed search index ${name}`));
  if (diff.importChanged) rows.push('Changed imports');
  if (diff.outputChanged) rows.push('Changed outputs');
  return rows;
}

export function hashAgentTurnSchema(schema: Schema | undefined): string | undefined {
  if (!schema) return undefined;
  let hash = 0x811c9dc5;
  const text = stableJson(schema);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function diffType(
  name: string,
  beforeType: TypeDef,
  afterType: TypeDef,
  diff: AgentTurnSchemaDiff,
): void {
  if (beforeType.kind !== afterType.kind) {
    diff.changedTypes.push(name);
    return;
  }
  const beforeRest = stripTypeChildren(beforeType);
  const afterRest = stripTypeChildren(afterType);
  if (stableJson(beforeRest) !== stableJson(afterRest)) diff.changedTypes.push(name);

  if (beforeType.kind === 'object' && afterType.kind === 'object') {
    diffNamedChildren(
      name,
      beforeType.fields,
      afterType.fields,
      diff.addedFields,
      diff.removedFields,
      diff.changedFields,
    );
    diffNamedChildren(
      name,
      beforeType.indexes ?? [],
      afterType.indexes ?? [],
      diff.addedIndexes,
      diff.removedIndexes,
      diff.changedIndexes,
    );
    diffNamedChildren(
      name,
      beforeType.searchIndexes ?? [],
      afterType.searchIndexes ?? [],
      diff.addedSearchIndexes,
      diff.removedSearchIndexes,
      diff.changedSearchIndexes,
    );
    return;
  }

  if (stableJson(beforeType) !== stableJson(afterType) && !diff.changedTypes.includes(name)) {
    diff.changedTypes.push(name);
  }
}

function diffNamedChildren<T extends { name: string }>(
  typeName: string,
  beforeItems: T[],
  afterItems: T[],
  added: string[],
  removed: string[],
  changed: string[],
): void {
  const beforeByName = byName(beforeItems);
  const afterByName = byName(afterItems);
  for (const name of afterByName.keys()) {
    if (!beforeByName.has(name)) added.push(`${typeName}.${name}`);
  }
  for (const name of beforeByName.keys()) {
    if (!afterByName.has(name)) removed.push(`${typeName}.${name}`);
  }
  for (const [name, beforeItem] of beforeByName) {
    const afterItem = afterByName.get(name);
    if (afterItem && stableJson(beforeItem) !== stableJson(afterItem)) {
      changed.push(`${typeName}.${name}`);
    }
  }
}

function stripTypeChildren(type: TypeDef): Omit<TypeDef, 'fields' | 'indexes' | 'searchIndexes'> {
  if (type.kind === 'object') {
    const { fields: _fields, indexes: _indexes, searchIndexes: _searchIndexes, ...rest } = type;
    return rest;
  }
  return type;
}

function byName<T extends { name: string } | IndexDef | SearchIndexDef>(
  items: T[],
): Map<string, T> {
  return new Map(items.map((item) => [item.name, item]));
}

function sortDiff(diff: AgentTurnSchemaDiff): AgentTurnSchemaDiff {
  return Object.fromEntries(
    Object.entries(diff).map(([key, value]) => [key, Array.isArray(value) ? value.sort() : value]),
  ) as unknown as AgentTurnSchemaDiff;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function summarizeNonOpTools(ops: BuildAgentTurnSummaryInput['ops']): string[] {
  const completed = ops.filter((op) => op.status === 'non_op');
  const summaries = new Set<string>();
  for (const op of completed) {
    if (op.name === 'emit_contexture') {
      summaries.add('emitted generated files');
    } else if (op.name === 'check_contexture_drift') {
      summaries.add(readDriftClean(op.result) ? 'checked drift: clean' : 'checked drift');
    }
  }
  return [...summaries];
}

function readDriftClean(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const clean = (result as { clean?: unknown }).clean;
  return clean === true;
}

function joinSummaryList(items: string[]): string {
  const last = items.at(-1);
  if (!last) return '';
  if (items.length === 1) return last;
  return `${items.slice(0, -1).join(', ')} and ${last}`;
}
