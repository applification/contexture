import {
  type ContextureMcpServerOptions,
  createContextureMcpServer as createCoreContextureMcpServer,
} from '@contexture/core/mcp-server';
import { STDLIB_REGISTRY, STDLIB_RUNTIME_MODULES } from './stdlib-runtime';

export function createContextureMcpServer(options: ContextureMcpServerOptions = {}) {
  return createCoreContextureMcpServer({
    ...options,
    stdlib: options.stdlib ?? STDLIB_REGISTRY,
    emitDeps: {
      stdlibRuntime: STDLIB_RUNTIME_MODULES,
      ...(options.emitDeps ?? {}),
    },
  });
}

export type { ContextureMcpServerOptions };
