/**
 * Electron wiring for the Agent SDK chat session.
 *
 * This module is intentionally thin: it assembles the pieces defined
 * elsewhere (`ops/`, `claude-bridge.ts`) against the real `ipcMain` +
 * `mainWindow.webContents` + the Agent SDK's MCP server, and exposes
 * `registerClaudeIpc` to the main entrypoint. All interesting logic
 * lives in the pure modules, which have their own tests.
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import type { Schema } from '@renderer/model/types';
import { type BrowserWindow, ipcMain } from 'electron';
import { z } from 'zod';
import { createOpTools, type OpToolDescriptor } from '../ops';
import {
  type BridgeTransport,
  type ForwardOpFn,
  makeIpcForwardOp,
  TurnContext,
} from './claude-bridge';

export interface ClaudeIpc {
  forwardOp: ForwardOpFn;
  turnContext: TurnContext;
  /** The assembled SDK MCP server with all 13 op tools bound. */
  mcpServer: ReturnType<typeof createSdkMcpServer>;
}

export function registerClaudeIpc(mainWindow: BrowserWindow): ClaudeIpc {
  const transport: BridgeTransport = {
    send: (id, payload) => {
      mainWindow.webContents.send('claude:op-request', { id, op: payload });
    },
  };

  ipcMain.on('claude:op-reply', (_evt, message: { id: string; result: unknown }) => {
    transport.onReply?.(message.id, message.result);
  });

  const forwardOp = makeIpcForwardOp(transport);
  const turnContext = new TurnContext();

  ipcMain.on('claude:turn-start-ir', (_evt, ir: Schema) => {
    turnContext.pushIR(ir);
  });

  const descriptors = createOpTools(forwardOp);
  const mcpServer = createSdkMcpServer({
    name: 'contexture-ops',
    version: '1.0.0',
    tools: descriptors.map(toSdkTool),
  });

  return { forwardOp, turnContext, mcpServer };
}

function toSdkTool(descriptor: OpToolDescriptor) {
  return tool(descriptor.name, descriptor.description, descriptor.inputSchema, async (args) => {
    const result = await descriptor.handler(args as Record<string, unknown>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  });
}

// Keep Zod in the surface area so downstream importers can build
// matching schemas without separately importing it.
export { z };
