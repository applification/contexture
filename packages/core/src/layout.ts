/**
 * Layout sidecar I/O (`.contexture/layout.json`).
 *
 * The layout sidecar is disposable editor state. Invalid or unknown versions
 * are discarded with a warning rather than blocking the Contexture IR.
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

  const layout: Layout = { version: LAYOUT_VERSION, positions: sanitisePositions(obj.positions) };
  const groups = sanitiseGroups(obj.groups);
  const viewport = sanitiseViewport(obj.viewport);
  if (groups) layout.groups = groups;
  if (viewport) layout.viewport = viewport;
  return { layout, warnings: [] };
}

export function saveLayout(layout: Layout): string {
  return JSON.stringify(layout, null, 2);
}

export function renameLayoutKey(layout: Layout, from: string, to: string): Layout {
  if (from === to) return layout;
  const positions = { ...layout.positions };
  if (from in positions) {
    const prior = positions[from];
    if (prior) positions[to] = prior;
    delete positions[from];
  }
  const groups = layout.groups?.map((group) =>
    group.members?.includes(from)
      ? { ...group, members: group.members.map((member) => (member === from ? to : member)) }
      : group,
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
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const { x, y } = value as { x?: unknown; y?: unknown };
    if (typeof x === 'number' && typeof y === 'number') out[key] = { x, y };
  }
  return out;
}

function sanitiseGroups(input: unknown): GroupFrame[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out: GroupFrame[] = [];
  for (const value of input) {
    if (!value || typeof value !== 'object') continue;
    const { id, label, x, y, width, height, members } = value as Record<string, unknown>;
    if (
      typeof id === 'string' &&
      typeof label === 'string' &&
      typeof x === 'number' &&
      typeof y === 'number' &&
      typeof width === 'number' &&
      typeof height === 'number'
    ) {
      const frame: GroupFrame = { id, label, x, y, width, height };
      if (Array.isArray(members) && members.every((member) => typeof member === 'string')) {
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
  return typeof x === 'number' && typeof y === 'number' && typeof zoom === 'number'
    ? { x, y, zoom }
    : undefined;
}
