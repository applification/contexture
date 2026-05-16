#!/usr/bin/env bun
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createContextureMcpServer } from './mcp-server';

const server = createContextureMcpServer();

server.connect(new StdioServerTransport()).catch((err) => {
  process.stderr.write(
    `Contexture MCP server failed: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
