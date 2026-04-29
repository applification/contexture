/**
 * `scaffoldTurboSkeleton` (stage 1) — writes the minimal TurboRepo
 * monorepo skeleton without invoking the create-turbo CLI (which
 * always adds an apps/web stub we don't want). Creates:
 *   - package.json (workspace root)
 *   - turbo.json
 *   - .gitignore
 *   - apps/ and packages/ directories (via placeholder files)
 */
import type { FsAdapter } from '@main/documents/document-store';
import type { ScaffoldConfig } from './scaffold-project';

export interface TurboSkeletonDeps {
  fs: FsAdapter;
}

const TURBO_CONFIG = {
  $schema: 'https://turbo.build/schema.json',
  tasks: {
    build: { dependsOn: ['^build'], outputs: ['.next/**', '!.next/cache/**', 'dist/**'] },
    dev: { cache: false, persistent: true },
    lint: { dependsOn: ['^lint'] },
    typecheck: { dependsOn: ['^typecheck'] },
  },
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

export async function scaffoldTurboSkeleton(
  config: ScaffoldConfig,
  deps: TurboSkeletonDeps,
): Promise<void> {
  const { fs } = deps;
  const { targetDir, projectName } = config;

  const rootPkg = {
    name: projectName,
    private: true,
    packageManager: 'bun',
    workspaces: ['apps/*', 'packages/*'],
    scripts: {
      build: 'turbo build',
      dev: 'turbo dev',
      lint: 'turbo lint',
      typecheck: 'turbo typecheck',
    },
    devDependencies: {
      '@contexture/cli': 'workspace:*',
      turbo: 'latest',
    },
  };

  await fs.writeFile(`${targetDir}/package.json`, `${JSON.stringify(rootPkg, null, 2)}\n`);
  await fs.writeFile(`${targetDir}/turbo.json`, `${JSON.stringify(TURBO_CONFIG, null, 2)}\n`);
  await fs.writeFile(`${targetDir}/.gitignore`, ROOT_GITIGNORE);
  // Create empty directory markers so downstream stages can cd into them.
  await fs.writeFile(`${targetDir}/apps/.gitkeep`, '');
  await fs.writeFile(`${targetDir}/packages/.gitkeep`, '');
}
