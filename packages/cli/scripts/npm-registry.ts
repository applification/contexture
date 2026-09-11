import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export interface NpmArtifact {
  name: string;
  version: string;
  integrity: string;
}

export type NpmRequest = (
  url: string | URL,
  init: { signal: AbortSignal; headers?: Record<string, string> },
) => Promise<Response>;

export async function inspectNpmInstallability(artifact: NpmArtifact, request: NpmRequest) {
  // Version endpoints and tarballs can be visible while npm's publish-time scan
  // still withholds the package index used by package managers.
  const response = await request(
    `https://registry.npmjs.org/${encodeURIComponent(artifact.name)}`,
    {
      signal: AbortSignal.timeout(30_000),
      headers: { accept: 'application/vnd.npm.install-v1+json' },
    },
  );
  if (response.status === 404) return 'pending';
  if (!response.ok) throw new Error(`npm install index lookup failed: HTTP ${response.status}`);
  const metadata = await response.json();
  assert.equal(metadata.name, artifact.name, 'npm install index package name differs');
  assert.ok(
    metadata.versions && typeof metadata.versions === 'object',
    'npm install index is missing versions',
  );
  const version = metadata.versions[artifact.version];
  if (version === undefined) return 'pending';
  assert.equal(version.name, artifact.name, 'npm install index version package name differs');
  assert.equal(version.version, artifact.version, 'npm install index version differs');
  assert.equal(
    version.dist?.integrity,
    artifact.integrity,
    'npm install index differs from the tested artifact',
  );
  return 'available';
}

export async function inspectNpmLatest(
  artifact: NpmArtifact,
  request: NpmRequest,
): Promise<string | null> {
  const response = await request(
    `https://registry.npmjs.org/${encodeURIComponent(artifact.name)}/latest`,
    { signal: AbortSignal.timeout(30_000) },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`npm latest lookup failed: HTTP ${response.status}`);
  const { version } = await response.json();
  assert.equal(typeof version, 'string');
  assert.match(version, /^\d+\.\d+\.\d+$/, 'npm latest must identify a stable release');
  const published = version.split('.').map(Number);
  const candidate = artifact.version.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (published[index] === candidate[index]) continue;
    assert.ok(
      (published[index] ?? 0) < (candidate[index] ?? 0),
      `npm latest ${version} is newer than ${artifact.version}; refusing to move latest backwards`,
    );
    break;
  }
  return version;
}

export async function inspectNpmRelease(artifact: NpmArtifact, request: NpmRequest) {
  const endpoint = `https://registry.npmjs.org/${encodeURIComponent(artifact.name)}/${artifact.version}`;
  const response = await request(endpoint, { signal: AbortSignal.timeout(30_000) });
  if (response.status === 404) return 'missing';
  if (!response.ok) throw new Error(`npm registry lookup failed: HTTP ${response.status}`);
  const metadata = await response.json();
  assert.equal(metadata.name, artifact.name, 'npm package name differs');
  assert.equal(metadata.version, artifact.version, 'npm package version differs');
  assert.equal(
    metadata.dist?.integrity,
    artifact.integrity,
    'npm version differs from the tested artifact; never overwrite it',
  );
  const tarballUrl = new URL(metadata.dist.tarball);
  assert.equal(tarballUrl.origin, 'https://registry.npmjs.org', 'Unexpected npm tarball origin');
  const download = await request(tarballUrl, { signal: AbortSignal.timeout(30_000) });
  if (!download.ok) throw new Error(`npm tarball download failed: HTTP ${download.status}`);
  const integrity = `sha512-${createHash('sha512')
    .update(Buffer.from(await download.arrayBuffer()))
    .digest('base64')}`;
  assert.equal(integrity, artifact.integrity, 'npm download differs from the tested artifact');
  return 'published';
}
