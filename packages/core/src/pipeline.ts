import { createHash } from 'node:crypto';
import { emit as emitZod } from './emit-zod';
import {
  type EmitPipelineDeps,
  GENERATED_TARGETS,
  type GeneratedTargetEmitOptions,
  isGeneratedTargetEnabled,
  type StdlibRuntimeModule,
} from './generated-targets';
import type { FieldType, ImportDecl, Schema } from './ir';
import {
  bundlePathsFor,
  manifestKeyForGeneratedPath,
  moduleSpecifierBetween,
  sourceLabelForIrPath,
} from './paths';

export type { EmitPipelineDeps } from './generated-targets';
export type { BundlePaths } from './paths';
export {
  assertContextureIrPath,
  baseNameFor,
  bundlePathsFor,
  CHANGE_LOG_FILE,
  CHAT_FILE,
  CONVEX_VALIDATORS_FILE,
  contextureDirFor,
  EMITTED_FILE,
  type GeneratedTarget,
  type GeneratedTargetKind,
  generatedTargetForPath,
  generatedTargetsFor,
  IR_SUFFIX,
  LAYOUT_FILE,
  manifestKeyForGeneratedPath,
  moduleSpecifierBetween,
  projectDirFor,
  resolveManifestGeneratedPath,
  SCHEMA_DIR,
  SCHEMA_JSON_SUFFIX,
  SCHEMA_TS_SUFFIX,
  STDLIB_RUNTIME_DIR,
  sourceLabelForIrPath,
} from './paths';

export interface EmittedManifest {
  version: '1';
  files: Record<string, string>;
}

export interface FileEntry {
  path: string;
  content: string;
}

export interface EmitPipelineResult {
  emitted: FileEntry[];
  manifest: EmittedManifest;
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function buildManifest(irPath: string, entries: ReadonlyArray<FileEntry>): EmittedManifest {
  const files: Record<string, string> = {};
  for (const { path, content } of entries) {
    files[manifestKeyForGeneratedPath(irPath, path)] = hashContent(content);
  }
  return { version: '1', files };
}

export function runEmitPipeline(
  schema: Schema,
  irPath: string,
  deps: EmitPipelineDeps = {},
): EmitPipelineResult {
  const sourceLabel = sourceLabelForIrPath(irPath);
  const paths = bundlePathsFor(irPath, schema);
  const stdlibRuntimePlan = planStdlibRuntime(schema, paths.schemaTs, paths.stdlibRuntimeDir, deps);
  const targetOptions: GeneratedTargetEmitOptions = {
    stdlibNamespaces: stdlibRuntimePlan.availableNamespaces,
    stdlibModuleForNamespace: stdlibRuntimePlan.moduleForNamespace,
  };
  const emitted = GENERATED_TARGETS.filter((target) =>
    isGeneratedTargetEnabled(schema, target.kind),
  ).map((target) => ({
    path: target.path(paths),
    content: target.emit(schema, sourceLabel, paths, deps, targetOptions),
  }));
  const stdlibRuntimeEntries = stdlibRuntimePlan.modules.map((module) => {
    const path = `${paths.stdlibRuntimeDir}/${module.namespace}.ts`;
    return {
      path,
      content: emitZod(module.schema, `@contexture/runtime/${module.namespace}`, {
        stdlibNamespaces: stdlibRuntimePlan.availableNamespaces,
        stdlibModuleForNamespace: (namespace) =>
          moduleSpecifierBetween(path, `${paths.stdlibRuntimeDir}/${namespace}.ts`),
      }),
    };
  });
  const allEmitted = [...emitted, ...stdlibRuntimeEntries];

  return { emitted: allEmitted, manifest: buildManifest(irPath, allEmitted) };
}

interface StdlibRuntimePlan {
  availableNamespaces: readonly string[];
  modules: readonly StdlibRuntimeModule[];
  moduleForNamespace: (namespace: string) => string | null;
}

function planStdlibRuntime(
  schema: Schema,
  schemaTsPath: string,
  stdlibRuntimeDir: string,
  deps: EmitPipelineDeps,
): StdlibRuntimePlan {
  const modulesByNamespace = new Map(
    (deps.stdlibRuntime ?? []).map((module) => [module.namespace, module]),
  );
  const availableNamespaces = [...modulesByNamespace.keys()].sort();
  const usedNamespaces = usedStdlibNamespaces(schema, modulesByNamespace);
  const modules = [...usedNamespaces]
    .sort()
    .map((namespace) => modulesByNamespace.get(namespace))
    .filter((module): module is StdlibRuntimeModule => module !== undefined);

  return {
    availableNamespaces,
    modules,
    moduleForNamespace(namespace) {
      if (!modulesByNamespace.has(namespace)) return null;
      return moduleSpecifierBetween(schemaTsPath, `${stdlibRuntimeDir}/${namespace}.ts`);
    },
  };
}

function usedStdlibNamespaces(
  schema: Schema,
  modulesByNamespace: ReadonlyMap<string, StdlibRuntimeModule>,
): Set<string> {
  const importNamespacesByAlias = new Map<string, string>();
  for (const imp of schema.imports ?? []) {
    const namespace = namespaceForImport(imp);
    if (namespace && modulesByNamespace.has(namespace)) {
      importNamespacesByAlias.set(imp.alias, namespace);
    }
  }

  const namespaces = new Set<string>();
  const visit = (fieldType: FieldType): void => {
    if (fieldType.kind === 'array') {
      visit(fieldType.element);
      return;
    }
    if (fieldType.kind !== 'ref') return;

    const dot = fieldType.typeName.indexOf('.');
    if (dot === -1) return;
    const alias = fieldType.typeName.slice(0, dot);
    const namespace =
      importNamespacesByAlias.get(alias) ?? (modulesByNamespace.has(alias) ? alias : null);
    if (namespace) namespaces.add(namespace);
  };

  for (const type of schema.types) {
    if (type.kind !== 'object') continue;
    for (const field of type.fields) visit(field.type);
  }

  return namespaces;
}

function namespaceForImport(imp: ImportDecl): string | null {
  if (imp.kind !== 'stdlib') return null;
  return imp.path.slice('@contexture/'.length);
}
