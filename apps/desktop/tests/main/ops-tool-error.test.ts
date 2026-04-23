/**
 * `invokeOpHandler` — tool-result shape for ops success / failure.
 *
 * Proves:
 *   - successful handler → `{ content: [...], isError?: undefined }`.
 *   - handler returns `{ error }` → `isError: true` + error text.
 *   - handler throws → `isError: true` + the thrown message.
 *
 * This is the bridge layer Claude sees in-band per turn; false positives
 * here would make validation errors invisible to the model.
 */
import { invokeOpHandler } from '@main/ipc/op-tool-bridge';
import type { OpToolDescriptor } from '@main/ops';
import { describe, expect, it } from 'vitest';

describe('invokeOpHandler', () => {
  it('forwards a successful ApplyResult as JSON text', async () => {
    const handler: OpToolDescriptor['handler'] = async () => ({
      schema: { version: '1', types: [] },
    });
    const result = await invokeOpHandler(handler, {});
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.schema.version).toBe('1');
  });

  it('maps `{ error }` from the applier to isError=true', async () => {
    const handler: OpToolDescriptor['handler'] = async () => ({
      error: 'type already exists: Plot',
    });
    const result = await invokeOpHandler(handler, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('type already exists: Plot');
  });

  it('maps a thrown Error to isError=true with the thrown message', async () => {
    const handler: OpToolDescriptor['handler'] = async () => {
      throw new Error('rename_type: payload.from must be a string');
    };
    const result = await invokeOpHandler(handler, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('rename_type');
  });

  it('handles non-Error throwables', async () => {
    const handler: OpToolDescriptor['handler'] = async () => {
      throw 'boom';
    };
    const result = await invokeOpHandler(handler, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('boom');
  });
});
