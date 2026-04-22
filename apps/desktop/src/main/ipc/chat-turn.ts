/**
 * Chat turn boundary protocol.
 *
 * A chat turn wraps N tool-driven ops into a single undo entry. The renderer
 * opens a transaction when it sees `turn:begin`, accumulates applied ops,
 * and closes it on `turn:commit` (one undo entry) or discards it on
 * `turn:rollback` (if the turn aborts mid-stream). The per-op animation
 * still happens live as each op arrives — the transaction only controls
 * how undo batches them.
 *
 * `ChatTurnController` is the main-side orchestrator. It is transport-
 * agnostic (`TurnTransport` abstracts `webContents.send`) so tests can
 * assert on the exact channel sequence without Electron, and production
 * wires it to the real main window.
 *
 * Re-entrancy: turns are serialized — a second `run()` queues behind the
 * first. Nesting a turn inside another would defeat the one-entry-per-turn
 * guarantee, so we explicitly forbid overlap rather than lean on the
 * renderer's depth-counted `begin()` in the undo store.
 */

export interface TurnTransport {
  /** Emit a control message on a named channel. Payload is optional. */
  send: (channel: string, payload?: unknown) => void;
}

export const TURN_BEGIN = 'turn:begin';
export const TURN_COMMIT = 'turn:commit';
export const TURN_ROLLBACK = 'turn:rollback';

export class ChatTurnController {
  readonly #transport: TurnTransport;
  /** Tail of the serialized turn queue; `run()` chains onto this. */
  #tail: Promise<void> = Promise.resolve();

  constructor(transport: TurnTransport) {
    this.#transport = transport;
  }

  /**
   * Run `body` inside a `turn:begin` / `turn:commit` envelope. If `body`
   * rejects, emit `turn:rollback` instead and re-throw. Concurrent calls
   * serialize — the N-th turn's `begin` only fires after the (N-1)-th
   * turn's `commit`/`rollback` has been sent.
   */
  run<T>(body: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(() => this.#runOnce(body));
    // Swallow rejections on the chain so a failed turn doesn't poison
    // the next one; the caller still sees the original rejection via
    // `result`.
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #runOnce<T>(body: () => Promise<T>): Promise<T> {
    this.#transport.send(TURN_BEGIN);
    try {
      const value = await body();
      this.#transport.send(TURN_COMMIT);
      return value;
    } catch (err) {
      this.#transport.send(TURN_ROLLBACK);
      throw err;
    }
  }
}
