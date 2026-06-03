import { readFile } from 'node:fs/promises';
import { dirname, join, parse } from 'node:path';
import { CONTEXTURE_SUPPORTED_CONVEX_VERSION, projectDirFor } from '@contexture/core';
import { ipcMain } from 'electron';
import { z } from 'zod';
import { IpcString, parseIpcPayload } from './validation';

export type ConvexVersionStatus = 'ok' | 'mismatch' | 'target_missing' | 'probe_failed';

export interface ConvexVersionInfo {
  emitterVersion: string;
  targetVersion: string | null;
  targetPackagePath: string | null;
  status: ConvexVersionStatus;
  message: string;
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

export function registerConvexIpc(): void {
  ipcMain.handle('convex:version-info', async (_evt, input: unknown) =>
    getConvexVersionInfo(input),
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
