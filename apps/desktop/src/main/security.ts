import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, parse, resolve } from 'node:path';
import type { Schema } from '@contexture/core';
import { assertContextureIrPath, generatedTargetsFor } from '@contexture/core/paths';

const SAFE_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:']);

export function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return SAFE_EXTERNAL_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

export function assertGeneratedTargetForIr(
  irPath: string,
  targetPath: string,
  schema?: Schema,
): string {
  if (!isAbsolute(irPath) || !isAbsolute(targetPath)) {
    throw new Error('Contexture generated target paths must be absolute.');
  }

  const target = resolve(targetPath);
  const allowed = new Set(
    generatedTargetsFor(resolve(irPath), schema).map((entry) => resolve(entry.path)),
  );

  if (!allowed.has(target)) {
    throw new Error('Target is not a generated Contexture artifact for this IR.');
  }
  return target;
}

export function assertSafeContextureIrPath(inputPath: string): string {
  if (typeof inputPath !== 'string' || inputPath.trim() === '') {
    throw new Error('Contexture IR path must be a non-empty path.');
  }
  if (!isAbsolute(inputPath)) {
    throw new Error('Contexture IR path must be absolute.');
  }
  return assertContextureIrPath(inputPath);
}

export function assertSafeRecursiveDeleteTarget(inputPath: string): string {
  if (typeof inputPath !== 'string' || inputPath.trim() === '') {
    throw new Error('Delete target must be a non-empty path.');
  }
  if (!isAbsolute(inputPath)) {
    throw new Error('Delete target must be an absolute path.');
  }

  const target = resolve(inputPath);
  const root = parse(target).root;
  if (target === root) {
    throw new Error('Refusing to delete a filesystem root.');
  }
  if (target === resolve(homedir())) {
    throw new Error('Refusing to delete the home directory.');
  }
  if (dirname(target) === root) {
    throw new Error(`Refusing to delete top-level directory "${basename(target)}".`);
  }
  if (target === resolve(process.cwd())) {
    throw new Error('Refusing to delete the current working directory.');
  }

  return target;
}
