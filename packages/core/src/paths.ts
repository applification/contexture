export const IR_SUFFIX = '.contexture.json';
export const SCHEMA_TS_SUFFIX = '.schema.ts';
export const SCHEMA_JSON_SUFFIX = '.schema.json';
export const LAYOUT_FILE = 'layout.json';
export const CHAT_FILE = 'chat.json';
export const EMITTED_FILE = 'emitted.json';
export const AI_TOOL_SCHEMAS_FILE = 'ai-tool-schemas.json';
export const STRUCTURED_OUTPUT_SCHEMAS_FILE = 'structured-output-schemas.json';
export const MCP_DEFINITIONS_FILE = 'mcp-definitions.json';
export const FORM_VALIDATORS_FILE = 'form-validators.ts';

export interface BundlePaths {
  ir: string;
  layout: string;
  chat: string;
  emitted: string;
  schemaTs: string;
  schemaJson: string;
  schemaIndex: string;
  convex: string;
  aiToolSchemas: string;
  structuredOutputSchemas: string;
  mcpDefinitions: string;
  formValidators: string;
}

export function contextureDirFor(irPath: string): string {
  const slash = irPath.lastIndexOf('/');
  const dir = slash === -1 ? '' : irPath.slice(0, slash);
  return `${dir}/.contexture`;
}

export function baseNameFor(irPath: string): string {
  const slash = irPath.lastIndexOf('/');
  const leaf = slash === -1 ? irPath : irPath.slice(slash + 1);
  return leaf.slice(0, -IR_SUFFIX.length);
}

export function projectRootFor(irPath: string): string | null {
  const suffix = '/packages/contexture/';
  const slash = irPath.lastIndexOf('/');
  if (slash === -1) return null;
  const dir = irPath.slice(0, slash);
  if (!dir.endsWith('/packages/contexture')) return null;
  return dir.slice(0, -suffix.length + 1);
}

export function assertContextureIrPath(path: string): string {
  const normalized = normalizeContexturePath(path);
  if (!normalized.endsWith(IR_SUFFIX)) {
    throw new Error(`Expected a ${IR_SUFFIX} path, got: ${path}`);
  }
  return normalized;
}

export function assertWritableContextureProjectIrPath(path: string): string {
  const normalized = assertContextureIrPath(path);
  const slash = normalized.lastIndexOf('/');
  const dir = slash === -1 ? '' : normalized.slice(0, slash);
  if (!dir.endsWith('/packages/contexture')) {
    throw new Error(
      'Writable Contexture agent operations require an IR under packages/contexture/*.contexture.json.',
    );
  }
  return normalized;
}

export function bundlePathsFor(irPath: string): BundlePaths {
  const resolvedIrPath = assertContextureIrPath(irPath);
  const base = resolvedIrPath.slice(0, -IR_SUFFIX.length);
  const ctxDir = contextureDirFor(resolvedIrPath);
  const dir = ctxDir.slice(0, -'/.contexture'.length);
  return {
    ir: resolvedIrPath,
    layout: `${ctxDir}/${LAYOUT_FILE}`,
    chat: `${ctxDir}/${CHAT_FILE}`,
    emitted: `${ctxDir}/${EMITTED_FILE}`,
    schemaTs: `${base}${SCHEMA_TS_SUFFIX}`,
    schemaJson: `${base}${SCHEMA_JSON_SUFFIX}`,
    schemaIndex: `${dir}/index.ts`,
    convex: `${dir}/convex/schema.ts`,
    aiToolSchemas: `${ctxDir}/${AI_TOOL_SCHEMAS_FILE}`,
    structuredOutputSchemas: `${ctxDir}/${STRUCTURED_OUTPUT_SCHEMAS_FILE}`,
    mcpDefinitions: `${ctxDir}/${MCP_DEFINITIONS_FILE}`,
    formValidators: `${dir}/${FORM_VALIDATORS_FILE}`,
  };
}

function normalizeContexturePath(path: string): string {
  const normalizedSlashes = path.replaceAll('\\', '/');
  const drive = normalizedSlashes.match(/^([A-Za-z]:)(\/?)/);
  const prefix = normalizedSlashes.startsWith('/')
    ? '/'
    : drive
      ? `${drive[1]}${drive[2] ? '/' : ''}`
      : '';
  const rest = prefix ? normalizedSlashes.slice(prefix.length) : normalizedSlashes;
  const parts: string[] = [];

  for (const part of rest.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop();
      else if (!prefix) parts.push(part);
      continue;
    }
    parts.push(part);
  }

  if (prefix) return `${prefix}${parts.join('/')}`;
  return parts.length > 0 ? parts.join('/') : '.';
}
