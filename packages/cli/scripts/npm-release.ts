import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { inspectNpmInstallability, inspectNpmLatest, inspectNpmRelease } from './npm-registry';

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

// npm scans new publications before exposing them to package managers. Allow
// twenty minutes for index visibility; never republish while waiting for it.
const deadline = Date.now() + (command === 'publish' ? 20 * 60_000 : 0);
for (let attempt = 1; ; attempt += 1) {
  if (
    (await inspectNpmRelease(artifact, fetch)) === 'published' &&
    (await inspectNpmLatest(artifact, fetch)) === version &&
    (await inspectNpmInstallability(artifact, fetch)) === 'available'
  ) {
    console.log(
      `Verified npm ${artifact.name}@${version}: install index, metadata and downloaded bytes match the tested tarball.`,
    );
    process.exit(0);
  }
  const remaining = deadline - Date.now();
  if (remaining <= 0) break;
  console.log(
    `Waiting for npm ${artifact.name}@${version} to become installable (check ${attempt}); npm may still be scanning this publication.`,
  );
  await setTimeout(Math.min(30_000, remaining));
  if (Date.now() >= deadline) break;
}
throw new Error(
  `npm ${artifact.name}@${version} is not installable yet; keep the GitHub release as a draft and rerun failed jobs after npm makes it available`,
);
