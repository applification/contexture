/**
 * Electron wiring for the Agent SDK chat session.
 *
 * This module is intentionally thin: it assembles the pieces defined
 * elsewhere (`ops/`, `claude-bridge.ts`) against the real `ipcMain` +
 * `mainWindow.webContents` + the Agent SDK's MCP server, and exposes
 * `registerClaudeIpc` to the main entrypoint. All interesting logic
 * lives in the pure modules, which have their own tests.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import type { Schema } from '@renderer/model/types';
import { SYSTEM_PROMPT_STDLIB } from '@renderer/services/stdlib-registry';
import * as Sentry from '@sentry/electron/main';
import { app, type BrowserWindow, ipcMain } from 'electron';
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
import { ChatCancelledError } from './claude-errors';
import { invokeOpHandler } from './op-tool-bridge';

const execFileAsync = promisify(execFile);

/**
 * Look for a `claude` binary on PATH. Used by the auth popover to
 * tell the user whether Max mode is viable; the Agent SDK shells out
 * to the CLI when no `ANTHROPIC_API_KEY` is set, so the same detection
 * predicts whether a turn will succeed.
 */
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

/**
 * Current chat auth — set by the renderer via `chat:set-auth` and read
 * at the start of each `query()` call. `max` mode leaves env alone and
 * the SDK will shell out to the Claude CLI (via `pathToClaudeCodeExecutable`);
 * `api-key` mode injects `ANTHROPIC_API_KEY` into the SDK's env for that
 * turn.
 */
type ChatAuth = { mode: 'max' } | { mode: 'api-key'; key: string };
let currentAuth: ChatAuth = { mode: 'max' };

type ModelId = 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6' | 'claude-opus-4-6';
type ThinkingBudget = 'auto' | 'low' | 'med' | 'high';
const THINKING_TOKENS: Record<ThinkingBudget, number | undefined> = {
  auto: undefined,
  low: 2048,
  med: 8192,
  high: 16000,
};
let currentModel: ModelId = 'claude-sonnet-4-6';
let currentThinkingBudget: ThinkingBudget = 'auto';

/**
 * Handle on the in-flight `query()` iterator so `chat:abort` can
 * interrupt it. `null` while nothing is running.
 */
let currentQuery: { interrupt(): Promise<void> } | null = null;

/**
 * Flag set by `chat:abort` to signal cancellation to the in-flight
 * sdkQuery generator. Cleared at the start of every turn. The Agent
 * SDK's `interrupt()` stops the iterator cleanly (not via throw), so
 * we need our own signal to raise `ChatCancelledError` after the loop
 * exits — that's what drives `turn:rollback`.
 */
let cancelRequested = false;

/**
 * Last-seen Agent SDK session id for the active chat. Populated by
 * `sdkQuery` from every SDK message that carries one; passed as
 * `resume` on subsequent turns so the SDK threads prior history.
 * Cleared on explicit "new conversation" requests and pre-populated
 * from the sidecar via `chat:set-session-id` on file open.
 */
let currentSessionId: string | undefined;

/**
 * Built-in Claude Code tools we never want the schema-editor agent to
 * reach for. Listed explicitly (vs. `tools: []`) because the latter
 * would also strip the default system prompt infrastructure that
 * auto-loads plugin skills. Mirrors the pre-pivot main-branch list.
 */
const DISALLOWED_BUILTINS = [
  'Read',
  'Edit',
  'Write',
  'Bash',
  'Glob',
  'Grep',
  'Agent',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
];

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
  // Pre-approved tool names fed to `allowedTools` on every query.
  // Format matches how the SDK surfaces MCP tools to the model:
  // `mcp__<server-name>__<tool-name>`.
  const MCP_OP_TOOL_NAMES = descriptors.map((d) => `mcp__contexture-ops__${d.name}`);

  const turnTransport: TurnTransport = {
    send: (channel, payload) => {
      mainWindow.webContents.send(channel, payload);
    },
  };
  const turnController = new ChatTurnController(turnTransport);

  const skillsPluginPath = resolveSkillsPluginPath();

  const sdkQuery: DriverQueryFn = async function* ({ prompt, systemPromptAppend, resume }) {
    // Clear any stale cancel flag at the start of each SDK query.
    // `chat:abort` will flip it back mid-stream when the user hits Stop.
    cancelRequested = false;
    // Project the current auth into the SDK options. Max mode points
    // the SDK at the cached absolute binary path (the SDK spawns that
    // binary to authenticate against the user's OAuth session);
    // api-key mode overrides the env var for the spawned SDK process.
    const env: Record<string, string> | undefined =
      currentAuth.mode === 'api-key' && currentAuth.key
        ? { ANTHROPIC_API_KEY: currentAuth.key }
        : undefined;
    const iterator = query({
      prompt,
      options: {
        // Preset + append: keeps Claude Code's default system prompt
        // (which auto-loads plugin skills on topic match) and layers
        // our op vocabulary / stdlib / tool-use imperatives on top.
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: systemPromptAppend,
        },
        // Pre-approve our MCP ops by namespaced name so the default
        // permission system doesn't prompt the user on every tool call.
        // This is the pattern that worked on the pre-pivot main branch.
        allowedTools: MCP_OP_TOOL_NAMES,
        // Block the built-in filesystem / shell tools — only our MCP
        // ops should be callable. Plugin skills are a plugin-level
        // feature, unaffected by this list.
        disallowedTools: DISALLOWED_BUILTINS,
        model: currentModel,
        ...(THINKING_TOKENS[currentThinkingBudget] !== undefined
          ? { maxThinkingTokens: THINKING_TOKENS[currentThinkingBudget] }
          : {}),
        mcpServers: { 'contexture-ops': mcpServer },
        pathToClaudeCodeExecutable: detectedClaudePath ?? 'claude',
        ...(skillsPluginPath ? { plugins: [{ type: 'local', path: skillsPluginPath }] } : {}),
        ...(resume ? { resume } : {}),
        ...(env ? { env } : {}),
      },
    });
    currentQuery = iterator;
    try {
      for await (const msg of iterator) {
        const sessionMsg = extractSessionMessage(msg);
        if (sessionMsg) {
          currentSessionId = sessionMsg.sessionId;
          yield sessionMsg;
        }
        const mapped = mapSdkMessage(msg);
        if (mapped) yield mapped;
      }
      // `interrupt()` unwinds the iterator cleanly (no throw); raise
      // ChatCancelledError so `turnController.run` fires `turn:rollback`
      // and any ops applied during this turn are reverted as one undo
      // step (issue #74 user story 16).
      if (cancelRequested) {
        throw new ChatCancelledError();
      }
    } finally {
      if (currentQuery === iterator) currentQuery = null;
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
    getResumeSessionId: () => currentSessionId,
    retryOptions: {
      captureException: (err, extra) => {
        Sentry.captureException(err, { extra });
      },
    },
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

  // Probe PATH once at startup so the SDK has an absolute binary path
  // ready for the first chat turn, even if the renderer never opens
  // the auth popover.
  detectClaudeCli().catch(() => undefined);

  ipcMain.handle('claude:detect-cli', async () => {
    // Short-circuit on a previous successful probe — the binary doesn't
    // move between launches, so re-running `which` per renderer mount
    // is wasted work.
    if (detectedClaudePath) return { installed: true, path: detectedClaudePath };
    return detectClaudeCli();
  });

  ipcMain.handle('claude:set-auth', (_evt, payload: ChatAuth) => {
    // Shallow-validate the incoming payload — anything else we just
    // reject rather than silently falling back.
    if (payload?.mode === 'max') {
      currentAuth = { mode: 'max' };
      return { ok: true };
    }
    if (payload?.mode === 'api-key' && typeof payload.key === 'string') {
      currentAuth = { mode: 'api-key', key: payload.key };
      return { ok: true };
    }
    return { ok: false, error: 'invalid auth payload' };
  });

  ipcMain.handle(
    'claude:set-model-options',
    (_evt, payload: { model?: ModelId; thinkingBudget?: ThinkingBudget }) => {
      if (payload?.model) currentModel = payload.model;
      if (payload?.thinkingBudget) currentThinkingBudget = payload.thinkingBudget;
      return { ok: true };
    },
  );

  ipcMain.handle('chat:set-session-id', (_evt, sessionId: unknown) => {
    // Renderer calls this on sidecar hydrate to restore the prior chat's
    // SDK session. Only accept strings; anything else is silently
    // ignored (the sidecar could have been hand-edited).
    if (typeof sessionId === 'string' && sessionId.length > 0) {
      currentSessionId = sessionId;
      return { ok: true };
    }
    return { ok: false };
  });

  ipcMain.handle('chat:clear-session', () => {
    // Explicit "new conversation" — forgets the resume id so the next
    // turn starts a fresh SDK session. Does not clear the on-disk
    // transcript (that's the renderer's concern).
    currentSessionId = undefined;
    return { ok: true };
  });

  ipcMain.handle('chat:abort', async () => {
    const q = currentQuery;
    if (!q) return { ok: false, error: 'no active query' };
    // Flip the flag first so the sdkQuery generator raises
    // ChatCancelledError after `interrupt()` unwinds the iterator.
    // Without this the iterator stops cleanly and the turn commits
    // whatever ops landed before Stop was pressed.
    cancelRequested = true;
    try {
      await q.interrupt();
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  return { forwardOp, turnContext, mcpServer, turnController, chatDriver };
}

/**
 * Pull the session id out of the SDK's `system/init` message — that's
 * the one we want to hand back as `resume` on subsequent turns. Later
 * messages echo a session id too, but the init value is the canonical
 * "this conversation's id" per the main-branch pattern that proved
 * resume works.
 */
function extractSessionMessage(
  msg: unknown,
): Extract<DriverSdkMessage, { type: 'session' }> | null {
  if (!msg || typeof msg !== 'object') return null;
  const m = msg as { type?: unknown; subtype?: unknown; session_id?: unknown };
  if (m.type !== 'system' || m.subtype !== 'init') return null;
  const sid = m.session_id;
  if (typeof sid === 'string' && sid.length > 0) {
    return { type: 'session', sessionId: sid };
  }
  return null;
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

/**
 * Locate the bundled skills plugin directory.
 *
 * In production the directory ships under `process.resourcesPath/skills`
 * via `electron-builder`'s `extraResources` entry. In dev we fall back
 * to the in-tree copy so `electron-vite dev` works without a packaged
 * build. Returns `null` when neither exists so the SDK query runs
 * without plugins instead of blowing up at session start.
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
