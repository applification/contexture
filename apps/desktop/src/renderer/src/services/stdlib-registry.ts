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
import { IR_BY_NAMESPACE, NAMESPACES, type Namespace } from '@contexture/stdlib/registry';

export interface StdlibRegistry {
  /** All stdlib namespace aliases (`common`, `identity`, …). */
  namespaces: readonly string[];
  /** Returns true iff the namespace defines a type with that name. */
  hasType: (namespace: string, typeName: string) => boolean;
}

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

export type { Namespace };
