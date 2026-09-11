import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import cliPackage from '../package.json';
import { buildCliPackage, cliDirectory, packageDirectory, releaseDirectory } from './build-package';

await buildCliPackage(process.argv[2]);
await rm(releaseDirectory, { recursive: true, force: true });
await mkdir(releaseDirectory, { recursive: true });
const pack = Bun.spawn(
  ['npm', 'pack', '--ignore-scripts', '--pack-destination', releaseDirectory],
  {
    cwd: packageDirectory,
    stdout: 'inherit',
    stderr: 'inherit',
  },
);
if ((await pack.exited) !== 0) throw new Error('npm pack failed');
const filename = `contexture-cli-${cliPackage.version}.tgz`;
const npmFilename = `${cliPackage.name.replace('@', '').replace('/', '-')}-${cliPackage.version}.tgz`;
await rename(join(releaseDirectory, npmFilename), join(releaseDirectory, filename));
const tarball = await readFile(join(releaseDirectory, filename));
await writeFile(
  join(releaseDirectory, `${filename}.sha256`),
  `${createHash('sha256').update(tarball).digest('hex')}  ${filename}\n`,
);
await writeFile(join(releaseDirectory, 'version.txt'), `${cliPackage.version}\n`);
await copyFile(
  join(cliDirectory, 'scripts/verify-package.ts'),
  join(releaseDirectory, 'verify-package.ts'),
);
await copyFile(
  join(packageDirectory, 'package.json'),
  join(releaseDirectory, 'package-manifest.json'),
);
const releaseTools = await Bun.build({
  entrypoints: [join(cliDirectory, 'scripts/npm-release.ts')],
  outdir: releaseDirectory,
  target: 'node',
  format: 'esm',
});
if (!releaseTools.success)
  throw new AggregateError(releaseTools.logs, 'Release tooling build failed');
