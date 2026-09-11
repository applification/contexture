#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createContextureMcpServer } from './mcp-server';
import { CONTEXTURE_VERSION } from './version';

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  process.stdout.write(`${CONTEXTURE_VERSION}\n`);
  process.exit(0);
}

const server = createContextureMcpServer();
const transport = new StdioServerTransport();

let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  void transport.close().finally(() => process.exit(0));
}

process.stdin.once('end', shutdown);
process.stdin.once('close', shutdown);

server.connect(transport).catch((err) => {
  process.stderr.write(
    `Contexture MCP server failed: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
