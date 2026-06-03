import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join, parse } from 'node:path';
import { promisify } from 'node:util';
import { CONTEXTURE_SUPPORTED_CONVEX_VERSION, projectDirFor } from '@contexture/core';
import { ipcMain } from 'electron';
import { z } from 'zod';
import { IpcString, parseIpcPayload } from './validation';

const execFileAsync = promisify(execFile);

export type ConvexVersionStatus = 'ok' | 'mismatch' | 'target_missing' | 'probe_failed';
export type ConvexAgentReadinessStatus = 'ready' | 'not_ready' | 'probe_failed';

export interface ConvexVersionInfo {
  emitterVersion: string;
  targetVersion: string | null;
  targetPackagePath: string | null;
  status: ConvexVersionStatus;
  message: string;
}

export interface ConvexAgentReadinessInfo {
  convexAiFiles: {
    status: ConvexAgentReadinessStatus;
    message: string;
    command: string;
  };
  contextureMcp: {
    status: ConvexAgentReadinessStatus;
    message: string;
    command: string;
  };
}

export type ExecFileLike = (
  file: string,
  args: readonly string[],
  options: {
    cwd?: string;
    env: NodeJS.ProcessEnv;
    timeout: number;
    maxBuffer: number;
  },
) => Promise<{ stdout?: string | Buffer; stderr?: string | Buffer }>;

interface ConvexAgentReadinessDeps {
  execFile?: ExecFileLike;
  env?: NodeJS.ProcessEnv;
}

const ConvexVersionInputSchema = z.object({ irPath: IpcString }).strict();

export async function getConvexVersionInfo(input: unknown): Promise<ConvexVersionInfo> {
  const { irPath } = parseIpcPayload('convex:version-info', ConvexVersionInputSchema, input);
  try {
    const packagePath = await findPackageJson(projectDirFor(irPath));
    if (!packagePath) {
      return {
        emitterVersion: CONTEXTURE_SUPPORTED_CONVEX_VERSION,
        targetVersion: null,
        targetPackagePath: null,
        status: 'target_missing',
        message: 'No target app package.json found near this Contexture model.',
      };
    }

    const targetVersion = await readConvexDependency(packagePath);
    if (!targetVersion) {
      return {
        emitterVersion: CONTEXTURE_SUPPORTED_CONVEX_VERSION,
        targetVersion: null,
        targetPackagePath: packagePath,
        status: 'target_missing',
        message: 'Target app package.json does not declare convex.',
      };
    }

    const status = versionsMatch(CONTEXTURE_SUPPORTED_CONVEX_VERSION, targetVersion)
      ? 'ok'
      : 'mismatch';
    return {
      emitterVersion: CONTEXTURE_SUPPORTED_CONVEX_VERSION,
      targetVersion,
      targetPackagePath: packagePath,
      status,
      message:
        status === 'ok'
          ? 'Contexture emitter and target app Convex versions match.'
          : 'Contexture emitter and target app Convex versions differ.',
    };
  } catch (err) {
    return {
      emitterVersion: CONTEXTURE_SUPPORTED_CONVEX_VERSION,
      targetVersion: null,
      targetPackagePath: null,
      status: 'probe_failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function getConvexAgentReadinessInfo(
  input: unknown,
  deps: ConvexAgentReadinessDeps = {},
): Promise<ConvexAgentReadinessInfo> {
  const { irPath } = parseIpcPayload('convex:agent-readiness', ConvexVersionInputSchema, input);
  const run = deps.execFile ?? execFileAsync;
  const env = deps.env ?? process.env;
  const appDir = await targetAppDirFor(irPath);
  const convexAiFiles = await probeConvexAiFiles(run, env, appDir);
  const contextureMcp = await probeContextureMcp(run, env);
  return { convexAiFiles, contextureMcp };
}

export function registerConvexIpc(): void {
  ipcMain.handle('convex:version-info', async (_evt, input: unknown) =>
    getConvexVersionInfo(input),
  );
  ipcMain.handle('convex:agent-readiness', async (_evt, input: unknown) =>
    getConvexAgentReadinessInfo(input),
  );
}

async function findPackageJson(startDir: string): Promise<string | null> {
  let dir = startDir;
  const root = parse(dir).root;
  while (dir !== root) {
    const candidate = join(dir, 'package.json');
    try {
      await readFile(candidate, 'utf8');
      return candidate;
    } catch {
      dir = dirname(dir);
    }
  }
  return null;
}

async function targetAppDirFor(irPath: string): Promise<string> {
  const packagePath = await findPackageJson(projectDirFor(irPath));
  return packagePath ? dirname(packagePath) : projectDirFor(irPath);
}

async function probeConvexAiFiles(
  run: ExecFileLike,
  env: NodeJS.ProcessEnv,
  cwd: string,
): Promise<ConvexAgentReadinessInfo['convexAiFiles']> {
  const command = 'bunx convex ai-files status';
  try {
    const result = await run('bunx', ['convex', 'ai-files', 'status'], {
      cwd,
      env,
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
    });
    const output = compactOutput(result.stdout, result.stderr);
    return {
      command,
      status: convexAiFilesOutputReady(output) ? 'ready' : 'not_ready',
      message: output || 'Convex AI files status did not return output.',
    };
  } catch (err) {
    return {
      command,
      status: 'probe_failed',
      message: outputFromThrownExecError(err) || (err instanceof Error ? err.message : String(err)),
    };
  }
}

async function probeContextureMcp(
  run: ExecFileLike,
  env: NodeJS.ProcessEnv,
): Promise<ConvexAgentReadinessInfo['contextureMcp']> {
  const command = 'codex mcp list';
  try {
    const result = await run('codex', ['mcp', 'list'], {
      env,
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
    });
    const output = compactOutput(result.stdout, result.stderr);
    return {
      command,
      status: contextureMcpOutputReady(output) ? 'ready' : 'not_ready',
      message: output || 'Codex MCP list did not return output.',
    };
  } catch (err) {
    return {
      command,
      status: 'probe_failed',
      message: outputFromThrownExecError(err) || (err instanceof Error ? err.message : String(err)),
    };
  }
}

function convexAiFilesOutputReady(output: string): boolean {
  return /Convex AI files:\s*enabled/iu.test(output) && /Agent skills:\s*installed/iu.test(output);
}

function contextureMcpOutputReady(output: string): boolean {
  return /^contexture\s+.+\s+enabled\b/imu.test(output);
}

function compactOutput(stdout?: string | Buffer, stderr?: string | Buffer): string {
  return [stdout, stderr]
    .map((value) => (value ? String(value).trim() : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function outputFromThrownExecError(err: unknown): string {
  if (!err || typeof err !== 'object') return '';
  const maybeOutput = err as { stdout?: unknown; stderr?: unknown };
  return compactOutput(
    typeof maybeOutput.stdout === 'string' || Buffer.isBuffer(maybeOutput.stdout)
      ? maybeOutput.stdout
      : undefined,
    typeof maybeOutput.stderr === 'string' || Buffer.isBuffer(maybeOutput.stderr)
      ? maybeOutput.stderr
      : undefined,
  );
}

async function readConvexDependency(packagePath: string): Promise<string | null> {
  const raw = await readFile(packagePath, 'utf8');
  const parsed = JSON.parse(raw) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  return (
    parsed.dependencies?.convex ??
    parsed.devDependencies?.convex ??
    parsed.peerDependencies?.convex ??
    null
  );
}

function versionsMatch(emitterVersion: string, targetVersion: string): boolean {
  return normalizeVersion(emitterVersion) === normalizeVersion(targetVersion);
}

function normalizeVersion(version: string): string {
  return version
    .trim()
    .replace(/^npm:/u, '')
    .replace(/^convex@/u, '')
    .replace(/^[~^=<> ]+/u, '');
}
