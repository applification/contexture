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
    if (isToolError(result)) {
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

function isToolError(value: unknown): value is { error: string } {
  return (
    !!value &&
    typeof value === 'object' &&
    'error' in value &&
    typeof (value as { error?: unknown }).error === 'string'
  );
}

/**
 * Claude's Agent SDK/MCP bridge can hand tool args to local tools in a
 * slightly flatter shape than our op descriptors advertise. Type-level
 * Contexture tools intentionally expose `{ payload: unknown }`; when the
 * SDK gives us `{ name: "SaleLineItem" }` for `delete_type`, normalize it
 * back to `{ payload: { name: "SaleLineItem" } }` before the op handler
 * validates it. Keep strict field-level tools untouched.
 */
export function normalizeOpToolArgs(
  descriptor: OpToolDescriptor,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if ('payload' in args) {
    const payload = args.payload;
    if (isPayloadOnlyTool(descriptor) && isRecord(payload) && 'payload' in payload) {
      return { payload: payload.payload };
    }
    if (descriptor.name === 'replace_schema' && isRecord(payload) && 'schema' in payload) {
      return { schema: payload.schema };
    }
    if (descriptor.name === 'replace_schema' && isSchemaLike(payload)) {
      return { schema: payload };
    }
    return args;
  }

  if (isPayloadOnlyTool(descriptor) && Object.keys(args).length > 0) {
    return { payload: args };
  }
  if (descriptor.name === 'replace_schema' && isSchemaLike(args)) {
    return { schema: args };
  }
  return args;
}

function isPayloadOnlyTool(descriptor: OpToolDescriptor): boolean {
  const keys = Object.keys(descriptor.inputSchema);
  return keys.length === 1 && keys[0] === 'payload';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isSchemaLike(value: unknown): boolean {
  return isRecord(value) && value.version === '1' && Array.isArray(value.types);
}
