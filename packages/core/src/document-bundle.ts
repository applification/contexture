import { emit as emitAgentMd } from './emit-agent-md';
import { emit as emitClaudeMd } from './emit-claude-md';
import { emitTableCrud } from './emit-table-crud';
import type { Schema } from './ir';
import type { BundlePaths } from './paths';
import { baseNameFor, bundlePathsFor, contextureDirFor, projectRootFor } from './paths';
import type { FileEntry } from './pipeline';

export type DocumentMode = 'scratch' | 'project';

export interface DocumentBundleProbeFs {
  dirExists(path: string): Promise<boolean>;
}

export async function detectDocumentMode(
  irPath: string,
  fs: DocumentBundleProbeFs,
): Promise<DocumentMode> {
  return (await fs.dirExists(contextureDirFor(irPath))) ? 'project' : 'scratch';
}

export type SidecarKind = 'layout' | 'chat';

export interface SidecarEntry extends FileEntry {
  kind: SidecarKind;
}

export function buildSidecarEntries(
  paths: BundlePaths,
  sidecars: { layout: string; chat: string },
): SidecarEntry[] {
  return [
    { kind: 'layout', path: paths.layout, content: sidecars.layout },
    { kind: 'chat', path: paths.chat, content: sidecars.chat },
  ];
}

export type SeededArtifactKind = 'agent-guidance' | 'claude-guidance' | 'table-crud';

export interface SeededArtifact extends FileEntry {
  kind: SeededArtifactKind;
}

export interface SeededArtifactDeps {
  emitAgentMd?: (projectName: string) => string;
  emitClaudeMd?: (projectName: string) => string;
  emitTableCrud?: (schema: Schema, tableName: string) => string;
}

export function buildSeededArtifacts(
  schema: Schema,
  irPath: string,
  deps: SeededArtifactDeps = {},
): SeededArtifact[] {
  const paths = bundlePathsFor(irPath);
  const root = projectRootFor(paths.ir);
  if (!root) return [];

  const projectName = baseNameFor(paths.ir);
  const schemaDir = contextureDirFor(paths.ir).slice(0, -'/.contexture'.length);
  const renderAgentMd = deps.emitAgentMd ?? emitAgentMd;
  const renderClaudeMd = deps.emitClaudeMd ?? emitClaudeMd;
  const renderTableCrud = deps.emitTableCrud ?? emitTableCrud;

  const artifacts: SeededArtifact[] = [
    {
      kind: 'agent-guidance',
      path: `${root}/AGENTS.md`,
      content: renderAgentMd(projectName),
    },
    {
      kind: 'claude-guidance',
      path: `${root}/CLAUDE.md`,
      content: renderClaudeMd(projectName),
    },
  ];

  for (const type of schema.types) {
    if (type.kind !== 'object' || type.table !== true) continue;
    artifacts.push({
      kind: 'table-crud',
      path: `${schemaDir}/convex/${type.name}.ts`,
      content: renderTableCrud(schema, type.name),
    });
  }

  return artifacts;
}
