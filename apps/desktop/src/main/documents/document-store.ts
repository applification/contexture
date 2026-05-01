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
  bundlePathsFor,
  contextureDirFor,
  IR_SUFFIX,
  projectRootFor,
  runEmitPipeline,
} from '@contexture/core';
import { NAMESPACES as STDLIB_NAMESPACES } from '@contexture/stdlib/registry';
import { type ChatHistory, loadChatHistory, saveChatHistory } from '@renderer/model/chat-history';
import { emit as defaultEmitClaudeMd } from '@renderer/model/emit-claude-md';
import { emit as defaultEmitJsonSchema } from '@renderer/model/emit-json-schema';
import { emit as defaultEmitSchemaIndex } from '@renderer/model/emit-schema-index';
import { emitTableCrud as defaultEmitTableCrud } from '@renderer/model/emit-table-crud';
import { emit as defaultEmitZod } from '@renderer/model/emit-zod';
import type { Schema } from '@renderer/model/ir';
import { type Layout, loadLayout, saveLayout } from '@renderer/model/layout';
import { load as loadIR, save as saveIR } from '@renderer/model/load';

/** Layout + chat now live inside `.contexture/` as implementation sidecars. */
/** Hash manifest of every @contexture-generated artefact, used for drift detection. */
export {
  bundlePathsFor,
  CHAT_FILE,
  contextureDirFor,
  EMITTED_FILE,
  type EmittedManifest,
  IR_SUFFIX,
  LAYOUT_FILE,
  projectRootFor,
  SCHEMA_JSON_SUFFIX,
  SCHEMA_TS_SUFFIX,
} from '@contexture/core';

// Legacy sibling-file names — kept exported so `main/ipc/file.ts` can
// continue to read pre-project-mode documents without hard-breaking a
// user's scratch round-trip. Project-mode save no longer writes these.
export const LAYOUT_SUFFIX = '.contexture.layout.json';
export const CHAT_SUFFIX = '.contexture.chat.json';

export interface LoadWarning {
  message: string;
  severity: 'warning' | 'error';
}

export type DocumentMode = 'scratch' | 'project';

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

/** IR file base name — `/work/garden.contexture.json` → `garden`. */
function baseNameFor(irPath: string): string {
  const slash = irPath.lastIndexOf('/');
  const leaf = slash === -1 ? irPath : irPath.slice(slash + 1);
  return leaf.slice(0, -IR_SUFFIX.length);
}

export function createDocumentStore(deps: DocumentStoreDeps): DocumentStore {
  const {
    fs,
    recentFilesPath,
    emitZod = (s: Schema, sp: string) =>
      defaultEmitZod(s, sp, { stdlibNamespaces: STDLIB_NAMESPACES }),
    emitJsonSchema = (s: Schema, sp?: string) =>
      defaultEmitJsonSchema(s, undefined, sp, { stdlibNamespaces: STDLIB_NAMESPACES }),
    emitSchemaIndex = defaultEmitSchemaIndex,
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
    const mode: DocumentMode = (await fs.dirExists(contextureDirFor(irPath)))
      ? 'project'
      : 'scratch';

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
      const root = projectRootFor(irPath);
      if (root) {
        const claudePath = `${root}/CLAUDE.md`;
        if (!(await fs.fileExists(claudePath))) {
          await fs.writeFile(claudePath, emitClaudeMd(baseNameFor(irPath)));
        }
        // Seed one `packages/contexture/convex/<table>.ts` per table-flagged
        // object. Written only if missing — these are `@contexture-seeded`,
        // owned by the user/coding agent from first write on.
        const schemaDir = contextureDirFor(irPath).slice(0, -'/.contexture'.length);
        for (const type of schema.types) {
          if (type.kind !== 'object' || type.table !== true) continue;
          const crudPath = `${schemaDir}/convex/${type.name}.ts`;
          if (!(await fs.fileExists(crudPath))) {
            await fs.writeFile(crudPath, emitTableCrud(schema, type.name));
          }
        }
      }
    }

    await bumpRecent(irPath);
    return { irPath, mode, schema, layout, chat, warnings };
  }

  async function writeBundleAtomic(
    files: ReadonlyArray<{ path: string; content: string }>,
  ): Promise<void> {
    interface Snapshot {
      path: string;
      existed: boolean;
      prior?: string;
      renamed: boolean;
    }
    const snapshots: Snapshot[] = [];
    try {
      for (const file of files) {
        const snap: Snapshot = { path: file.path, existed: false, renamed: false };
        try {
          snap.prior = await fs.readFile(file.path);
          snap.existed = true;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        }
        snapshots.push(snap);

        const tmp = `${file.path}.tmp`;
        await fs.writeFile(tmp, file.content);
        await fs.rename(tmp, file.path);
        snap.renamed = true;
      }
    } catch (err) {
      for (const snap of snapshots.slice().reverse()) {
        if (snap.renamed) {
          if (snap.existed && snap.prior !== undefined) {
            await fs.writeFile(snap.path, snap.prior).catch(() => undefined);
          } else {
            await fs.remove(snap.path).catch(() => undefined);
          }
        }
        await fs.remove(`${snap.path}.tmp`).catch(() => undefined);
      }
      throw err;
    }
  }

  async function saveImpl(irPath: string, input: SaveInput): Promise<void> {
    const paths = bundlePathsFor(irPath);
    const mode: DocumentMode = (await fs.dirExists(contextureDirFor(irPath)))
      ? 'project'
      : 'scratch';

    // Scratch mode: the IR file is the whole document. No sidecars, no
    // mirrors — users who want persistent layout/chat or generated Convex
    // artefacts graduate to project mode by running `mkdir .contexture/`
    // (or, eventually, the New Project flow).
    if (mode === 'scratch') {
      await writeBundleAtomic([{ path: paths.ir, content: `${saveIR(input.schema)}\n` }]);
      await bumpRecent(irPath);
      return;
    }

    // Project mode: full bundle. Emit first — a throwing emitter must
    // abort before any write touches disk.
    const { emitted, manifest } = runEmitPipeline(input.schema, irPath, {
      emitZod,
      emitJsonSchema,
      emitSchemaIndex,
      emitConvex,
    });

    const files = [
      { path: paths.ir, content: `${saveIR(input.schema)}\n` },
      { path: paths.layout, content: saveLayout(input.layout) },
      { path: paths.chat, content: saveChatHistory(input.chat) },
      ...emitted,
      { path: paths.emitted, content: `${JSON.stringify(manifest, null, 2)}\n` },
    ];

    await writeBundleAtomic(files);
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
