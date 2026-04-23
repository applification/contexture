/**
 * Electron wiring for the Agent SDK chat session.
 *
 * Thin assembly: it builds the MCP tool server from `ops/`, detects the
 * `claude` CLI, and hands a `ChatSession` the ports it needs. All chat
 * orchestration lives in `main/chat/chat-session.ts` — this module only
 * registers IPC handlers and forwards setters onto the session.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import type { Schema } from '@renderer/model/ir';
import { SYSTEM_PROMPT_STDLIB } from '@renderer/services/stdlib-registry';
import * as Sentry from '@sentry/electron/main';
import { app, type BrowserWindow, ipcMain } from 'electron';
import { z } from 'zod';
import {
  type AuthMode,
  ChatSession,
  type ModelId,
  type ThinkingBudget,
} from '../chat/chat-session';
import { createClaudeSdkAdapter } from '../chat/claude-sdk-adapter';
import { createIpcSink } from '../chat/ipc-sink';
import { createOpTools, type OpToolDescriptor } from '../ops';
import {
  type BridgeTransport,
  type ForwardOpFn,
  makeIpcForwardOp,
  TurnContext,
} from './claude-bridge';
import { invokeOpHandler } from './op-tool-bridge';

const execFileAsync = promisify(execFile);

/**
 * Cached absolute path to the `claude` CLI binary, populated by
 * `detectClaudeCli()` the first time the renderer probes. The Agent SDK
 * needs the absolute path via `pathToClaudeCodeExecutable` because
 * packaged Electron apps (and sometimes dev) don't inherit a PATH that
 * sees things like `~/.local/bin/claude`.
 */
let detectedClaudePath: string | null = null;

async function detectClaudeCli(): Promise<{ installed: boolean; path: string | null }> {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const { stdout } = await execFileAsync(cmd, ['claude']);
    const path = stdout.trim().split('\n')[0] ?? null;
    if (path) detectedClaudePath = path;
    return { installed: path !== null && path.length > 0, path };
  } catch {
    return { installed: false, path: null };
  }
}

export interface ClaudeIpc {
  forwardOp: ForwardOpFn;
  turnContext: TurnContext;
  /** The assembled SDK MCP server with all op tools bound. */
  mcpServer: ReturnType<typeof createSdkMcpServer>;
  /** The chat session orchestrating all SDK turns for this window. */
  chatSession: ChatSession;
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
  // Pre-approved tool names fed to `allowedTools` on every query.
  const mcpOpToolNames = descriptors.map((d) => `mcp__contexture-ops__${d.name}`);

  const skillsPluginPath = resolveSkillsPluginPath();

  const sdk = createClaudeSdkAdapter({
    query,
    mcpServer,
    mcpOpToolNames,
    skillsPluginPath,
    getClaudeCliPath: () => detectedClaudePath ?? 'claude',
  });

  const sink = createIpcSink({
    send: (channel, payload) => {
      mainWindow.webContents.send(channel, payload);
    },
  });

  const chatSession = new ChatSession({
    sdk,
    sink,
    getCurrentIR: () => turnContext.current(),
    stdlibRegistry: SYSTEM_PROMPT_STDLIB,
    captureException: (err, extra) => {
      Sentry.captureException(err, { extra });
    },
  });

  ipcMain.handle('chat:send', async (_evt, userMessage: string) => {
    const result = await chatSession.turn(userMessage);
    if (result.status === 'ok') return { ok: true };
    if (result.status === 'cancelled') return { ok: false, error: 'cancelled' };
    const failure = result.failure;
    const message = failure && failure.class !== 'cancel' ? failure.message : 'unknown error';
    return { ok: false, error: message };
  });

  // Probe PATH once at startup so the SDK has an absolute binary path
  // ready for the first chat turn, even if the renderer never opens
  // the auth popover.
  detectClaudeCli().catch(() => undefined);

  ipcMain.handle('claude:detect-cli', async () => {
    if (detectedClaudePath) return { installed: true, path: detectedClaudePath };
    return detectClaudeCli();
  });

  ipcMain.handle('claude:set-auth', (_evt, payload: AuthMode) => {
    if (payload?.mode === 'max') {
      chatSession.setAuth({ mode: 'max' });
      return { ok: true };
    }
    if (payload?.mode === 'api-key' && typeof payload.key === 'string') {
      chatSession.setAuth({ mode: 'api-key', key: payload.key });
      return { ok: true };
    }
    return { ok: false, error: 'invalid auth payload' };
  });

  ipcMain.handle(
    'claude:set-model-options',
    (_evt, payload: { model?: ModelId; thinkingBudget?: ThinkingBudget }) => {
      // Default unspecified fields to the session's current value so a
      // partial payload doesn't reset the other half.
      const current = chatSession.state;
      chatSession.setModel(
        payload?.model ?? current.model,
        payload?.thinkingBudget ?? current.thinkingBudget,
      );
      return { ok: true };
    },
  );

  ipcMain.handle('chat:set-session-id', (_evt, sessionId: unknown) => {
    if (typeof sessionId === 'string' && sessionId.length > 0) {
      chatSession.resumeFrom(sessionId);
      return { ok: true };
    }
    return { ok: false };
  });

  ipcMain.handle('chat:clear-session', () => {
    chatSession.reset();
    return { ok: true };
  });

  ipcMain.handle('chat:abort', () => {
    chatSession.cancel();
    return { ok: true };
  });

  return { forwardOp, turnContext, mcpServer, chatSession };
}

/**
 * Locate the bundled skills plugin directory.
 *
 * In production the directory ships under `process.resourcesPath/skills`
 * via `electron-builder`'s `extraResources` entry. In dev we fall back
 * to the in-tree copy so `electron-vite dev` works without a packaged
 * build.
 */
function resolveSkillsPluginPath(): string | null {
  const candidates = [
    join(process.resourcesPath ?? '', 'skills'),
    join(app.getAppPath(), 'resources', 'skills'),
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(join(candidate, '.claude-plugin', 'plugin.json'))) {
      return candidate;
    }
  }
  return null;
}

function toSdkTool(descriptor: OpToolDescriptor) {
  return tool(descriptor.name, descriptor.description, descriptor.inputSchema, (args) =>
    invokeOpHandler(descriptor.handler, args as Record<string, unknown>),
  );
}

// Keep Zod in the surface area so downstream importers can build
// matching schemas without separately importing it.
export { z };
