/**
 * DocumentStore — one object that owns the `.contexture.json` file
 * lifecycle: opening (parse IR + sidecars), saving (build + atomic
 * write the five-file bundle), save-as (same, to a new path), and the
 * recent-files list.
 *
 * Rationale: before this lived as a flat pile of functions
 * (`save-bundle.ts` + `ipc/file.ts`) talking to module-level `fs` and
 * `app.getPath`. Wrapping them in a single interface with an injected
 * `FsAdapter` and emitter hooks makes the boundary testable without
 * touching disk (`MemFsAdapter`), and gives one place to reason about
 * atomicity + rollback.
 *
 * The adapter is deliberately minimal — just the ops the store needs
 * (readFile / writeFile / rename / remove / fileExists). Production
 * wires `NodeFsAdapter`; tests wire `MemFsAdapter`.
 */

import {
  buildSeededArtifacts,
  buildSidecarEntries,
  bundlePathsFor,
  type DocumentMode,
  emitAgentMd as defaultEmitAgentMd,
  emitClaudeMd as defaultEmitClaudeMd,
  emitJsonSchema as defaultEmitJsonSchema,
  emitSchemaIndex as defaultEmitSchemaIndex,
  emitTableCrud as defaultEmitTableCrud,
  emitZod as defaultEmitZod,
  detectDocumentMode,
  type FileEntry,
  load as loadIR,
  type Schema,
  save as saveIR,
  writeFilesAtomic,
  writeGeneratedBundle,
} from '@contexture/core';
import { type ChatHistory, loadChatHistory, saveChatHistory } from '@shared/chat-history';
import { type Layout, loadLayout, saveLayout } from '@shared/layout';
import { STDLIB_NAMESPACES } from '@shared/stdlib-registry';

/** Layout + chat now live inside `.contexture/` as implementation sidecars. */
/** Hash manifest of every @contexture-generated artefact, used for drift detection. */
export {
  bundlePathsFor,
  CHAT_FILE,
  contextureDirFor,
  type DocumentMode,
  EMITTED_FILE,
  type EmittedManifest,
  IR_SUFFIX,
  LAYOUT_FILE,
  SCHEMA_JSON_SUFFIX,
  SCHEMA_TS_SUFFIX,
} from '@contexture/core';

export interface LoadWarning {
  message: string;
  severity: 'warning' | 'error';
}

export interface DocumentBundle {
  irPath: string;
  mode: DocumentMode;
  schema: Schema;
  layout: Layout;
  chat: ChatHistory;
  warnings: LoadWarning[];
}

export interface SaveInput {
  schema: Schema;
  layout: Layout;
  chat: ChatHistory;
}

export interface RecentEntry {
  path: string;
}

export interface DocumentStore {
  open(irPath: string): Promise<DocumentBundle>;
  save(target: SaveInput & { irPath: string }): Promise<void>;
  saveAs(target: SaveInput, newPath: string): Promise<void>;
  recentFiles(): Promise<ReadonlyArray<RecentEntry>>;
  /** Raw file read — for the IPC layer to return original IR text so the
   *  renderer owns JSON-parse error surfacing. */
  readFile(path: string): Promise<string>;
  fileExists(path: string): Promise<boolean>;
}

export interface FsAdapter {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  /** Directory-presence probe used for project-mode detection. */
  dirExists(path: string): Promise<boolean>;
}

export interface DocumentStoreDeps {
  fs: FsAdapter;
  /** Absolute path to the recent-files ledger (typically under userData). */
  recentFilesPath: string;
  /** Override for tests — defaults to the real Zod emitter. */
  emitZod?: (schema: Schema, sourcePath: string) => string;
  /** Override for tests — defaults to the real JSON-schema emitter. */
  emitJsonSchema?: (schema: Schema, sourcePath?: string) => unknown;
  /** Override for tests — defaults to the real schema-index emitter. */
  emitSchemaIndex?: (baseName: string, sourcePath?: string) => string;
  /** Override for tests — defaults to the real AGENTS.md emitter. */
  emitAgentMd?: (projectName: string) => string;
  /** Override for tests — defaults to the real CLAUDE.md emitter. */
  emitClaudeMd?: (projectName: string) => string;
  /** Override for tests — defaults to the real Convex emitter. */
  emitConvex?: (schema: Schema, sourcePath?: string) => string;
  /** Override for tests — defaults to the real per-table CRUD emitter. */
  emitTableCrud?: (schema: Schema, tableName: string) => string;
  /** Optional hook for main-process integration (e.g. `app.addRecentDocument`). */
  onRecentFileAdded?: (path: string) => void;
}

const MAX_RECENT = 10;

export function createDocumentStore(deps: DocumentStoreDeps): DocumentStore {
  const {
    fs,
    recentFilesPath,
    emitZod = (s: Schema, sp: string) =>
      defaultEmitZod(s, sp, { stdlibNamespaces: STDLIB_NAMESPACES }),
    emitJsonSchema = (s: Schema, sp?: string) =>
      defaultEmitJsonSchema(s, undefined, sp, { stdlibNamespaces: STDLIB_NAMESPACES }),
    emitSchemaIndex = defaultEmitSchemaIndex,
    emitAgentMd = defaultEmitAgentMd,
    emitClaudeMd = defaultEmitClaudeMd,
    emitConvex,
    emitTableCrud = defaultEmitTableCrud,
    onRecentFileAdded,
  } = deps;

  async function readRecents(): Promise<string[]> {
    try {
      const raw = await fs.readFile(recentFilesPath);
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((f): f is string => typeof f === 'string');
    } catch {
      return [];
    }
  }

  async function bumpRecent(path: string): Promise<void> {
    const recent = (await readRecents()).filter((f) => f !== path);
    recent.unshift(path);
    if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;
    try {
      await fs.writeFile(recentFilesPath, JSON.stringify(recent));
      onRecentFileAdded?.(path);
    } catch {
      // Best-effort — a missing recent-files ledger must not block
      // the user's actual open/save.
    }
  }

  async function open(irPath: string): Promise<DocumentBundle> {
    const paths = bundlePathsFor(irPath);
    const warnings: LoadWarning[] = [];
    const mode = await detectDocumentMode(irPath, fs);

    const irRaw = await fs.readFile(paths.ir);
    const { schema, warnings: irWarnings } = loadIR(irRaw);
    for (const msg of irWarnings) warnings.push({ message: msg, severity: 'warning' });

    let layout: Layout = { version: '1', positions: {} };
    try {
      const layoutRaw = await fs.readFile(paths.layout);
      const { layout: parsedLayout, warnings: layoutWarnings } = loadLayout(layoutRaw);
      layout = parsedLayout;
      for (const msg of layoutWarnings) warnings.push({ message: msg, severity: 'warning' });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }

    let chat: ChatHistory = { version: '1', messages: [] };
    try {
      const chatRaw = await fs.readFile(paths.chat);
      const { history, warnings: chatWarnings } = loadChatHistory(chatRaw);
      chat = history;
      for (const msg of chatWarnings) warnings.push({ message: msg, severity: 'warning' });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }

    if (mode === 'project') {
      for (const artifact of buildSeededArtifacts(schema, irPath, {
        emitAgentMd,
        emitClaudeMd,
        emitTableCrud,
      })) {
        if (!(await fs.fileExists(artifact.path))) {
          await fs.writeFile(artifact.path, artifact.content);
        }
      }
    }

    await bumpRecent(irPath);
    return { irPath, mode, schema, layout, chat, warnings };
  }

  async function saveImpl(irPath: string, input: SaveInput): Promise<void> {
    const paths = bundlePathsFor(irPath);
    const mode = await detectDocumentMode(irPath, fs);

    // Scratch mode: the IR file is the whole document. No sidecars, no
    // mirrors — users who want persistent layout/chat or generated Convex
    // artefacts graduate to project mode by running `mkdir .contexture/`
    // (or, eventually, the New Project flow).
    if (mode === 'scratch') {
      await writeFilesAtomic(fs, [{ path: paths.ir, content: `${saveIR(input.schema)}\n` }]);
      await bumpRecent(irPath);
      return;
    }

    // Project mode: full bundle. Emit first — a throwing emitter must
    // abort before any write touches disk.
    const sidecars: FileEntry[] = buildSidecarEntries(paths, {
      layout: saveLayout(input.layout),
      chat: saveChatHistory(input.chat),
    });

    await writeGeneratedBundle({
      irPath,
      schema: input.schema,
      fs,
      sidecars,
      emitDeps: {
        emitZod,
        emitJsonSchema,
        emitSchemaIndex,
        emitConvex,
      },
    });
    await bumpRecent(irPath);
  }

  return {
    open,
    save: (target) => saveImpl(target.irPath, target),
    saveAs: (target, newPath) => saveImpl(newPath, target),
    async recentFiles() {
      const paths = await readRecents();
      return paths.map((path) => ({ path }));
    },
    readFile: (path) => fs.readFile(path),
    fileExists: (path) => fs.fileExists(path),
  };
}
