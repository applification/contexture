import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProviderStatus } from '../runtime';
import { CODEX_PROVIDER_MIN_CLI_VERSION } from './version';

export interface CodexCliInfo {
  installed: boolean;
  path: string | null;
  version: string | null;
  supported: boolean;
}

export type ExecFileFn = (
  file: string,
  args: string[],
) => Promise<{ stdout: string; stderr?: string }>;

const execFileAsync = promisify(execFile);

export async function detectCodexCli(exec: ExecFileFn = nodeExecFile): Promise<CodexCliInfo> {
  const path = await findCodexPath(exec);
  if (!path) {
    return { installed: false, path: null, version: null, supported: false };
  }

  try {
    const { stdout } = await exec(path, ['--version']);
    const version = parseCodexVersion(stdout);
    return {
      installed: true,
      path,
      version,
      supported: version !== null && compareSemver(version, CODEX_PROVIDER_MIN_CLI_VERSION) >= 0,
    };
  } catch {
    return { installed: true, path, version: null, supported: false };
  }
}

export function codexCliInfoToStatus(info: CodexCliInfo): ProviderStatus {
  if (!info.installed) {
    return {
      provider: 'codex',
      readiness: 'cli_missing',
      minimumCliVersion: CODEX_PROVIDER_MIN_CLI_VERSION,
    };
  }
  if (!info.supported) {
    return {
      provider: 'codex',
      readiness: 'cli_outdated',
      cliVersion: info.version ?? undefined,
      minimumCliVersion: CODEX_PROVIDER_MIN_CLI_VERSION,
    };
  }
  return {
    provider: 'codex',
    readiness: 'app_server_unavailable',
    detail: 'Codex CLI is available; app-server connection is not initialized yet.',
    cliVersion: info.version ?? undefined,
    minimumCliVersion: CODEX_PROVIDER_MIN_CLI_VERSION,
  };
}

export function parseCodexVersion(output: string): string | null {
  const match = output.match(/codex-cli\s+(\d+\.\d+\.\d+)/);
  return match?.[1] ?? null;
}

export function compareSemver(a: string, b: string): number {
  const left = a.split('.').map((part) => Number.parseInt(part, 10));
  const right = b.split('.').map((part) => Number.parseInt(part, 10));
  for (let i = 0; i < 3; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function findCodexPath(exec: ExecFileFn): Promise<string | null> {
  try {
    const command = process.platform === 'win32' ? 'where' : 'which';
    const { stdout } = await exec(command, ['codex']);
    return stdout.trim().split('\n')[0] || null;
  } catch {
    return null;
  }
}

async function nodeExecFile(
  file: string,
  args: string[],
): Promise<{ stdout: string; stderr?: string }> {
  const { stdout, stderr } = await execFileAsync(file, args);
  return { stdout, stderr };
}
