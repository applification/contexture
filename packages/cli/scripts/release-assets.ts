import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

async function digest(path: string, algorithm: string, encoding: 'hex' | 'base64') {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest(encoding);
}

export async function verifyReleaseAssets(
  directory: string,
  version: string,
  expectedChecksum: string,
) {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const filename = `contexture-cli-${version}.tgz`;
  assert.equal(
    await readFile(join(directory, `${filename}.sha256`), 'utf8'),
    expectedChecksum,
    'Uploaded CLI checksum differs from the tested artifact',
  );
  assert.equal(
    `${await digest(join(directory, filename), 'sha256', 'hex')}  ${filename}\n`,
    expectedChecksum,
    'Uploaded CLI package differs from the tested artifact',
  );

  const names = await readdir(directory);
  for (const extension of ['.dmg', '.zip', '-setup.exe', '.AppImage', '.deb']) {
    assert.ok(
      names.some((name) => name.startsWith(`Contexture-${version}`) && name.endsWith(extension)),
      `Missing desktop artifact: ${extension}`,
    );
  }
  for (const name of ['latest.yml', 'latest-mac.yml', 'latest-linux.yml']) {
    assert.ok(names.includes(name), `Missing desktop update metadata: ${name}`);
  }
  const metadataSchema = z.object({
    version: z.literal(version),
    files: z
      .array(
        z.object({ url: z.string(), sha512: z.string(), size: z.number().positive().optional() }),
      )
      .min(1),
    path: z.string().optional(),
    sha512: z.string().optional(),
  });
  for (const name of names.filter((entry) => /^latest.*\.yml$/.test(entry))) {
    const metadata = metadataSchema.parse(parse(await readFile(join(directory, name), 'utf8')));
    for (const file of metadata.files) {
      const filename = decodeURIComponent(file.url);
      assert.equal(filename, basename(filename), 'Update metadata must reference a release asset');
      assert.ok(names.includes(filename), `Missing update asset: ${filename}`);
      assert.equal(
        await digest(join(directory, filename), 'sha512', 'base64'),
        file.sha512,
        `Invalid update checksum: ${filename}`,
      );
      if (file.size !== undefined)
        assert.equal((await stat(join(directory, filename))).size, file.size);
    }
    if (metadata.path !== undefined || metadata.sha512 !== undefined) {
      assert.ok(
        metadata.files.some(
          (file) => file.url === metadata.path && file.sha512 === metadata.sha512,
        ),
        `Legacy updater fields disagree with files in ${name}`,
      );
    }
  }
}
