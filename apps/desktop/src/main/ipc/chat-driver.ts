/**
 * Chat driver — orchestrates one chat turn end-to-end on the main side.
 *
 * Per user message it:
 *   1. Asks the renderer for the current IR (`turnContext` already holds
 *      it from the most recent `claude:turn-start-ir` push).
 *   2. Builds the system prompt via `buildSystemPrompt` (#95).
 *   3. Opens a `ChatTurnController` envelope so every op the SDK emits
 *      collapses into a single renderer-side undo entry.
 *   4. Streams SDK assistant text + tool-use to the renderer via
 *      `emitEvent`, which is a transport injected by the caller (in
 *      production: `mainWindow.webContents.send`).
 *
 * The `query` function is injected so unit tests can feed a canned
 * async iterator without booting the Agent SDK or the MCP server.
 */

import { buildSystemPrompt, type StdlibRegistry } from '@renderer/chat/system-prompt';
import type { Schema } from '@renderer/model/types';
import type { ChatTurnController } from './chat-turn';

/** Minimal SDK message surface the driver needs. */
export type DriverSdkMessage =
  | { type: 'assistant'; text: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: 'result'; ok: boolean; error?: string };

export type DriverQueryFn = (input: {
  prompt: string;
  systemPrompt: string;
}) => AsyncIterable<DriverSdkMessage>;

export interface DriverTransport {
  /** Emit a chat event to the renderer. Production wires to `webContents.send`. */
  send: (channel: string, payload: unknown) => void;
}

export interface ChatDriverDeps {
  query: DriverQueryFn;
  transport: DriverTransport;
  turnController: ChatTurnController;
  getCurrentIR: () => Schema | null;
  stdlibRegistry: StdlibRegistry;
}

export const CHAT_ASSISTANT = 'chat:assistant' as const;
export const CHAT_TOOL_USE = 'chat:tool-use' as const;
export const CHAT_RESULT = 'chat:result' as const;
export const CHAT_ERROR = 'chat:error' as const;

export class ChatDriver {
  readonly #deps: ChatDriverDeps;

  constructor(deps: ChatDriverDeps) {
    this.#deps = deps;
  }

  /**
   * Run one user turn. Returns when the SDK stream finishes (or throws
   * if the body throws — `ChatTurnController.run` will still have sent
   * `turn:rollback` in that case).
   */
  async send(userMessage: string): Promise<void> {
    const { query, transport, turnController, getCurrentIR, stdlibRegistry } = this.#deps;

    const ir = getCurrentIR();
    const systemPrompt = ir
      ? buildSystemPrompt({ ir, stdlibRegistry })
      : buildSystemPrompt({
          ir: { version: '1', types: [] },
          stdlibRegistry,
        });

    await turnController.run(async () => {
      try {
        for await (const msg of query({ prompt: userMessage, systemPrompt })) {
          if (msg.type === 'assistant') {
            transport.send(CHAT_ASSISTANT, { text: msg.text });
          } else if (msg.type === 'tool_use') {
            transport.send(CHAT_TOOL_USE, { name: msg.name, input: msg.input });
          } else if (msg.type === 'result') {
            transport.send(CHAT_RESULT, { ok: msg.ok, error: msg.error });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        transport.send(CHAT_ERROR, { message });
        throw err;
      }
    });
  }
}
