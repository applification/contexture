import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProviderStatus } from '../runtime';

export interface ClaudeCliInfo {
  installed: boolean;
  path: string | null;
}

export type ExecFileFn = (
  file: string,
  args: string[],
) => Promise<{ stdout: string; stderr?: string }>;

const execFileAsync = promisify(execFile);

export async function detectClaudeCli(exec: ExecFileFn = nodeExecFile): Promise<ClaudeCliInfo> {
  try {
    const command = process.platform === 'win32' ? 'where' : 'which';
    const { stdout } = await exec(command, ['claude']);
    const path = stdout.trim().split('\n')[0] || null;
    return { installed: path !== null, path };
  } catch {
    return { installed: false, path: null };
  }
}

export function claudeCliInfoToStatus(info: ClaudeCliInfo): ProviderStatus {
  if (!info.installed) {
    return {
      provider: 'claude',
      readiness: 'cli_missing',
      detail: 'Claude CLI is not detected.',
    };
  }
  return {
    provider: 'claude',
    readiness: 'authenticated_cli',
    detail: 'Claude CLI session available.',
  };
}

async function nodeExecFile(
  file: string,
  args: string[],
): Promise<{ stdout: string; stderr?: string }> {
  const { stdout, stderr } = await execFileAsync(file, args);
  return { stdout, stderr };
}
