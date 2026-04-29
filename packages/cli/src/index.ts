#!/usr/bin/env bun
import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  createFileBackedForward,
  createOpTools,
  type FieldDef,
  type FieldType,
  IRSchema,
  load,
  runEmitPipeline,
  type Schema,
} from '@contexture/core';

interface CliOptions {
  json: boolean;
  irPath?: string;
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
  list-types [--json]
  get-type <name> [--json]
  validate [--json]
  emit [--json]

Schema mutations:
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
  set-discriminator <union> <field>
  add-import <importDeclJson>
  remove-import <alias>
  replace-schema <schemaJson>

Options:
  --ir <path>   Path to a .contexture.json file
  --json        Emit machine-readable JSON
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

  throw new Error('No .contexture.json file found. Run from a scaffolded project or pass --ir.');
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
      requireArgs(args, 2, 'delete-field <type> <field>');
      return { tool: 'delete_field', input: { typeName: args[0], fieldName: args[1] } };
    case 'reorder-fields':
      requireArgs(args, 2, 'reorder-fields <type> <fieldNamesJsonOrCsv>');
      return {
        tool: 'reorder_fields',
        input: { typeName: args[0], order: parseListArg(args[1], 'fieldNames') },
      };
    case 'add-variant':
      requireArgs(args, 2, 'add-variant <union> <variant>');
      return { tool: 'add_variant', input: { typeName: args[0], variant: args[1] } };
    case 'set-discriminator':
      requireArgs(args, 2, 'set-discriminator <union> <field>');
      return { tool: 'set_discriminator', input: { typeName: args[0], discriminator: args[1] } };
    case 'remove-import':
      requireArgs(args, 1, 'remove-import <alias>');
      return { tool: 'remove_import', input: { alias: args[0] } };
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

async function run(argv: string[]): Promise<void> {
  const { command, args, options } = parseArgv(argv);
  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(HELP);
    return;
  }

  const irPath = options.irPath ?? (await findIrPath(options.cwd));

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
    writeResult({ valid: true, errors: [] }, options.json);
    return;
  }

  if (command === 'emit') {
    const schema = await readSchema(irPath);
    const { emitted, manifest } = runEmitPipeline(schema, irPath);
    await createFileBackedForward(irPath)({ kind: 'replace_schema', schema });
    writeResult({ message: `Emitted ${emitted.length} files.`, manifest }, options.json);
    return;
  }

  const forward = createFileBackedForward(irPath);
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
