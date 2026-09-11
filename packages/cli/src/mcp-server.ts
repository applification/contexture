import {
  type ContextureMcpServerOptions,
  createContextureMcpServer as createCoreContextureMcpServer,
} from '@contexture/core/mcp-server';
import { STDLIB_REGISTRY, STDLIB_RUNTIME_MODULES } from './stdlib-runtime';
import { CONTEXTURE_VERSION } from './version';

export function createContextureMcpServer(options: ContextureMcpServerOptions = {}) {
  return createCoreContextureMcpServer({
    ...options,
    version: options.version ?? CONTEXTURE_VERSION,
    stdlib: options.stdlib ?? STDLIB_REGISTRY,
    emitDeps: {
      stdlibRuntime: STDLIB_RUNTIME_MODULES,
      ...(options.emitDeps ?? {}),
    },
  });
}

export type { ContextureMcpServerOptions };
