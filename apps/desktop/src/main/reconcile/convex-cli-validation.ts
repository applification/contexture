import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { bundlePathsFor, generatedTargetForPath } from '@contexture/core/paths';

const execFileAsync = promisify(execFile);

export type ConvexCliValidationResult =
  | {
      status: 'skipped';
      reason: string;
    }
  | {
      status: 'passed';
      command: string;
      output?: string;
    }
  | {
      status: 'failed';
      command: string;
      error: string;
      output?: string;
    };

export type ExecFileLike = (
  file: string,
  args: readonly string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeout: number;
    maxBuffer: number;
  },
) => Promise<{ stdout?: string | Buffer; stderr?: string | Buffer }>;

interface ValidateConvexCliInput {
  irPath: string;
  targetPath: string;
}

interface ValidateConvexCliDeps {
  execFile?: ExecFileLike;
  env?: NodeJS.ProcessEnv;
}

const COMMAND = ['npx', '--no-install', 'convex', 'dev', '--once'] as const;

export async function validateReconciledConvexProject(
  input: ValidateConvexCliInput,
  deps: ValidateConvexCliDeps = {},
): Promise<ConvexCliValidationResult> {
  const target = generatedTargetForPath(input.irPath, input.targetPath);
  if (target?.kind !== 'convex' && target?.kind !== 'convex-validators') {
    return { status: 'skipped', reason: 'Target is not a Convex generated file.' };
  }

  const projectDir = dirname(dirname(bundlePathsFor(input.irPath).convex));
  const configured = await hasConvexCliValidationConfig(projectDir, deps.env ?? process.env);
  if (!configured.ok) return { status: 'skipped', reason: configured.reason };

  const run = deps.execFile ?? execFileAsync;
  try {
    const result = await run(COMMAND[0], COMMAND.slice(1), {
      cwd: projectDir,
      env: deps.env ?? process.env,
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    });
    return {
      status: 'passed',
      command: COMMAND.join(' '),
      output: compactOutput(result.stdout, result.stderr),
    };
  } catch (err) {
    return {
      status: 'failed',
      command: COMMAND.join(' '),
      error: err instanceof Error ? err.message : String(err),
      output: outputFromThrownExecError(err),
    };
  }
}

async function hasConvexCliValidationConfig(
  projectDir: string,
  env: NodeJS.ProcessEnv,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const packageJson = await readJsonObject(join(projectDir, 'package.json'));
  if (!packageJson) return { ok: false, reason: 'No project package.json found.' };

  const deps = {
    ...recordValue(packageJson.dependencies),
    ...recordValue(packageJson.devDependencies),
    ...recordValue(packageJson.optionalDependencies),
  };
  if (!('convex' in deps)) {
    return { ok: false, reason: 'Project does not depend on the Convex CLI package.' };
  }

  if (env.CONVEX_DEPLOYMENT || env.CONVEX_DEPLOY_KEY) return { ok: true };

  const dotenv = await readOptionalText(join(projectDir, '.env.local'));
  if (dotenv && /^\s*CONVEX_DEPLOYMENT\s*=/m.test(dotenv)) return { ok: true };

  return {
    ok: false,
    reason:
      'Convex deployment is not configured via CONVEX_DEPLOYMENT, CONVEX_DEPLOY_KEY, or .env.local.',
  };
}

async function readJsonObject(path: string): Promise<Record<string, unknown> | null> {
  const text = await readOptionalText(path);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function readOptionalText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function compactOutput(
  stdout: string | Buffer | undefined,
  stderr: string | Buffer | undefined,
): string | undefined {
  const output = [stdout, stderr]
    .filter((part): part is string | Buffer => part !== undefined)
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join('\n');
  return output || undefined;
}

function outputFromThrownExecError(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const candidate = err as { stdout?: string | Buffer; stderr?: string | Buffer };
  return compactOutput(candidate.stdout, candidate.stderr);
}
