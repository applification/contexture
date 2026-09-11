import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { inspectNpmLatest, inspectNpmRelease } from './npm-registry';

const [command, directoryArgument] = process.argv.slice(2);
assert.ok(
  command === 'publish' || command === 'verify',
  'Usage: npm-release.js publish|verify artifact-directory',
);
assert.ok(directoryArgument, 'An artifact directory is required');
const directory = resolve(directoryArgument);
const version = (await readFile(join(directory, 'version.txt'), 'utf8')).trim();
assert.match(version, /^\d+\.\d+\.\d+$/);
const filename = `contexture-cli-${version}.tgz`;
const bytes = await readFile(join(directory, filename));
const checksum = await readFile(join(directory, `${filename}.sha256`), 'utf8');
assert.equal(checksum, `${createHash('sha256').update(bytes).digest('hex')}  ${filename}\n`);
const manifest = JSON.parse(await readFile(join(directory, 'package-manifest.json'), 'utf8'));
assert.equal(manifest.version, version);
assert.equal(manifest.name, '@applification/contexture');
assert.notEqual(manifest.private, true);
const artifact = {
  name: manifest.name,
  version,
  integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
};
const status = await inspectNpmRelease(artifact, fetch);
await inspectNpmLatest(artifact, fetch);

if (command === 'publish' && status === 'missing') {
  // This script is run on Linux in the release workflow; it publishes the tested bytes.
  // npm handles OIDC in CI and the maintainer's interactive login for first publication.
  const publish = spawn(
    'npm',
    [
      'publish',
      join(directory, filename),
      '--access',
      'public',
      '--registry=https://registry.npmjs.org/',
      '--ignore-scripts',
    ],
    { stdio: 'inherit' },
  );
  const [code] = await once(publish, 'close');
  assert.equal(code, 0, 'npm publish failed; retry only with this same verified artifact');
}

for (let attempt = 0; attempt < 6; attempt += 1) {
  if (
    (await inspectNpmRelease(artifact, fetch)) === 'published' &&
    (await inspectNpmLatest(artifact, fetch)) === version
  ) {
    console.log(
      `Verified npm ${artifact.name}@${version}: metadata and downloaded bytes match the tested tarball.`,
    );
    process.exit(0);
  }
  await setTimeout(2_000);
}
throw new Error(
  `npm ${artifact.name}@${version} is not visible yet; the GitHub release must remain a draft`,
);
