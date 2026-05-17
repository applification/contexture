import { IpcString, parseIpcPayload } from '@main/ipc/validation';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

describe('IPC payload validation', () => {
  it('returns typed payloads for valid channel schemas', () => {
    const schema = z.object({ path: IpcString }).strict();

    expect(parseIpcPayload('demo:channel', schema, { path: '/tmp/contexture' })).toEqual({
      path: '/tmp/contexture',
    });
  });

  it('raises channel-specific errors for malformed payloads', () => {
    const schema = z.object({ path: IpcString }).strict();

    expect(() => parseIpcPayload('demo:channel', schema, { path: '' })).toThrow(
      /Invalid demo:channel payload: path:/,
    );
  });
});
