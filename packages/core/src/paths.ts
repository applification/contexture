export const IR_SUFFIX = '.contexture.json';
export const SCHEMA_TS_SUFFIX = '.schema.ts';
export const SCHEMA_JSON_SUFFIX = '.schema.json';
export const LAYOUT_FILE = 'layout.json';
export const CHAT_FILE = 'chat.json';
export const EMITTED_FILE = 'emitted.json';
export const CHANGE_LOG_FILE = 'change-log.json';
export const AI_TOOL_SCHEMAS_FILE = 'ai-tool-schemas.json';
export const STRUCTURED_OUTPUT_SCHEMAS_FILE = 'structured-output-schemas.json';
export const MCP_DEFINITIONS_FILE = 'mcp-definitions.json';
export const FORM_VALIDATORS_FILE = 'form-validators.ts';
export const CONVEX_VALIDATORS_FILE = 'validators.ts';
export const SCHEMA_DIR = 'schema';

export interface BundlePaths {
  ir: string;
  layout: string;
  chat: string;
  emitted: string;
  changeLog: string;
  schemaTs: string;
  schemaJson: string;
  schemaIndex: string;
  convex: string;
  convexValidators: string;
  aiToolSchemas: string;
  structuredOutputSchemas: string;
  mcpDefinitions: string;
  formValidators: string;
}

export type GeneratedTargetKind =
  | 'zod'
  | 'json-schema'
  | 'schema-index'
  | 'convex'
  | 'convex-validators'
  | 'ai-tool-schemas'
  | 'structured-output-schemas'
  | 'mcp-definitions'
  | 'form-validators';

export interface GeneratedTarget {
  kind: GeneratedTargetKind;
  path: string;
}

export function contextureDirFor(irPath: string): string {
  const normalized = normalizeContexturePath(irPath);
  const irDir = dirname(normalized);
  return `${bundleLayoutFor(irDir).projectDir}/.contexture`;
}

export function projectDirFor(irPath: string): string {
  const normalized = normalizeContexturePath(irPath);
  return bundleLayoutFor(dirname(normalized)).projectDir;
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

export function bundlePathsFor(irPath: string): BundlePaths {
  const resolvedIrPath = assertContextureIrPath(irPath);
  const baseName = baseNameFor(resolvedIrPath);
  const ctxDir = contextureDirFor(resolvedIrPath);
  const irDir = dirname(resolvedIrPath);
  const layout = bundleLayoutFor(irDir);
  const schemaBase = `${layout.schemaDir}/${baseName}`;
  return {
    ir: resolvedIrPath,
    layout: `${ctxDir}/${LAYOUT_FILE}`,
    chat: `${ctxDir}/${CHAT_FILE}`,
    emitted: `${ctxDir}/${EMITTED_FILE}`,
    changeLog: `${ctxDir}/${CHANGE_LOG_FILE}`,
    schemaTs: `${schemaBase}${SCHEMA_TS_SUFFIX}`,
    schemaJson: `${schemaBase}${SCHEMA_JSON_SUFFIX}`,
    schemaIndex: `${layout.schemaDir}/index.ts`,
    convex: `${layout.projectDir}/convex/schema.ts`,
    convexValidators: `${layout.projectDir}/convex/${CONVEX_VALIDATORS_FILE}`,
    aiToolSchemas: `${ctxDir}/${AI_TOOL_SCHEMAS_FILE}`,
    structuredOutputSchemas: `${ctxDir}/${STRUCTURED_OUTPUT_SCHEMAS_FILE}`,
    mcpDefinitions: `${ctxDir}/${MCP_DEFINITIONS_FILE}`,
    formValidators: `${layout.schemaDir}/${FORM_VALIDATORS_FILE}`,
  };
}

export function generatedTargetsFor(irPath: string): GeneratedTarget[] {
  const paths = bundlePathsFor(irPath);
  return [
    { kind: 'zod', path: paths.schemaTs },
    { kind: 'json-schema', path: paths.schemaJson },
    { kind: 'schema-index', path: paths.schemaIndex },
    { kind: 'convex', path: paths.convex },
    { kind: 'convex-validators', path: paths.convexValidators },
    { kind: 'ai-tool-schemas', path: paths.aiToolSchemas },
    { kind: 'structured-output-schemas', path: paths.structuredOutputSchemas },
    { kind: 'mcp-definitions', path: paths.mcpDefinitions },
    { kind: 'form-validators', path: paths.formValidators },
  ];
}

export function sourceLabelForIrPath(irPath: string): string {
  return relativePath(projectDirFor(irPath), assertContextureIrPath(irPath));
}

export function manifestKeyForGeneratedPath(irPath: string, generatedPath: string): string {
  return relativePath(projectDirFor(irPath), normalizeContexturePath(generatedPath));
}

export function resolveManifestGeneratedPath(irPath: string, manifestKey: string): string {
  const normalizedKey = normalizeContexturePath(manifestKey);
  const targets = generatedTargetsFor(irPath);
  const byCurrentKey = new Map(
    targets.map((target) => [manifestKeyForGeneratedPath(irPath, target.path), target.path]),
  );

  const direct = byCurrentKey.get(normalizedKey);
  if (direct) return direct;

  if (isAbsolutePath(normalizedKey)) {
    const currentTarget = targets.find((target) => target.path === normalizedKey);
    if (currentTarget) return currentTarget.path;

    const suffixTarget = targets.find((target) => {
      const currentKey = manifestKeyForGeneratedPath(irPath, target.path);
      return normalizedKey.endsWith(`/${currentKey}`);
    });
    if (suffixTarget) return suffixTarget.path;
  }

  return joinPath(projectDirFor(irPath), normalizedKey);
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

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:\//.test(path);
}

function joinPath(base: string, path: string): string {
  if (isAbsolutePath(path)) return normalizeContexturePath(path);
  return normalizeContexturePath(`${base}/${path}`);
}

function relativePath(from: string, to: string): string {
  const fromParts = normalizeContexturePath(from).split('/').filter(Boolean);
  const toParts = normalizeContexturePath(to).split('/').filter(Boolean);
  let common = 0;
  while (fromParts[common] === toParts[common] && common < fromParts.length) common += 1;
  const up = fromParts.slice(common).map(() => '..');
  const down = toParts.slice(common);
  const rel = [...up, ...down].join('/');
  return rel || '.';
}

interface BundleLayout {
  projectDir: string;
  schemaDir: string;
}

function bundleLayoutFor(irDir: string): BundleLayout {
  const parent = dirname(irDir);

  if (leafName(irDir) === 'contexture' && isWorkspaceCollectionDir(leafName(parent))) {
    return {
      projectDir: irDir,
      schemaDir: irDir,
    };
  }

  return {
    projectDir: irDir,
    schemaDir: `${irDir}/${SCHEMA_DIR}`,
  };
}

function isWorkspaceCollectionDir(name: string): boolean {
  return name === 'apps' || name === 'packages';
}

function dirname(path: string): string {
  const slash = path.lastIndexOf('/');
  if (slash <= 0) return slash === 0 ? '/' : '.';
  return path.slice(0, slash);
}

function leafName(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
}
