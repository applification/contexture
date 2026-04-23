/**
 * Main↔renderer bridge for Claude chat-driven ops.
 *
 * Two concerns live here:
 *
 *   - `makeIpcForwardOp(transport)` creates a `ForwardOp` callback that
 *     ships an `Op` to the renderer over IPC and awaits its `ApplyResult`.
 *     The transport is abstracted over (`send` + `onReply`) so tests can
 *     stub it; production wires it to `mainWindow.webContents.send` plus
 *     an `ipcMain.on` handler for replies.
 *   - `TurnContext` holds the renderer-pushed IR for the current turn
 *     so the system prompt builder always has the latest schema without
 *     a round-trip per request.
 *
 * The higher-level `registerClaudeIpc` — which wires this bridge onto an
 * actual `BrowserWindow` + `ipcMain` + the Agent SDK's MCP server — sits
 * on top of these primitives and is intentionally kept thin.
 */

import type { Schema } from '@renderer/model/ir';
import type { ApplyResult, Op } from '@renderer/store/ops';

export interface BridgeTransport {
  /** Emit an op-request to the renderer. `id` is the correlation id. */
  send: (id: string, payload: Op) => void;
  /**
   * The production wiring installs a reply handler here that resolves
   * the pending promise for a correlation id. Tests set this manually
   * via their fake transport.
   */
  onReply?: (id: string, result: unknown) => void;
}

export interface ForwardOpOptions {
  /** Default 30s. Tests override with something tiny. */
  timeoutMs?: number;
}

export type ForwardOpFn = (op: Op) => Promise<ApplyResult>;

export function makeIpcForwardOp(
  transport: BridgeTransport,
  options: ForwardOpOptions = {},
): ForwardOpFn {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const pending = new Map<
    string,
    { resolve: (v: ApplyResult) => void; reject: (e: Error) => void }
  >();

  transport.onReply = (id, result) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    entry.resolve(result as ApplyResult);
  };

  return (op) =>
    new Promise<ApplyResult>((resolve, reject) => {
      const id = cryptoRandomId();
      pending.set(id, { resolve, reject });
      transport.send(id, op);
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`forwardOp timed out after ${timeoutMs}ms (op: ${op.kind})`));
        }
      }, timeoutMs);
    });
}

/**
 * Holds the IR snapshot the renderer pushes at turn-start so the
 * system-prompt builder can read it cheaply. Simple, single-slot
 * state — turns are serial so there's no contention to manage.
 */
export class TurnContext {
  #ir: Schema | null = null;

  pushIR(ir: Schema): void {
    this.#ir = ir;
  }

  current(): Schema | null {
    return this.#ir;
  }
}

function cryptoRandomId(): string {
  // `crypto.randomUUID` is available on both Node ≥19 and modern browsers.
  // We guard in case tests run on an unusual runtime.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}
