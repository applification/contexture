import type { Schema, StdlibRuntimeModule } from '@contexture/core';
import { IR_BY_NAMESPACE, NAMESPACES } from '@contexture/stdlib/registry';

const typeNamesByNamespace: Record<string, ReadonlySet<string>> = Object.fromEntries(
  NAMESPACES.map((namespace) => [
    namespace,
    new Set(IR_BY_NAMESPACE[namespace].types.map((type) => type.name)),
  ]),
);

export const STDLIB_REGISTRY = {
  namespaces: NAMESPACES,
  hasType: (namespace: string, typeName: string) =>
    typeNamesByNamespace[namespace]?.has(typeName) ?? false,
};

export const STDLIB_RUNTIME_MODULES: readonly StdlibRuntimeModule[] = NAMESPACES.map(
  (namespace) => ({
    namespace,
    schema: IR_BY_NAMESPACE[namespace] as Schema,
  }),
);
