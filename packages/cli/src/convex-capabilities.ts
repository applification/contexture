import { execFile } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { buildConvexCapabilityManifest } from '@contexture/core';
import { z } from 'zod';

const runFile = promisify(execFile);

export async function collectConvexCapabilities(cwd: string) {
  const packagePath = await findConsumerConvex(cwd);
  const convexPackage = z
    .object({ version: z.string().min(1), bin: z.object({ convex: z.string().min(1) }) })
    .parse(JSON.parse(await readFile(packagePath, 'utf8')));
  // Resolve exports from the same package that owns the CLI, even in nested workspaces.
  const convexRequire = createRequire(packagePath);
  const values = z
    .object({ v: z.record(z.string(), z.unknown()) })
    .parse(convexRequire('convex/values'));
  const server = z.record(z.string(), z.unknown()).parse(convexRequire('convex/server'));
  const cliPath = resolve(dirname(packagePath), convexPackage.bin.convex);
  const [cliVersion, cliHelp] = await Promise.all([
    runFile(process.execPath, [cliPath, '--version'], { cwd, timeout: 30_000 }),
    runFile(process.execPath, [cliPath, '--help'], { cwd, timeout: 30_000 }),
  ]);

  return buildConvexCapabilityManifest({
    packageVersion: convexPackage.version,
    cliVersion: cliVersion.stdout.trim() || null,
    validators: Object.keys(values.v),
    serverExports: Object.keys(server),
    cliHelp: cliHelp.stdout,
  });
}

async function findConsumerConvex(cwd: string): Promise<string> {
  // Follow consumer node_modules ancestors and workspace symlinks only. This also prevents
  // Bun's source-mode resolution and NODE_PATH from falling back to the tooling's dependencies.
  for (let directory = resolve(cwd); ; directory = dirname(directory)) {
    try {
      return await realpath(join(directory, 'node_modules/convex/package.json'));
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    }
    if (dirname(directory) === directory) break;
  }
  throw new Error(`No installed Convex package found from ${cwd}. Install convex in this project.`);
}
