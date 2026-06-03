import {
  type ContextureMcpServerOptions,
  createContextureMcpServer as createCoreContextureMcpServer,
} from '@contexture/core/mcp-server';
import { STDLIB_REGISTRY, STDLIB_RUNTIME_MODULES } from './stdlib-runtime';

declare const CONTEXTURE_MCP_VERSION: string | undefined;

const DEFAULT_MCP_VERSION =
  typeof CONTEXTURE_MCP_VERSION === 'string' ? CONTEXTURE_MCP_VERSION : '0.0.0';

export function createContextureMcpServer(options: ContextureMcpServerOptions = {}) {
  return createCoreContextureMcpServer({
    ...options,
    version: options.version ?? DEFAULT_MCP_VERSION,
    stdlib: options.stdlib ?? STDLIB_REGISTRY,
    emitDeps: {
      stdlibRuntime: STDLIB_RUNTIME_MODULES,
      ...(options.emitDeps ?? {}),
    },
  });
}

export type { ContextureMcpServerOptions };
