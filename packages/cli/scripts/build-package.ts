import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import desktopPackage from '../../../apps/desktop/package.json';
import cliPackage from '../package.json';

export const cliDirectory = fileURLToPath(new URL('..', import.meta.url));
export const packageDirectory = join(cliDirectory, 'dist/package');
export const releaseDirectory = join(cliDirectory, 'dist/release');

export async function buildCliPackage(tag: string | undefined): Promise<void> {
  const version = cliPackage.version;
  if (!/^\d+\.\d+\.\d+$/.test(version) || version !== desktopPackage.version) {
    throw new Error(
      `CLI version ${version} must match stable desktop version ${desktopPackage.version}`,
    );
  }
  if (tag !== undefined && tag !== `v${version}`) {
    throw new Error(`Release tag ${tag} does not match package version ${version}`);
  }

  const dependencies = Object.fromEntries(
    Object.entries(cliPackage.dependencies).filter(([, value]) => !value.startsWith('workspace:')),
  );
  await rm(packageDirectory, { recursive: true, force: true });
  await mkdir(packageDirectory, { recursive: true });
  const build = await Bun.build({
    entrypoints: ['index', 'mcp', 'mcp-server'].map((entry) =>
      join(cliDirectory, `src/${entry}.ts`),
    ),
    outdir: join(packageDirectory, 'dist'),
    target: 'node',
    format: 'esm',
    splitting: true,
    external: Object.keys(dependencies),
    define: { CONTEXTURE_MCP_VERSION: JSON.stringify(version) },
  });
  if (!build.success) throw new AggregateError(build.logs, 'Node CLI bundle failed');
  for (const name of ['index', 'mcp']) {
    await chmod(join(packageDirectory, `dist/${name}.js`), 0o755);
  }
  await writeFile(
    join(packageDirectory, 'package.json'),
    `${JSON.stringify(
      {
        name: cliPackage.name,
        version,
        publishConfig: { access: 'public', registry: 'https://registry.npmjs.org/' },
        description: cliPackage.description,
        license: cliPackage.license,
        type: 'module',
        engines: cliPackage.engines,
        repository: {
          type: 'git',
          url: 'https://github.com/applification/contexture.git',
          directory: 'packages/cli',
        },
        bin: { contexture: './dist/index.js', 'contexture-mcp': './dist/mcp.js' },
        exports: {
          '.': './dist/index.js',
          './mcp-server': './dist/mcp-server.js',
          './package.json': './package.json',
        },
        files: ['dist', 'README.md'],
        dependencies,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(packageDirectory, 'README.md'),
    await readFile(join(cliDirectory, 'README.md')),
  );
}

if (import.meta.main) await buildCliPackage(process.argv[2]);
