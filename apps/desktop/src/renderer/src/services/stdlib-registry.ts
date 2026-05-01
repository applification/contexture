/**
 * Stdlib registry surface consumed by the ref resolver.
 *
 * The canonical data lives in `@contexture/stdlib/registry` — this
 * module converts the namespace-indexed IR sidecars into a shape the
 * ref resolver can query directly:
 *
 *   `resolve('common.Email')` → `true`
 *   `resolve('common.NoSuch')` → `false`
 *   `resolve('place.CountryCode')` → `true`
 *
 * Production wires the default export into `validate()` so schemas
 * that reference qualified stdlib types without an `add_import` still
 * validate cleanly. Tests can supply a custom registry (empty, or
 * with a synthetic namespace) without touching the stdlib package.
 */
import type { StdlibCatalog } from '@contexture/core/semantic-validation';
import { IR_BY_NAMESPACE, NAMESPACES, type Namespace } from '@contexture/stdlib/registry';
import type { StdlibRegistry as SystemPromptStdlibRegistry } from '../chat/system-prompt';

/**
 * Renderer-facing stdlib registry. Identical shape to the core
 * `StdlibCatalog` so that `STDLIB_REGISTRY` can be passed straight into
 * `apply(schema, op, catalog)` and `checkSemantic(schema, catalog)`.
 */
export type StdlibRegistry = StdlibCatalog;

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
 * Adapter for the system-prompt builder's registry shape, which expects
 * a flat `entries` array rather than the namespace lookup surface.
 *
 * Descriptions fall back to the namespace metadata when a type lacks its
 * own — keeps the prompt informative without forcing every stdlib entry
 * to duplicate its namespace's summary.
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
