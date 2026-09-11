import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { verifyReleaseAssets } from './release-assets';

const [tag, directory, verifiedDirectory] = process.argv.slice(2);
if (!tag?.startsWith('v') || !directory || !verifiedDirectory) {
  throw new Error('Usage: verify-release.ts vVERSION downloaded-assets verified-cli-artifact');
}
const version = tag.slice(1);
const verifiedVersion = (await readFile(join(verifiedDirectory, 'version.txt'), 'utf8')).trim();
if (version !== verifiedVersion)
  throw new Error('Verified artifact version does not match the release tag');
const checksum = await readFile(
  join(verifiedDirectory, `contexture-cli-${version}.tgz.sha256`),
  'utf8',
);
await verifyReleaseAssets(directory, version, checksum);
console.log(`Verified ${tag}: tested CLI tarball, desktop installers and auto-update checksums.`);
