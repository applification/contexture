/**
 * Layout sidecar I/O (`<name>.contexture.layout.json`).
 *
 * The layout sidecar is disposable: it carries per-type canvas positions,
 * optional group frames, and the last viewport. It is version-tombstoned
 * with `version: '1'`; if we read a file whose version we don't recognise
 * we discard it and return defaults with a warning, rather than throwing.
 * The IR itself is the source of truth — nothing here should be allowed
 * to block a user from opening their schema.
 */

export interface NodePosition {
  x: number;
  y: number;
}

export interface GroupFrame {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  members?: string[];
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Layout {
  version: '1';
  /** Keyed by `TypeDef.name`. */
  positions: Record<string, NodePosition>;
  groups?: GroupFrame[];
  viewport?: Viewport;
}

export interface LoadLayoutResult {
  layout: Layout;
  warnings: string[];
}

export const LAYOUT_VERSION = '1';

export const DEFAULT_LAYOUT: Layout = {
  version: LAYOUT_VERSION,
  positions: {},
};

/**
 * Parses raw JSON layout text. Returns defaults + a warning on any failure
 * (malformed JSON, unrecognised version, shape mismatch). Never throws.
 */
export function loadLayout(raw: string): LoadLayoutResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      layout: defaults(),
      warnings: [`Layout sidecar discarded: invalid JSON (${detail}).`],
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      layout: defaults(),
      warnings: ['Layout sidecar discarded: not an object.'],
    };
  }

  const obj = parsed as Record<string, unknown>;
  const version = typeof obj.version === 'string' ? obj.version : undefined;
  if (version !== LAYOUT_VERSION) {
    return {
      layout: defaults(),
      warnings: [
        `Layout sidecar discarded: unrecognised version "${String(version)}" ` +
          `(expected "${LAYOUT_VERSION}").`,
      ],
    };
  }

  const positions = sanitisePositions(obj.positions);
  const groups = sanitiseGroups(obj.groups);
  const viewport = sanitiseViewport(obj.viewport);

  const layout: Layout = { version: LAYOUT_VERSION, positions };
  if (groups) layout.groups = groups;
  if (viewport) layout.viewport = viewport;
  return { layout, warnings: [] };
}

export function saveLayout(layout: Layout): string {
  return JSON.stringify(layout, null, 2);
}

/**
 * Lockstep rename: when a `TypeDef` is renamed, update the layout key
 * (and any group members list) to match. Returns a new layout; does not
 * mutate. If `from` is absent, the layout is returned unchanged.
 */
export function renameLayoutKey(layout: Layout, from: string, to: string): Layout {
  if (from === to) return layout;
  const positions = { ...layout.positions };
  if (from in positions) {
    positions[to] = positions[from];
    delete positions[from];
  }
  const groups = layout.groups?.map((g) =>
    g.members?.includes(from) ? { ...g, members: g.members.map((m) => (m === from ? to : m)) } : g,
  );
  const next: Layout = { ...layout, positions };
  if (groups) next.groups = groups;
  return next;
}

function defaults(): Layout {
  return { version: LAYOUT_VERSION, positions: {} };
}

function sanitisePositions(input: unknown): Record<string, NodePosition> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, NodePosition> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v && typeof v === 'object') {
      const { x, y } = v as { x?: unknown; y?: unknown };
      if (typeof x === 'number' && typeof y === 'number') out[k] = { x, y };
    }
  }
  return out;
}

function sanitiseGroups(input: unknown): GroupFrame[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out: GroupFrame[] = [];
  for (const g of input) {
    if (!g || typeof g !== 'object') continue;
    const { id, label, x, y, width, height, members } = g as Record<string, unknown>;
    if (
      typeof id === 'string' &&
      typeof label === 'string' &&
      typeof x === 'number' &&
      typeof y === 'number' &&
      typeof width === 'number' &&
      typeof height === 'number'
    ) {
      const frame: GroupFrame = { id, label, x, y, width, height };
      if (Array.isArray(members) && members.every((m) => typeof m === 'string')) {
        frame.members = members as string[];
      }
      out.push(frame);
    }
  }
  return out;
}

function sanitiseViewport(input: unknown): Viewport | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const { x, y, zoom } = input as { x?: unknown; y?: unknown; zoom?: unknown };
  if (typeof x === 'number' && typeof y === 'number' && typeof zoom === 'number') {
    return { x, y, zoom };
  }
  return undefined;
}
