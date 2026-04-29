/**
 * `scaffoldWorkspaceStitch` (stage 9) — finishes the file side of the
 * scaffold: if a web app was created, adds `@<project>/contexture: workspace:*`
 * to `apps/web/package.json`; writes the root `CLAUDE.md`, `biome.json`,
 * and root `.gitignore` (overwriting the skeleton's version with the
 * richer one). Pure file work; the subsequent git + bun install stages
 * are handled elsewhere.
 *
 * Idempotent by construction: the dep is only added if missing, and
 * file writes overwrite with the same content on re-run.
 */
import type { FsAdapter } from '@main/documents/document-store';
import { emit as emitClaudeMd } from '@renderer/model/emit-claude-md';

import type { ScaffoldConfig } from './scaffold-project';

export interface WorkspaceStitchDeps {
  fs: FsAdapter;
}

const BIOME_CONFIG = {
  $schema: 'https://biomejs.dev/schemas/2.0.0/schema.json',
  vcs: { enabled: true, clientKind: 'git', useIgnoreFile: true },
  files: { ignoreUnknown: true },
  formatter: { enabled: true, indentStyle: 'space', indentWidth: 2, lineWidth: 100 },
  linter: { enabled: true, rules: { recommended: true } },
  javascript: { formatter: { quoteStyle: 'single', semicolons: 'always' } },
};

const ROOT_GITIGNORE = [
  'node_modules',
  '.next',
  'dist',
  'out',
  '.turbo',
  '.convex',
  '.DS_Store',
  '*.log',
  '.env.local',
  '',
].join('\n');

export async function scaffoldWorkspaceStitch(
  config: ScaffoldConfig,
  deps: WorkspaceStitchDeps,
): Promise<void> {
  const { fs } = deps;

  if (config.apps.includes('web')) {
    const webPkgPath = `${config.targetDir}/apps/web/package.json`;
    const raw = await fs.readFile(webPkgPath);
    const pkg = JSON.parse(raw) as { dependencies?: Record<string, string>; [k: string]: unknown };
    pkg.dependencies ??= {};
    pkg.dependencies[`@${config.projectName}/contexture`] = 'workspace:*';
    await fs.writeFile(webPkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  await fs.writeFile(`${config.targetDir}/CLAUDE.md`, emitClaudeMd(config.projectName));
  await fs.writeFile(
    `${config.targetDir}/biome.json`,
    `${JSON.stringify(BIOME_CONFIG, null, 2)}\n`,
  );
  await fs.writeFile(`${config.targetDir}/.gitignore`, ROOT_GITIGNORE);
}
