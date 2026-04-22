/**
 * Electron wiring for the Agent SDK chat session.
 *
 * This module is intentionally thin: it assembles the pieces defined
 * elsewhere (`ops/`, `claude-bridge.ts`) against the real `ipcMain` +
 * `mainWindow.webContents` + the Agent SDK's MCP server, and exposes
 * `registerClaudeIpc` to the main entrypoint. All interesting logic
 * lives in the pure modules, which have their own tests.
 */

import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import type { Schema } from '@renderer/model/types';
import { SYSTEM_PROMPT_STDLIB } from '@renderer/services/stdlib-registry';
import { type BrowserWindow, ipcMain } from 'electron';
import { z } from 'zod';
import { createOpTools, type OpToolDescriptor } from '../ops';
import { ChatDriver, type DriverQueryFn, type DriverSdkMessage } from './chat-driver';
import { ChatTurnController, type TurnTransport } from './chat-turn';
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
  /**
   * Wraps a chat turn's op-dispatch body in `turn:begin` / `turn:commit`
   * (or `turn:rollback` on failure). The Agent-SDK driver calls
   * `turnController.run(async () => { for await (const msg of query(...)) … })`
   * once per user turn.
   */
  turnController: ChatTurnController;
  /** Chat driver orchestrating Agent-SDK `query()` per user message. */
  chatDriver: ChatDriver;
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

  const turnTransport: TurnTransport = {
    send: (channel, payload) => {
      mainWindow.webContents.send(channel, payload);
    },
  };
  const turnController = new ChatTurnController(turnTransport);

  const sdkQuery: DriverQueryFn = async function* ({ prompt, systemPrompt }) {
    const iterator = query({
      prompt,
      options: {
        systemPrompt,
        mcpServers: { 'contexture-ops': mcpServer },
      },
    });
    for await (const msg of iterator) {
      const mapped = mapSdkMessage(msg);
      if (mapped) yield mapped;
    }
  };

  const chatDriver = new ChatDriver({
    query: sdkQuery,
    transport: {
      send: (channel, payload) => mainWindow.webContents.send(channel, payload),
    },
    turnController,
    getCurrentIR: () => turnContext.current(),
    stdlibRegistry: SYSTEM_PROMPT_STDLIB,
  });

  ipcMain.handle('chat:send', async (_evt, userMessage: string) => {
    try {
      await chatDriver.send(userMessage);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  return { forwardOp, turnContext, mcpServer, turnController, chatDriver };
}

/**
 * Squeeze the SDK's wide message union down to the `DriverSdkMessage`
 * shape. Only `assistant`, `user` tool-use blocks, and `result` are
 * forwarded to the renderer — intermediate status / stream / hook
 * messages are dropped to keep the chat transcript clean.
 */
function mapSdkMessage(msg: unknown): DriverSdkMessage | null {
  if (!msg || typeof msg !== 'object') return null;
  const m = msg as { type: string; message?: { content?: unknown } };
  if (m.type === 'assistant') {
    const content = Array.isArray(m.message?.content) ? m.message?.content : [];
    const textParts = content
      .filter(
        (p): p is { type: 'text'; text: string } =>
          !!p &&
          typeof p === 'object' &&
          (p as { type?: unknown }).type === 'text' &&
          typeof (p as { text?: unknown }).text === 'string',
      )
      .map((p) => p.text);
    const toolUseParts = content.filter(
      (p): p is { type: 'tool_use'; name: string; input: unknown } =>
        !!p && typeof p === 'object' && (p as { type?: unknown }).type === 'tool_use',
    );
    if (textParts.length > 0) {
      return { type: 'assistant', text: textParts.join('') };
    }
    if (toolUseParts.length > 0) {
      return {
        type: 'tool_use',
        name: toolUseParts[0].name,
        input: toolUseParts[0].input,
      };
    }
    return null;
  }
  if (m.type === 'result') {
    const rm = m as { type: 'result'; subtype?: string; is_error?: boolean; result?: string };
    return {
      type: 'result',
      ok: rm.subtype === 'success' && rm.is_error !== true,
      error: rm.is_error ? rm.result : undefined,
    };
  }
  return null;
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
