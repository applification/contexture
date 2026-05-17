import { createContextureMcpServer } from '@contexture/core/mcp-server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { STDLIB_REGISTRY } from '@shared/stdlib-registry';

export function isMcpMode(argv: readonly string[]): boolean {
  return argv.includes('--mcp');
}

export async function startMcpServer(): Promise<void> {
  const server = createContextureMcpServer({ stdlib: STDLIB_REGISTRY });

  try {
    await server.connect(new StdioServerTransport());
  } catch (err) {
    process.stderr.write(
      `Contexture MCP server failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
}
