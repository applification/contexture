import {
  codexCliInfoToStatus,
  compareSemver,
  detectCodexCli,
  type ExecFileFn,
  parseCodexVersion,
} from '@main/providers/codex/cli';
import { CODEX_PROVIDER_MIN_CLI_VERSION } from '@main/providers/codex/version';
import { describe, expect, it, vi } from 'vitest';

describe('Codex CLI detection', () => {
  it('parses codex-cli version output', () => {
    expect(parseCodexVersion('codex-cli 0.130.0')).toBe('0.130.0');
    expect(parseCodexVersion('unexpected')).toBeNull();
  });

  it('compares semantic versions', () => {
    expect(compareSemver('0.130.0', CODEX_PROVIDER_MIN_CLI_VERSION)).toBe(0);
    expect(compareSemver('0.131.0', CODEX_PROVIDER_MIN_CLI_VERSION)).toBeGreaterThan(0);
    expect(compareSemver('0.129.9', CODEX_PROVIDER_MIN_CLI_VERSION)).toBeLessThan(0);
  });

  it('reports missing CLI status', async () => {
    const exec = vi.fn<ExecFileFn>(async () => {
      throw new Error('not found');
    });

    const info = await detectCodexCli(exec);

    expect(info).toEqual({ installed: false, path: null, version: null, supported: false });
    expect(codexCliInfoToStatus(info)).toMatchObject({
      provider: 'codex',
      readiness: 'cli_missing',
      minimumCliVersion: CODEX_PROVIDER_MIN_CLI_VERSION,
    });
  });

  it('reports outdated CLI status', async () => {
    const exec = vi.fn<ExecFileFn>(async (file) => {
      if (file === 'which') return { stdout: '/usr/local/bin/codex\n' };
      return { stdout: 'codex-cli 0.129.0\n' };
    });

    const info = await detectCodexCli(exec);

    expect(info).toEqual({
      installed: true,
      path: '/usr/local/bin/codex',
      version: '0.129.0',
      supported: false,
    });
    expect(codexCliInfoToStatus(info)).toMatchObject({
      provider: 'codex',
      readiness: 'cli_outdated',
      cliVersion: '0.129.0',
      minimumCliVersion: CODEX_PROVIDER_MIN_CLI_VERSION,
    });
  });

  it('reports supported CLI before app-server is initialized', async () => {
    const exec = vi.fn<ExecFileFn>(async (file) => {
      if (file === 'which') return { stdout: '/opt/bin/codex\n' };
      return { stdout: 'codex-cli 0.130.0\n' };
    });

    const info = await detectCodexCli(exec);

    expect(info).toEqual({
      installed: true,
      path: '/opt/bin/codex',
      version: '0.130.0',
      supported: true,
    });
    expect(codexCliInfoToStatus(info)).toMatchObject({
      provider: 'codex',
      readiness: 'app_server_unavailable',
      cliVersion: '0.130.0',
      minimumCliVersion: CODEX_PROVIDER_MIN_CLI_VERSION,
    });
  });
});
