/**
 * Desktop stdlib registry adapters.
 *
 * The canonical data lives in `@contexture/stdlib/registry`. This module
 * converts those namespace-indexed IR sidecars into the small lookup surfaces
 * used by core validation, emitters, and chat prompts.
 */
import type { StdlibCatalog } from '@contexture/core/semantic-validation';
import { IR_BY_NAMESPACE, NAMESPACES, type Namespace } from '@contexture/stdlib/registry';
import type { StdlibRegistry as SystemPromptStdlibRegistry } from './system-prompt';

/**
 * Desktop-facing stdlib registry. Identical shape to the core
 * `StdlibCatalog` so callers can pass it straight into `apply()` and
 * `checkSemantic()`.
 */
export type StdlibRegistry = StdlibCatalog;

export const STDLIB_NAMESPACES = NAMESPACES;

export function buildStdlibRegistry(): StdlibRegistry {
  const typeNamesByNamespace: Record<string, ReadonlySet<string>> = Object.fromEntries(
    NAMESPACES.map((ns) => [ns, new Set(IR_BY_NAMESPACE[ns].types.map((t) => t.name))]),
  );

  return {
    namespaces: NAMESPACES,
    hasType: (namespace, typeName) => typeNamesByNamespace[namespace]?.has(typeName) ?? false,
  };
}

/** Singleton for app runtime; tests build their own via `buildStdlibRegistry`. */
export const STDLIB_REGISTRY: StdlibRegistry = buildStdlibRegistry();

/**
 * Adapter for the system-prompt builder's registry shape, which expects a flat
 * `entries` array rather than the namespace lookup surface.
 */
export function buildSystemPromptStdlibRegistry(): SystemPromptStdlibRegistry {
  const entries: SystemPromptStdlibRegistry['entries'] = [];
  for (const ns of NAMESPACES) {
    for (const t of IR_BY_NAMESPACE[ns].types) {
      const description =
        (typeof t.description === 'string' && t.description) ||
        IR_BY_NAMESPACE[ns].metadata?.description ||
        '';
      entries.push({ namespace: ns, name: t.name, description });
    }
  }
  return { entries };
}

/** System-prompt registry singleton — same data as STDLIB_REGISTRY, flat shape. */
export const SYSTEM_PROMPT_STDLIB: SystemPromptStdlibRegistry = buildSystemPromptStdlibRegistry();

export type { Namespace };
