/**
 * Scaffolder pre-flight (stage 0) — synchronous, sub-100ms checks run
 * before any shell commands fire. Each failure must return a specific,
 * user-actionable error so the UI can render the right "install X" /
 * "pick another folder" message. Drives through injected runners so
 * the tests don't actually shell out or hit the network.
 */
import { type PreflightDeps, type PreflightError, runPreflight } from '@main/scaffold/preflight';
import { describe, expect, it } from 'vitest';

function okDeps(overrides: Partial<PreflightDeps> = {}): PreflightDeps {
  return {
    runCommand: async () => ({ stdout: 'ok', code: 0 }),
    headOk: async () => true,
    parentDirWritable: async () => true,
    targetDirExists: async () => false,
    freeBytes: async () => 600 * 1024 * 1024,
    ...overrides,
  };
}

async function expectError(
  deps: Partial<PreflightDeps>,
  expected: PreflightError['kind'],
): Promise<PreflightError> {
  const result = await runPreflight({ targetDir: '/tmp/new-proj' }, okDeps(deps));
  if (result.ok) throw new Error(`expected preflight to fail with ${expected}`);
  expect(result.error.kind).toBe(expected);
  return result.error;
}

describe('runPreflight', () => {
  it('returns ok when every check passes', async () => {
    const result = await runPreflight({ targetDir: '/tmp/new-proj' }, okDeps());
    expect(result.ok).toBe(true);
  });

  it('flags missing bun with a bun-specific error', async () => {
    await expectError(
      {
        runCommand: async (cmd) =>
          cmd === 'bun --version' ? { stdout: '', code: 127 } : { stdout: 'ok', code: 0 },
      },
      'missing-bun',
    );
  });

  it('flags missing git', async () => {
    await expectError(
      {
        runCommand: async (cmd) =>
          cmd === 'git --version' ? { stdout: '', code: 127 } : { stdout: 'ok', code: 0 },
      },
      'missing-git',
    );
  });

  it('flags missing node', async () => {
    await expectError(
      {
        runCommand: async (cmd) =>
          cmd === 'node --version' ? { stdout: '', code: 127 } : { stdout: 'ok', code: 0 },
      },
      'missing-node',
    );
  });

  it('flags no network when registry HEAD fails', async () => {
    await expectError({ headOk: async () => false }, 'no-network');
  });

  it('flags parent-not-writable with the path', async () => {
    const err = await expectError({ parentDirWritable: async () => false }, 'parent-not-writable');
    if (err.kind === 'parent-not-writable') expect(err.path).toBe('/tmp');
  });

  it('flags target-exists with the target path', async () => {
    const err = await expectError({ targetDirExists: async () => true }, 'target-exists');
    if (err.kind === 'target-exists') expect(err.path).toBe('/tmp/new-proj');
  });

  it('flags insufficient-space when < 500MB free', async () => {
    const err = await expectError(
      { freeBytes: async () => 100 * 1024 * 1024 },
      'insufficient-space',
    );
    if (err.kind === 'insufficient-space') expect(err.bytesFree).toBe(100 * 1024 * 1024);
  });
});
