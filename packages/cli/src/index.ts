#!/usr/bin/env bun
import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  assertContextureIrPath,
  buildConvexCapabilityManifest,
  checkGeneratedBundle,
  checkSemantic,
  createFileBackedForward,
  createOpTools,
  type FieldDef,
  type FieldType,
  type ImportDecl,
  IRSchema,
  load,
  nodeFileBackedFs,
  OpSchema,
  type Schema,
  type TypeDef,
  writeGeneratedBundle,
} from '@contexture/core';
import { STDLIB_REGISTRY, STDLIB_RUNTIME_MODULES } from './stdlib-runtime';

const STDLIB_EMIT_DEPS = { stdlibRuntime: STDLIB_RUNTIME_MODULES } as const;

interface CliOptions {
  json: boolean;
  irPath?: string;
  opJson?: string;
  opFile?: string;
  cwd: string;
}

interface ParsedArgs {
  command: string;
  args: string[];
  options: CliOptions;
}

interface JsonError {
  ok: false;
  error: { message: string; code: string };
}

const HELP = `contexture <command> [args]

Read helpers:
  inspect [--json]
  list-types [--json]
  get-type <name> [--json]
  validate [--json]
  emit [--json]
  check-generated [--json]
  convex-capabilities [--json]

Schema mutations:
  apply (--op-json <json> | --op-file <path>)
  add-field <type> <name> <fieldTypeJson> [--optional] [--nullable]
  update-field <type> <field> <patchJson>
  delete-field <type> <field>
  reorder-fields <type> <fieldNamesJsonOrCsv>
  add-type <typeDefJson>
  update-type <name> <patchJson>
  rename-type <from> <to>
  delete-type <name>
  set-table-flag <type> <true|false>
  add-index <type> <name> <fieldsJsonOrCsv>
  remove-index <type> <name>
  update-index <type> <name> <patchJson>
  add-variant <union> <variant>
  remove-variant <union> <variant>
  set-discriminator <union> <field>
  add-import <importDeclJson>
  remove-import <alias>
  remove-import-at <index>
  replace-schema <schemaJson>

Options:
  --ir <path>          Path to a .contexture.json file
  --json               Emit machine-readable JSON
  --op-json <json>     Inline op for \`apply\`
  --op-file <path>     Path to a JSON op for \`apply\`
`;

function parseArgv(argv: string[], cwd = process.cwd()): ParsedArgs {
  const args = [...argv];
  const options: CliOptions = { json: false, cwd };
  const rest: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--ir') {
      const value = args[i + 1];
      if (!value) throw new Error('--ir requires a path');
      options.irPath = resolve(cwd, value);
      i += 1;
      continue;
    }
    if (arg?.startsWith('--ir=')) {
      options.irPath = resolve(cwd, arg.slice('--ir='.length));
      continue;
    }
    if (arg === '--op-json') {
      const value = args[i + 1];
      if (!value) throw new Error('--op-json requires a JSON string');
      options.opJson = value;
      i += 1;
      continue;
    }
    if (arg?.startsWith('--op-json=')) {
      options.opJson = arg.slice('--op-json='.length);
      continue;
    }
    if (arg === '--op-file') {
      const value = args[i + 1];
      if (!value) throw new Error('--op-file requires a path');
      options.opFile = resolve(cwd, value);
      i += 1;
      continue;
    }
    if (arg?.startsWith('--op-file=')) {
      options.opFile = resolve(cwd, arg.slice('--op-file='.length));
      continue;
    }
    rest.push(arg);
  }

  return { command: rest[0] ?? 'help', args: rest.slice(1), options };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function findIrPath(cwd: string): Promise<string> {
  const candidates = [join(cwd, 'packages/contexture'), cwd];

  for (const dir of candidates) {
    if (!(await pathExists(dir))) continue;
    const entries = await readdir(dir);
    const matches = entries.filter((entry) => entry.endsWith('.contexture.json')).sort();
    if (matches.length === 1 && matches[0]) return join(dir, matches[0]);
    if (matches.length > 1) {
      throw new Error(`Multiple .contexture.json files found in ${dir}; pass --ir explicitly.`);
    }
  }

  throw new Error('No .contexture.json file found. Run from a Contexture bundle or pass --ir.');
}

async function readSchema(irPath: string): Promise<Schema> {
  const raw = await Bun.file(irPath).text();
  return load(raw).schema;
}

async function readJson(irPath: string): Promise<unknown> {
  const raw = await Bun.file(irPath).text();
  try {
    return JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON: ${detail}`);
  }
}

function parseJsonArg<T>(raw: string | undefined, label: string): T {
  if (!raw) throw new Error(`${label} is required`);
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${label} must be valid JSON: ${detail}`);
  }
}

function parseListArg(raw: string | undefined, label: string): string[] {
  if (!raw) throw new Error(`${label} is required`);
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    const parsed = parseJsonArg<unknown>(trimmed, label);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
      throw new Error(`${label} must be a JSON string array`);
    }
    return parsed;
  }
  return trimmed
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseBoolean(raw: string | undefined, label: string): boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${label} must be "true" or "false"`);
}

function parseNonNegativeInteger(raw: string | undefined, label: string): number {
  if (!raw) throw new Error(`${label} is required`);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function requireArgs(args: string[], count: number, usage: string): void {
  if (args.length < count) throw new Error(`Usage: contexture ${usage}`);
}

function fieldFromArgs(args: string[]): FieldDef {
  requireArgs(args, 3, 'add-field <type> <name> <fieldTypeJson>');
  const optional = args.includes('--optional');
  const nullable = args.includes('--nullable');
  const positional = args.filter((arg) => arg !== '--optional' && arg !== '--nullable');
  return {
    name: positional[1] ?? '',
    type: parseJsonArg<FieldType>(positional[2], 'fieldTypeJson'),
    ...(optional ? { optional } : {}),
    ...(nullable ? { nullable } : {}),
  };
}

function fieldTypeToString(type: FieldType): string {
  switch (type.kind) {
    case 'string':
      return type.format ? `string<${type.format}>` : 'string';
    case 'number':
      return type.int ? 'integer' : 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'date';
    case 'literal':
      return `literal(${JSON.stringify(type.value)})`;
    case 'ref':
      return type.typeName;
    case 'array':
      return `${fieldTypeToString(type.element)}[]`;
  }
}

interface InspectJsonType {
  name: string;
  kind: TypeDef['kind'];
  table?: boolean;
  fieldCount?: number;
  fields?: Array<{ name: string; type: string; optional?: boolean; nullable?: boolean }>;
  values?: string[];
  variants?: string[];
  discriminator?: string;
}

interface InspectJson {
  path: string;
  version: '1';
  name?: string;
  typeCount: number;
  types: InspectJsonType[];
  imports: Array<{ kind: ImportDecl['kind']; alias: string; path: string }>;
}

function typeToInspectJson(type: TypeDef): InspectJsonType {
  if (type.kind === 'object') {
    return {
      name: type.name,
      kind: 'object',
      ...(type.table ? { table: true } : {}),
      fieldCount: type.fields.length,
      fields: type.fields.map((field) => ({
        name: field.name,
        type: fieldTypeToString(field.type),
        ...(field.optional ? { optional: true } : {}),
        ...(field.nullable ? { nullable: true } : {}),
      })),
    };
  }
  if (type.kind === 'enum') {
    return {
      name: type.name,
      kind: 'enum',
      values: type.values.map((v) => v.value),
    };
  }
  if (type.kind === 'discriminatedUnion') {
    return {
      name: type.name,
      kind: 'discriminatedUnion',
      discriminator: type.discriminator,
      variants: type.variants,
    };
  }
  return { name: type.name, kind: 'raw' };
}

function buildInspectJson(schema: Schema, irPath: string): InspectJson {
  const types: InspectJsonType[] = schema.types.map(typeToInspectJson);

  return {
    path: irPath,
    version: schema.version,
    ...(schema.metadata?.name ? { name: schema.metadata.name } : {}),
    typeCount: schema.types.length,
    types,
    imports: (schema.imports ?? []).map((imp) => ({
      kind: imp.kind,
      alias: imp.alias,
      path: imp.path,
    })),
  };
}

function renderInspectText(summary: InspectJson): string {
  const lines: string[] = [];
  lines.push(`Schema: ${summary.name ?? '(unnamed)'}`);
  lines.push(`Path: ${summary.path}`);
  lines.push(`Types: ${summary.typeCount}`);

  const byKind = (kind: TypeDef['kind']) => summary.types.filter((t) => t.kind === kind);

  const objects = byKind('object');
  if (objects.length > 0) {
    lines.push('Objects:');
    for (const obj of objects) {
      lines.push(`  ${obj.name}${obj.table ? ' [table]' : ''}`);
      for (const field of obj.fields ?? []) {
        const marks = (field.optional ? '?' : '') + (field.nullable ? ' | null' : '');
        lines.push(`    - ${field.name}: ${field.type}${marks}`);
      }
    }
  }

  const enums = byKind('enum');
  if (enums.length > 0) {
    lines.push('Enums:');
    for (const en of enums) {
      lines.push(`  ${en.name}: ${(en.values ?? []).join(', ')}`);
    }
  }

  const unions = byKind('discriminatedUnion');
  if (unions.length > 0) {
    lines.push('Discriminated unions:');
    for (const u of unions) {
      lines.push(`  ${u.name} (on ${u.discriminator ?? '?'}): ${(u.variants ?? []).join(', ')}`);
    }
  }

  const raws = byKind('raw');
  if (raws.length > 0) {
    lines.push('Raw:');
    for (const r of raws) lines.push(`  ${r.name}`);
  }

  if (summary.imports.length > 0) {
    lines.push('Imports:');
    for (const imp of summary.imports) {
      lines.push(`  ${imp.alias} -> ${imp.path}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function commandToToolInput(command: string, args: string[]): { tool: string; input: object } {
  switch (command) {
    case 'add-field': {
      const field = fieldFromArgs(args);
      return { tool: 'add_field', input: { typeName: args[0], field } };
    }
    case 'update-field':
      requireArgs(args, 3, 'update-field <type> <field> <patchJson>');
      return {
        tool: 'update_field',
        input: { typeName: args[0], fieldName: args[1], patch: parseJsonArg(args[2], 'patchJson') },
      };
    case 'delete-field':
    case 'remove-field':
      requireArgs(args, 2, 'remove-field <type> <field>');
      return { tool: 'remove_field', input: { typeName: args[0], fieldName: args[1] } };
    case 'add-value':
      requireArgs(args, 2, 'add-value <type> <value> [description]');
      return {
        tool: 'add_value',
        input: { typeName: args[0], value: args[1], description: args[2] },
      };
    case 'update-value':
      requireArgs(args, 3, 'update-value <type> <value> <patchJson>');
      return {
        tool: 'update_value',
        input: {
          typeName: args[0],
          value: args[1],
          patch: parseJsonArg(args[2], 'patchJson'),
        },
      };
    case 'remove-value':
      requireArgs(args, 2, 'remove-value <type> <value>');
      return { tool: 'remove_value', input: { typeName: args[0], value: args[1] } };
    case 'reorder-fields':
      requireArgs(args, 2, 'reorder-fields <type> <fieldNamesJsonOrCsv>');
      return {
        tool: 'reorder_fields',
        input: { typeName: args[0], order: parseListArg(args[1], 'fieldNames') },
      };
    case 'add-variant':
      requireArgs(args, 2, 'add-variant <union> <variant>');
      return { tool: 'add_variant', input: { typeName: args[0], variant: args[1] } };
    case 'remove-variant':
      requireArgs(args, 2, 'remove-variant <union> <variant>');
      return { tool: 'remove_variant', input: { typeName: args[0], variant: args[1] } };
    case 'set-discriminator':
      requireArgs(args, 2, 'set-discriminator <union> <field>');
      return { tool: 'set_discriminator', input: { typeName: args[0], discriminator: args[1] } };
    case 'remove-import':
      requireArgs(args, 1, 'remove-import <alias>');
      return { tool: 'remove_import', input: { alias: args[0] } };
    case 'remove-import-at':
      requireArgs(args, 1, 'remove-import-at <index>');
      return {
        tool: 'remove_import_at',
        input: { index: parseNonNegativeInteger(args[0], 'index') },
      };
    case 'set-table-flag':
      requireArgs(args, 2, 'set-table-flag <type> <true|false>');
      return {
        tool: 'set_table_flag',
        input: { typeName: args[0], table: parseBoolean(args[1], 'table') },
      };
    case 'add-index':
      requireArgs(args, 3, 'add-index <type> <name> <fieldsJsonOrCsv>');
      return {
        tool: 'add_index',
        input: {
          typeName: args[0],
          index: { name: args[1], fields: parseListArg(args[2], 'fields') },
        },
      };
    case 'remove-index':
      requireArgs(args, 2, 'remove-index <type> <name>');
      return { tool: 'remove_index', input: { typeName: args[0], name: args[1] } };
    case 'update-index':
      requireArgs(args, 3, 'update-index <type> <name> <patchJson>');
      return {
        tool: 'update_index',
        input: { typeName: args[0], name: args[1], patch: parseJsonArg(args[2], 'patchJson') },
      };
    case 'add-type':
      requireArgs(args, 1, 'add-type <typeDefJson>');
      return { tool: 'add_type', input: { payload: parseJsonArg(args[0], 'typeDefJson') } };
    case 'update-type':
      requireArgs(args, 2, 'update-type <name> <patchJson>');
      return {
        tool: 'update_type',
        input: { payload: { name: args[0], patch: parseJsonArg(args[1], 'patchJson') } },
      };
    case 'rename-type':
      requireArgs(args, 2, 'rename-type <from> <to>');
      return { tool: 'rename_type', input: { payload: { from: args[0], to: args[1] } } };
    case 'delete-type':
      requireArgs(args, 1, 'delete-type <name>');
      return { tool: 'delete_type', input: { payload: { name: args[0] } } };
    case 'add-import':
      requireArgs(args, 1, 'add-import <importDeclJson>');
      return { tool: 'add_import', input: { payload: parseJsonArg(args[0], 'importDeclJson') } };
    case 'replace-schema':
      requireArgs(args, 1, 'replace-schema <schemaJson>');
      return { tool: 'replace_schema', input: { schema: parseJsonArg(args[0], 'schemaJson') } };
    default:
      throw new Error(`Unknown command "${command}"`);
  }
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function writeResult(value: unknown, json: boolean): void {
  if (json) {
    const body = typeof value === 'object' && value !== null ? value : { value };
    writeJson({ ok: true, ...body });
    return;
  }
  if (typeof value === 'object' && value && 'message' in value) {
    process.stdout.write(`${String((value as { message: unknown }).message)}\n`);
    return;
  }
  writeJson(value);
}

async function collectConvexCapabilities() {
  const [{ v }, server, convexPackage, cliVersion, cliHelp] = await Promise.all([
    import('convex/values'),
    import('convex/server'),
    import('convex/package.json'),
    runCommand(['bunx', 'convex', '--version']),
    runCommand(['bunx', 'convex', '--help']),
  ]);

  return buildConvexCapabilityManifest({
    packageVersion: packageVersionFromModule(convexPackage),
    cliVersion: cliVersion.trim() || null,
    validators: Object.keys(v),
    serverExports: Object.keys(server),
    cliHelp,
  });
}

function packageVersionFromModule(module: unknown): string | null {
  const candidate =
    module && typeof module === 'object' && 'default' in module ? module.default : module;
  if (!candidate || typeof candidate !== 'object' || !('version' in candidate)) return null;
  return typeof candidate.version === 'string' ? candidate.version : null;
}

async function runCommand(cmd: string[]): Promise<string> {
  const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    const detail = stderr.trim() || stdout.trim() || `exit code ${exitCode}`;
    throw new Error(`${cmd.join(' ')} failed: ${detail}`);
  }
  return stdout;
}

function renderConvexCapabilitiesText(
  manifest: Awaited<ReturnType<typeof collectConvexCapabilities>>,
) {
  return [
    `Convex package: ${manifest.packageVersion ?? '(unknown)'}`,
    `Convex CLI: ${manifest.cliVersion ?? '(unknown)'}`,
    `Validators: ${manifest.validators.join(', ')}`,
    `Server exports: ${manifest.serverExports.join(', ')}`,
    `CLI commands: ${manifest.cliCommands.join(', ')}`,
    `Schema options: ${manifest.defineSchemaOptions.join(', ')}`,
    '',
  ].join('\n');
}

async function run(argv: string[]): Promise<void> {
  const { command, args, options } = parseArgv(argv);
  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(HELP);
    return;
  }

  if (command === 'convex-capabilities') {
    const manifest = await collectConvexCapabilities();
    if (options.json) writeJson({ ok: true, manifest });
    else process.stdout.write(renderConvexCapabilitiesText(manifest));
    return;
  }

  const irPath = assertContextureIrPath(options.irPath ?? (await findIrPath(options.cwd)));

  if (command === 'inspect') {
    const schema = await readSchema(irPath);
    const summary = buildInspectJson(schema, irPath);
    if (options.json) writeJson({ ok: true, ...summary });
    else process.stdout.write(renderInspectText(summary));
    return;
  }

  if (command === 'list-types') {
    const schema = await readSchema(irPath);
    writeResult(
      {
        types: schema.types.map((type) => ({
          name: type.name,
          kind: type.kind,
          ...(type.kind === 'object' ? { table: type.table === true } : {}),
        })),
      },
      options.json,
    );
    return;
  }

  if (command === 'get-type') {
    requireArgs(args, 1, 'get-type <name>');
    const schema = await readSchema(irPath);
    const type = schema.types.find((candidate) => candidate.name === args[0]);
    if (!type) throw new Error(`type "${args[0]}" not found`);
    writeResult({ type }, options.json);
    return;
  }

  if (command === 'validate') {
    const parsed = IRSchema.safeParse(await readJson(irPath));
    if (!parsed.success) {
      process.exitCode = 1;
      writeJson({
        ok: false,
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }
    const errors = checkSemantic(parsed.data, STDLIB_REGISTRY).map((issue) => ({
      code: issue.code,
      path: issue.path,
      message: issue.message,
      ...(issue.hint ? { hint: issue.hint } : {}),
    }));
    if (errors.length > 0) {
      process.exitCode = 1;
      if (options.json) {
        writeJson({ ok: false, errors });
      } else {
        process.stderr.write('Validation failed:\n');
        for (const error of errors) {
          process.stderr.write(`  ${error.path}: ${error.message}\n`);
        }
      }
      return;
    }
    writeResult({ valid: true, errors: [] }, options.json);
    return;
  }

  if (command === 'emit') {
    const writableIrPath = assertContextureIrPath(irPath);
    const schema = await readSchema(writableIrPath);
    const { emitted, manifest } = await writeGeneratedBundle({
      irPath: writableIrPath,
      schema,
      fs: nodeFileBackedFs,
      emitDeps: STDLIB_EMIT_DEPS,
      driftPreflight: false,
    });
    writeResult({ message: `Emitted ${emitted.length} files.`, manifest }, options.json);
    return;
  }

  if (command === 'check-generated') {
    const writableIrPath = assertContextureIrPath(irPath);
    const schema = await readSchema(writableIrPath);
    const files = await checkGeneratedBundle(
      schema,
      writableIrPath,
      nodeFileBackedFs,
      STDLIB_EMIT_DEPS,
    );
    const drift = files.filter((file) => file.status !== 'clean');
    if (drift.length > 0) {
      process.exitCode = 1;
      const stale = drift.map((file) => ({
        path: file.path,
        reason: file.status === 'drifted' ? 'mismatch' : 'missing',
        status: file.status,
      }));
      if (options.json) {
        writeJson({ ok: false, checked: files.length, files, drift, stale });
      } else {
        process.stderr.write('Generated files are not up to date:\n');
        for (const { path, status } of drift) {
          process.stderr.write(`  ${path} (${status})\n`);
        }
        process.stderr.write('\nRun: contexture emit\n');
      }
      return;
    }
    writeResult(
      { message: 'Generated files are up to date.', checked: files.length, files },
      options.json,
    );
    return;
  }

  if (command === 'apply') {
    const writableIrPath = assertContextureIrPath(irPath);
    let opJson = options.opJson;
    if (!opJson && options.opFile) {
      opJson = await Bun.file(options.opFile).text();
    }
    if (!opJson) {
      throw new Error('apply requires --op-json <json> or --op-file <path>');
    }
    const op = parseJsonArg<{ kind?: unknown }>(opJson, 'op');
    if (!op || typeof op !== 'object' || typeof op.kind !== 'string') {
      throw new Error('op must be an object with a string "kind" field');
    }
    const parsedOp = OpSchema.safeParse(op);
    if (!parsedOp.success) {
      process.exitCode = 1;
      const error: JsonError = {
        ok: false,
        error: { message: `invalid op: ${formatZodIssues(parsedOp.error)}`, code: 'INVALID_OP' },
      };
      if (options.json) writeJson(error);
      else process.stderr.write(`${error.error.message}\n`);
      return;
    }
    const forward = createFileBackedForward(writableIrPath, {
      stdlib: STDLIB_REGISTRY,
      emitDeps: STDLIB_EMIT_DEPS,
      changeSource: 'cli',
    });
    type ForwardResult = Awaited<ReturnType<typeof forward>>;
    let result: ForwardResult;
    try {
      result = await forward(parsedOp.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`apply failed: ${message}`);
    }
    if ('error' in result) {
      process.exitCode = 1;
      const error: JsonError = {
        ok: false,
        error: { message: result.error, code: 'APPLY_FAILED' },
      };
      if (options.json) writeJson(error);
      else process.stderr.write(`${result.error}\n`);
      return;
    }
    writeResult({ message: `${op.kind} applied.`, schema: result.schema }, options.json);
    return;
  }

  const writableIrPath = assertContextureIrPath(irPath);
  const forward = createFileBackedForward(writableIrPath, {
    stdlib: STDLIB_REGISTRY,
    emitDeps: STDLIB_EMIT_DEPS,
    changeSource: 'cli',
  });
  const tools = new Map(createOpTools(forward).map((tool) => [tool.name, tool]));
  const { tool: toolName, input } = commandToToolInput(command, args);
  const tool = tools.get(toolName);
  if (!tool) throw new Error(`Tool "${toolName}" is not registered`);
  const result = await tool.handler(input as Record<string, unknown>);
  if ('error' in result) {
    process.exitCode = 1;
    const error: JsonError = { ok: false, error: { message: result.error, code: 'APPLY_FAILED' } };
    if (options.json) writeJson(error);
    else process.stderr.write(`${result.error}\n`);
    return;
  }
  writeResult({ message: `${command} applied.`, schema: result.schema }, options.json);
}

function formatZodIssues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.') || '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

run(process.argv.slice(2)).catch((err) => {
  process.exitCode = 1;
  let json = false;
  try {
    json = parseArgv(process.argv.slice(2)).options.json;
  } catch {
    json = process.argv.includes('--json');
  }
  const message = err instanceof Error ? err.message : String(err);
  if (json) {
    writeJson({ ok: false, error: { message, code: 'CLI_ERROR' } });
  } else {
    process.stderr.write(`${message}\n`);
  }
});
