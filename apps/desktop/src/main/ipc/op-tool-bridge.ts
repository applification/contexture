/**
 * Tool-result adapter for op handlers.
 *
 * The Agent SDK's `tool()` factory expects a handler that returns a
 * `CallToolResult`. Our op handlers return `ApplyResult` (success with
 * the next schema, or `{ error }` for applier rejections) and can also
 * throw (type-level ops validate payloads before applying and raise
 * explicit `Error`s on malformed input).
 *
 * Both failure shapes need to surface to Claude as errored tool
 * results (`isError: true`) so the model can self-correct on the same
 * turn. Left untreated, a thrown error kills the whole turn; a
 * `{ error }` return silently shows up as JSON text that the model may
 * or may not notice.
 *
 * This module is pure (no electron / SDK imports) so it can be unit
 * tested without booting anything.
 */

import type { OpToolDescriptor } from '../ops';

/**
 * Shape of an SDK tool result — narrow subset of `CallToolResult` that
 * the op handlers actually use. The index signature keeps it
 * assignable to the SDK's wider `CallToolResult` type.
 */
export interface ToolResult {
  [x: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Convert an op handler's `ApplyResult` (or thrown error) into the
 * SDK's tool-result shape, marking failures with `isError: true` so
 * Claude sees them in-band and can self-correct on the same turn.
 *
 * Failures come in two shapes:
 *   1. The handler throws (e.g. type-level ops reject malformed
 *      payloads via `throw new Error(...)`) — caught and surfaced as
 *      an errored tool result.
 *   2. The handler returns `{ error: string }` from the ops applier
 *      — same treatment; `isError: true` tells the SDK's tool-result
 *      machinery to replay the failure to the model on the same turn.
 */
export async function invokeOpHandler(
  handler: OpToolDescriptor['handler'],
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const result = await handler(args);
    if ('error' in result) {
      return {
        content: [{ type: 'text', text: result.error }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: message }],
      isError: true,
    };
  }
}
