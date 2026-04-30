export const IR_SUFFIX = '.contexture.json';
export const SCHEMA_TS_SUFFIX = '.schema.ts';
export const SCHEMA_JSON_SUFFIX = '.schema.json';
export const LAYOUT_FILE = 'layout.json';
export const CHAT_FILE = 'chat.json';
export const EMITTED_FILE = 'emitted.json';

export interface BundlePaths {
  ir: string;
  layout: string;
  chat: string;
  emitted: string;
  schemaTs: string;
  schemaJson: string;
  schemaIndex: string;
  convex: string;
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

export function bundlePathsFor(irPath: string): BundlePaths {
  if (!irPath.endsWith(IR_SUFFIX)) {
    throw new Error(`Expected a ${IR_SUFFIX} path, got: ${irPath}`);
  }
  const base = irPath.slice(0, -IR_SUFFIX.length);
  const ctxDir = contextureDirFor(irPath);
  const dir = ctxDir.slice(0, -'/.contexture'.length);
  return {
    ir: irPath,
    layout: `${ctxDir}/${LAYOUT_FILE}`,
    chat: `${ctxDir}/${CHAT_FILE}`,
    emitted: `${ctxDir}/${EMITTED_FILE}`,
    schemaTs: `${base}${SCHEMA_TS_SUFFIX}`,
    schemaJson: `${base}${SCHEMA_JSON_SUFFIX}`,
    schemaIndex: `${dir}/index.ts`,
    convex: `${dir}/convex/schema.ts`,
  };
}
