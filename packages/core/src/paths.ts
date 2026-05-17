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

export interface ContextureBundleProbeFs {
  dirExists(path: string): Promise<boolean>;
}

export type GeneratedTargetKind =
  | 'zod'
  | 'json-schema'
  | 'schema-index'
  | 'convex'
  | 'ai-tool-schemas'
  | 'structured-output-schemas'
  | 'mcp-definitions'
  | 'form-validators';

export interface GeneratedTarget {
  kind: GeneratedTargetKind;
  path: string;
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

export function assertContextureIrPath(path: string): string {
  const normalized = normalizeContexturePath(path);
  if (!normalized.endsWith(IR_SUFFIX)) {
    throw new Error(`Expected a ${IR_SUFFIX} path, got: ${path}`);
  }
  return normalized;
}

export async function assertWritableContextureBundleIrPath(
  path: string,
  fs: ContextureBundleProbeFs,
): Promise<string> {
  const normalized = assertContextureIrPath(path);
  if (!(await fs.dirExists(contextureDirFor(normalized)))) {
    throw new Error(
      'Writable Contexture operations require bundle mode: create a sibling .contexture/ directory by promoting or initializing the bundle first.',
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

export function generatedTargetsFor(irPath: string): GeneratedTarget[] {
  const paths = bundlePathsFor(irPath);
  return [
    { kind: 'zod', path: paths.schemaTs },
    { kind: 'json-schema', path: paths.schemaJson },
    { kind: 'schema-index', path: paths.schemaIndex },
    { kind: 'convex', path: paths.convex },
    { kind: 'ai-tool-schemas', path: paths.aiToolSchemas },
    { kind: 'structured-output-schemas', path: paths.structuredOutputSchemas },
    { kind: 'mcp-definitions', path: paths.mcpDefinitions },
    { kind: 'form-validators', path: paths.formValidators },
  ];
}

export function generatedTargetForPath(irPath: string, targetPath: string): GeneratedTarget | null {
  const target = normalizeContexturePath(targetPath);
  return generatedTargetsFor(irPath).find((candidate) => candidate.path === target) ?? null;
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
