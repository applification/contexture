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

import { type ChatHistory, loadChatHistory, saveChatHistory } from '@renderer/model/chat-history';
import { emitConvexSchema as defaultEmitConvex } from '@renderer/model/emit-convex';
import { emit as defaultEmitJsonSchema } from '@renderer/model/emit-json-schema';
import { emit as defaultEmitZod } from '@renderer/model/emit-zod';
import type { Schema } from '@renderer/model/ir';
import { type Layout, loadLayout, saveLayout } from '@renderer/model/layout';
import { load as loadIR, save as saveIR } from '@renderer/model/load';

export const IR_SUFFIX = '.contexture.json';
export const SCHEMA_TS_SUFFIX = '.schema.ts';
export const SCHEMA_JSON_SUFFIX = '.schema.json';
/** Layout + chat now live inside `.contexture/` as implementation sidecars. */
export const LAYOUT_FILE = 'layout.json';
export const CHAT_FILE = 'chat.json';

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
  emitJsonSchema?: (schema: Schema) => unknown;
  /** Override for tests — defaults to the real Convex emitter. */
  emitConvex?: (schema: Schema) => string;
  /** Optional hook for main-process integration (e.g. `app.addRecentDocument`). */
  onRecentFileAdded?: (path: string) => void;
}

const MAX_RECENT = 10;

/**
 * Path to the `.contexture/` marker directory sitting next to the IR.
 * Project mode is detected by probing this directory on open.
 */
export function contextureDirFor(irPath: string): string {
  const slash = irPath.lastIndexOf('/');
  const dir = slash === -1 ? '' : irPath.slice(0, slash);
  return `${dir}/.contexture`;
}

export function bundlePathsFor(irPath: string): {
  ir: string;
  layout: string;
  chat: string;
  schemaTs: string;
  schemaJson: string;
  convex: string;
} {
  if (!irPath.endsWith(IR_SUFFIX)) {
    throw new Error(`Expected a ${IR_SUFFIX} path, got: ${irPath}`);
  }
  const base = irPath.slice(0, -IR_SUFFIX.length);
  const ctxDir = contextureDirFor(irPath);
  const dir = ctxDir.slice(0, -'/.contexture'.length);
  return {
    ir: irPath,
    // Layout + chat live inside `.contexture/` in project mode. In
    // scratch mode these paths are never read or written (scratch save
    // skips sidecars; scratch open tolerates ENOENT and uses defaults).
    layout: `${ctxDir}/${LAYOUT_FILE}`,
    chat: `${ctxDir}/${CHAT_FILE}`,
    schemaTs: `${base}${SCHEMA_TS_SUFFIX}`,
    schemaJson: `${base}${SCHEMA_JSON_SUFFIX}`,
    // Convex schema is the headline emitted artefact — `schema.ts`
    // sits next to the IR so `apps/*` re-export it via
    // `packages/schema/schema.ts`.
    convex: `${dir}/schema.ts`,
  };
}

export function createDocumentStore(deps: DocumentStoreDeps): DocumentStore {
  const {
    fs,
    recentFilesPath,
    emitZod = defaultEmitZod,
    emitJsonSchema = defaultEmitJsonSchema,
    emitConvex = defaultEmitConvex,
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
      await writeBundleAtomic([{ path: paths.ir, content: saveIR(input.schema) }]);
      await bumpRecent(irPath);
      return;
    }

    // Project mode: full bundle. Emit first — a throwing emitter must
    // abort before any write touches disk.
    const schemaTs = emitZod(input.schema, irPath);
    const jsonSchemaHeader = `// Generated by Contexture from ${irPath}. Do not edit.\n`;
    const schemaJson = jsonSchemaHeader + JSON.stringify(emitJsonSchema(input.schema), null, 2);
    const convexSource = emitConvex(input.schema);

    const files = [
      { path: paths.ir, content: saveIR(input.schema) },
      { path: paths.layout, content: saveLayout(input.layout) },
      { path: paths.chat, content: saveChatHistory(input.chat) },
      { path: paths.schemaTs, content: schemaTs },
      { path: paths.schemaJson, content: schemaJson },
      { path: paths.convex, content: convexSource },
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
  };
}
