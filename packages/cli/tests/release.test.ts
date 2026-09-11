import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyReleaseAssets } from '../scripts/release-assets';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function releaseFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'contexture-release-'));
  directories.push(directory);
  const content = 'packed package';
  const checksum = `${createHash('sha256').update(content).digest('hex')}  contexture-cli-1.2.3.tgz\n`;
  await writeFile(join(directory, 'contexture-cli-1.2.3.tgz'), content);
  await writeFile(join(directory, 'contexture-cli-1.2.3.tgz.sha256'), checksum);
  for (const extension of ['.dmg', '.zip', '-setup.exe', '.AppImage', '.deb']) {
    await writeFile(join(directory, `Contexture-1.2.3${extension}`), content);
  }
  const sha512 = createHash('sha512').update(content).digest('base64');
  for (const [name, extension] of [
    ['latest.yml', '-setup.exe'],
    ['latest-mac.yml', '.zip'],
    ['latest-linux.yml', '.AppImage'],
  ] as const) {
    await writeFile(
      join(directory, name),
      `version: 1.2.3\nfiles:\n  - url: Contexture-1.2.3${extension}\n    sha512: ${sha512}\npath: Contexture-1.2.3${extension}\nsha512: ${sha512}\n`,
    );
  }
  return { directory, checksum };
}

describe('release publication gate', () => {
  it('rejects a draft missing desktop artifacts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'contexture-release-'));
    directories.push(directory);
    const content = 'packed package';
    const checksum = `${createHash('sha256').update(content).digest('hex')}  contexture-cli-1.2.3.tgz\n`;
    await writeFile(join(directory, 'contexture-cli-1.2.3.tgz'), content);
    await writeFile(join(directory, 'contexture-cli-1.2.3.tgz.sha256'), checksum);
    await expect(verifyReleaseAssets(directory, '1.2.3', checksum)).rejects.toThrow(
      'Missing desktop artifact',
    );
  });

  it('accepts complete artifacts with verified updater checksums', async () => {
    const { directory, checksum } = await releaseFixture();
    await expect(verifyReleaseAssets(directory, '1.2.3', checksum)).resolves.toBeUndefined();
  });

  it('rejects a CLI tarball changed after consumer testing', async () => {
    const { directory, checksum } = await releaseFixture();
    await writeFile(join(directory, 'contexture-cli-1.2.3.tgz'), 'changed');
    await expect(verifyReleaseAssets(directory, '1.2.3', checksum)).rejects.toThrow(
      'differs from the tested artifact',
    );
  });

  it('rejects a replacement checksum even when supplied with a replacement tarball', async () => {
    const { directory, checksum } = await releaseFixture();
    await writeFile(join(directory, 'contexture-cli-1.2.3.tgz.sha256'), 'replacement');
    await expect(verifyReleaseAssets(directory, '1.2.3', checksum)).rejects.toThrow(
      'differs from the tested artifact',
    );
  });

  it('rejects desktop files that do not match auto-update metadata', async () => {
    const { directory, checksum } = await releaseFixture();
    await writeFile(join(directory, 'Contexture-1.2.3.zip'), 'truncated upload');
    await expect(verifyReleaseAssets(directory, '1.2.3', checksum)).rejects.toThrow(
      'Invalid update checksum',
    );
  });

  it('rejects missing auto-update metadata', async () => {
    const { directory, checksum } = await releaseFixture();
    await rm(join(directory, 'latest-linux.yml'));
    await expect(verifyReleaseAssets(directory, '1.2.3', checksum)).rejects.toThrow(
      'Missing desktop update metadata',
    );
  });

  it('rejects updater metadata from another version', async () => {
    const { directory, checksum } = await releaseFixture();
    await writeFile(join(directory, 'latest.yml'), 'version: 1.2.2\nfiles: []\n');
    await expect(verifyReleaseAssets(directory, '1.2.3', checksum)).rejects.toThrow();
  });
});
