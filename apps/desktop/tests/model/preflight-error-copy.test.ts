/**
 * `preflightErrorCopy` — one line of UI copy per tagged preflight
 * error. Every branch is covered so a future error shape gets a
 * compile-time hole and a test hole at the same time.
 */
import { preflightErrorCopy } from '@renderer/model/preflight-error-copy';
import { describe, expect, it } from 'vitest';

describe('preflightErrorCopy', () => {
  it('mentions Bun for missing-bun', () => {
    expect(preflightErrorCopy({ kind: 'missing-bun' })).toMatch(/Bun/i);
  });
  it('mentions Git for missing-git', () => {
    expect(preflightErrorCopy({ kind: 'missing-git' })).toMatch(/Git/i);
  });
  it('mentions Node for missing-node', () => {
    expect(preflightErrorCopy({ kind: 'missing-node' })).toMatch(/Node/i);
  });
  it('mentions network / registry for no-network', () => {
    expect(preflightErrorCopy({ kind: 'no-network' })).toMatch(/network|registry/i);
  });
  it('includes the offending path for parent-not-writable', () => {
    expect(preflightErrorCopy({ kind: 'parent-not-writable', path: '/ro' })).toContain('/ro');
  });
  it('includes the target path for target-exists', () => {
    expect(preflightErrorCopy({ kind: 'target-exists', path: '/tmp/x' })).toContain('/tmp/x');
  });
  it('renders a rounded MB figure for insufficient-space', () => {
    const msg = preflightErrorCopy({ kind: 'insufficient-space', bytesFree: 104857600 });
    expect(msg).toMatch(/100 MB/);
  });
  it('returns a readable message for scratch-unreadable', () => {
    expect(preflightErrorCopy({ kind: 'scratch-unreadable' })).toMatch(/scratch|read/i);
  });
  it('returns a readable message for scratch-invalid-ir', () => {
    expect(preflightErrorCopy({ kind: 'scratch-invalid-ir' })).toMatch(/valid|Contexture/i);
  });
});
