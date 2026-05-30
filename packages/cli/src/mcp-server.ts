import {
  type ContextureMcpServerOptions,
  createContextureMcpServer as createCoreContextureMcpServer,
} from '@contexture/core/mcp-server';
import { IR_BY_NAMESPACE, NAMESPACES } from '@contexture/stdlib/registry';

const typeNamesByNamespace: Record<string, ReadonlySet<string>> = Object.fromEntries(
  NAMESPACES.map((namespace) => [
    namespace,
    new Set(IR_BY_NAMESPACE[namespace].types.map((type) => type.name)),
  ]),
);

const STDLIB_REGISTRY = {
  namespaces: NAMESPACES,
  hasType: (namespace: string, typeName: string) =>
    typeNamesByNamespace[namespace]?.has(typeName) ?? false,
};

export function createContextureMcpServer(options: ContextureMcpServerOptions = {}) {
  return createCoreContextureMcpServer({
    ...options,
    stdlib: options.stdlib ?? STDLIB_REGISTRY,
  });
}

export type { ContextureMcpServerOptions };
