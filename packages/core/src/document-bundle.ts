import { type ChatHistory, DEFAULT_CHAT_HISTORY, saveChatHistory } from './chat-history';
import {
  type GeneratedBundleFs,
  type GeneratedBundleWriteResult,
  writeGeneratedBundle,
} from './generated-bundle-writer';
import type { Schema } from './ir';
import { DEFAULT_LAYOUT, type Layout, saveLayout } from './layout';
import type { BundlePaths } from './paths';
import { bundlePathsFor, contextureDirFor } from './paths';
import type { EmitPipelineDeps, FileEntry } from './pipeline';

export type DocumentMode = 'bundle';

export interface DocumentBundleProbeFs {
  dirExists(path: string): Promise<boolean>;
}

export async function detectDocumentMode(
  irPath: string,
  fs: DocumentBundleProbeFs,
): Promise<DocumentMode> {
  await fs.dirExists(contextureDirFor(irPath));
  return 'bundle';
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

export interface InitialDocumentSidecars {
  layout?: Layout;
  chat?: ChatHistory;
}

export interface InitializeDocumentBundleInput {
  irPath: string;
  schema: Schema;
  sidecars?: InitialDocumentSidecars;
  fs: GeneratedBundleFs;
  emitDeps?: EmitPipelineDeps;
  driftPreflight?: boolean;
  generatedTargetPreflight?: boolean;
}

export async function initializeDocumentBundle(
  input: InitializeDocumentBundleInput,
): Promise<GeneratedBundleWriteResult> {
  const paths = bundlePathsFor(input.irPath);
  const sidecars = buildSidecarEntries(paths, {
    layout: saveLayout(input.sidecars?.layout ?? DEFAULT_LAYOUT),
    chat: saveChatHistory(input.sidecars?.chat ?? DEFAULT_CHAT_HISTORY),
  });

  return writeGeneratedBundle({
    irPath: paths.ir,
    schema: input.schema,
    fs: input.fs,
    emitDeps: input.emitDeps,
    sidecars,
    driftPreflight: input.driftPreflight,
    generatedTargetPreflight: input.generatedTargetPreflight,
  });
}
