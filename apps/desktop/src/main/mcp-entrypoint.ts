import { createContextureMcpServer } from '@contexture/core/mcp-server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { STDLIB_REGISTRY, STDLIB_RUNTIME_MODULES } from '@shared/stdlib-registry';
import { app } from 'electron';

export function isMcpMode(argv: readonly string[]): boolean {
  return argv.includes('--mcp');
}

export async function startMcpServer(): Promise<void> {
  const server = createContextureMcpServer({
    version: app.getVersion(),
    stdlib: STDLIB_REGISTRY,
    emitDeps: { stdlibRuntime: STDLIB_RUNTIME_MODULES },
  });
  const transport = new StdioServerTransport();

  let shuttingDown = false;
  function shutdown(): void {
    if (shuttingDown) return;
    shuttingDown = true;
    void transport.close().finally(() => process.exit(0));
  }

  process.stdin.once('end', shutdown);
  process.stdin.once('close', shutdown);

  try {
    await server.connect(transport);
  } catch (err) {
    process.stderr.write(
      `Contexture MCP server failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
}
