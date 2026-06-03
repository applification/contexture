import type { Schema } from './ir';

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
export const DOMAIN_BRIEF_FILE = 'domain-brief.json';
export const FORM_VALIDATORS_FILE = 'form-validators.ts';
export const CONVEX_VALIDATORS_FILE = 'validators.ts';
export const CONVEX_RELATIONSHIPS_FILE = 'relationships.ts';
export const SCHEMA_DIR = 'schema';
export const STDLIB_RUNTIME_DIR = 'contexture-runtime';

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
  convexRelationships: string;
  aiToolSchemas: string;
  structuredOutputSchemas: string;
  mcpDefinitions: string;
  domainBrief: string;
  formValidators: string;
  stdlibRuntimeDir: string;
}

export type GeneratedTargetKind =
  | 'zod'
  | 'json-schema'
  | 'schema-index'
  | 'convex'
  | 'convex-validators'
  | 'convex-relationships'
  | 'ai-tool-schemas'
  | 'structured-output-schemas'
  | 'mcp-definitions'
  | 'domain-brief'
  | 'form-validators';

type OutputDirTargetKind = GeneratedTargetKind | 'stdlib-runtime';

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

export function bundlePathsFor(irPath: string, schema?: Schema): BundlePaths {
  const resolvedIrPath = assertContextureIrPath(irPath);
  const baseName = baseNameFor(resolvedIrPath);
  const ctxDir = contextureDirFor(resolvedIrPath);
  const irDir = dirname(resolvedIrPath);
  const layout = bundleLayoutFor(irDir);
  const schemaDir = outputDirFor(schema, 'zod', layout.schemaDir, irDir);
  const jsonSchemaDir = outputDirFor(schema, 'json-schema', layout.schemaDir, irDir);
  const schemaIndexDir = outputDirFor(schema, 'schema-index', layout.schemaDir, irDir);
  const convexDir = outputDirFor(schema, 'convex', `${layout.projectDir}/convex`, irDir);
  const aiToolSchemasDir = outputDirFor(schema, 'ai-tool-schemas', ctxDir, irDir);
  const structuredOutputSchemasDir = outputDirFor(
    schema,
    'structured-output-schemas',
    ctxDir,
    irDir,
  );
  const mcpDefinitionsDir = outputDirFor(schema, 'mcp-definitions', ctxDir, irDir);
  const domainBriefDir = outputDirFor(schema, 'domain-brief', ctxDir, irDir);
  const formValidatorsDir = outputDirFor(schema, 'form-validators', layout.schemaDir, irDir);
  const stdlibRuntimeDir = outputDirFor(
    schema,
    'stdlib-runtime',
    `${schemaDir}/${STDLIB_RUNTIME_DIR}`,
    irDir,
  );
  return {
    ir: resolvedIrPath,
    layout: `${ctxDir}/${LAYOUT_FILE}`,
    chat: `${ctxDir}/${CHAT_FILE}`,
    emitted: `${ctxDir}/${EMITTED_FILE}`,
    changeLog: `${ctxDir}/${CHANGE_LOG_FILE}`,
    schemaTs: `${schemaDir}/${baseName}${SCHEMA_TS_SUFFIX}`,
    schemaJson: `${jsonSchemaDir}/${baseName}${SCHEMA_JSON_SUFFIX}`,
    schemaIndex: `${schemaIndexDir}/index.ts`,
    convex: `${convexDir}/schema.ts`,
    convexValidators: `${convexDir}/${CONVEX_VALIDATORS_FILE}`,
    convexRelationships: `${convexDir}/${CONVEX_RELATIONSHIPS_FILE}`,
    aiToolSchemas: `${aiToolSchemasDir}/${AI_TOOL_SCHEMAS_FILE}`,
    structuredOutputSchemas: `${structuredOutputSchemasDir}/${STRUCTURED_OUTPUT_SCHEMAS_FILE}`,
    mcpDefinitions: `${mcpDefinitionsDir}/${MCP_DEFINITIONS_FILE}`,
    domainBrief: `${domainBriefDir}/${DOMAIN_BRIEF_FILE}`,
    formValidators: `${formValidatorsDir}/${FORM_VALIDATORS_FILE}`,
    stdlibRuntimeDir,
  };
}

export function generatedTargetsFor(irPath: string, schema?: Schema): GeneratedTarget[] {
  const paths = bundlePathsFor(irPath, schema);
  return [
    { kind: 'zod', path: paths.schemaTs },
    { kind: 'json-schema', path: paths.schemaJson },
    { kind: 'schema-index', path: paths.schemaIndex },
    { kind: 'convex', path: paths.convex },
    { kind: 'convex-validators', path: paths.convexValidators },
    { kind: 'convex-relationships', path: paths.convexRelationships },
    { kind: 'ai-tool-schemas', path: paths.aiToolSchemas },
    { kind: 'structured-output-schemas', path: paths.structuredOutputSchemas },
    { kind: 'mcp-definitions', path: paths.mcpDefinitions },
    { kind: 'domain-brief', path: paths.domainBrief },
    { kind: 'form-validators', path: paths.formValidators },
  ];
}

export function sourceLabelForIrPath(irPath: string): string {
  return relativePath(projectDirFor(irPath), assertContextureIrPath(irPath));
}

export function manifestKeyForGeneratedPath(irPath: string, generatedPath: string): string {
  return relativePath(projectDirFor(irPath), normalizeContexturePath(generatedPath));
}

export function resolveManifestGeneratedPath(
  irPath: string,
  manifestKey: string,
  schema?: Schema,
): string {
  const normalizedKey = normalizeContexturePath(manifestKey);
  const targets = generatedTargetsFor(irPath, schema);
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

export function generatedTargetForPath(
  irPath: string,
  targetPath: string,
  schema?: Schema,
): GeneratedTarget | null {
  const target = normalizeContexturePath(targetPath);
  return generatedTargetsFor(irPath, schema).find((candidate) => candidate.path === target) ?? null;
}

export function moduleSpecifierBetween(fromFile: string, toFile: string): string {
  const fromDir = dirname(normalizeContexturePath(fromFile));
  const target = stripTypescriptExtension(normalizeContexturePath(toFile));
  const relative = relativePath(fromDir, target);
  return relative.startsWith('.') ? relative : `./${relative}`;
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

function outputDirFor(
  schema: Schema | undefined,
  kind: OutputDirTargetKind,
  defaultDir: string,
  irDir: string,
): string {
  const configured = outputDirConfigFor(schema, kind);
  if (!configured) return defaultDir;
  if (isAbsolutePath(configured)) {
    throw new Error(`Contexture output dir for ${kind} must be relative to the IR file.`);
  }

  const normalized = normalizeContexturePath(configured);
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`Contexture output dir for ${kind} must stay within the IR directory.`);
  }

  return joinPath(irDir, normalized);
}

function outputDirConfigFor(schema: Schema | undefined, kind: OutputDirTargetKind): string | null {
  if (!schema?.outputs) return null;
  switch (kind) {
    case 'zod':
      return schema.outputs.zod?.dir ?? null;
    case 'json-schema':
      return schema.outputs.jsonSchema?.dir ?? null;
    case 'schema-index':
      return schema.outputs.schemaIndex?.dir ?? null;
    case 'convex':
    case 'convex-validators':
    case 'convex-relationships':
      return schema.outputs.convex?.dir ?? null;
    case 'stdlib-runtime':
      return schema.outputs.stdlibRuntime?.dir ?? null;
    case 'ai-tool-schemas':
      return schema.outputs.aiPipeline?.toolSchemas?.dir ?? null;
    case 'structured-output-schemas':
      return schema.outputs.aiPipeline?.structuredOutputs?.dir ?? null;
    case 'mcp-definitions':
      return schema.outputs.aiPipeline?.mcpDefinitions?.dir ?? null;
    case 'domain-brief':
      return schema.outputs.aiPipeline?.domainBrief?.dir ?? null;
    case 'form-validators':
      return schema.outputs.aiPipeline?.formValidators?.dir ?? null;
  }
}

function stripTypescriptExtension(path: string): string {
  return path.endsWith('.ts') ? path.slice(0, -'.ts'.length) : path;
}
