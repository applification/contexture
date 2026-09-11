import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { inspectNpmLatest, inspectNpmRelease, type NpmRequest } from '../scripts/npm-registry';

describe('npm release verification', () => {
  it('refuses an older release that would move latest backwards', async () => {
    const request: NpmRequest = async () => Response.json({ version: '1.3.0' });
    await expect(
      inspectNpmLatest(
        { name: '@applification/contexture', version: '1.2.3', integrity: 'unused' },
        request,
      ),
    ).rejects.toThrow('newer');
  });
  it('allows publishing an unpublished version', async () => {
    const artifact = Buffer.from('verified package');
    const request: NpmRequest = async () => new Response(null, { status: 404 });
    await expect(
      inspectNpmRelease(
        {
          name: '@applification/contexture',
          version: '1.2.3',
          integrity: `sha512-${createHash('sha512').update(artifact).digest('base64')}`,
        },
        request,
      ),
    ).resolves.toBe('missing');
  });

  it('accepts an already published version only when its metadata and download match', async () => {
    const content = 'verified package';
    const artifact = {
      name: '@applification/contexture',
      version: '1.2.3',
      integrity: `sha512-${createHash('sha512').update(content).digest('base64')}`,
    };
    const request: NpmRequest = async (url) =>
      String(url).endsWith('.tgz')
        ? new Response(content)
        : Response.json({
            ...artifact,
            dist: {
              integrity: artifact.integrity,
              tarball: 'https://registry.npmjs.org/@applification/contexture/-/cli-1.2.3.tgz',
            },
          });
    await expect(inspectNpmRelease(artifact, request)).resolves.toBe('published');
  });

  it('rejects an existing version with different contents', async () => {
    const request: NpmRequest = async () =>
      Response.json({
        name: '@applification/contexture',
        version: '1.2.3',
        dist: { integrity: 'sha512-different' },
      });
    await expect(
      inspectNpmRelease(
        { name: '@applification/contexture', version: '1.2.3', integrity: 'sha512-tested' },
        request,
      ),
    ).rejects.toThrow('differs from the tested artifact');
  });

  it('rejects a corrupted download even when registry metadata matches', async () => {
    const request: NpmRequest = async (url) =>
      String(url).endsWith('.tgz')
        ? new Response('corrupt')
        : Response.json({
            name: '@applification/contexture',
            version: '1.2.3',
            dist: { integrity: 'sha512-tested', tarball: 'https://registry.npmjs.org/cli.tgz' },
          });
    await expect(
      inspectNpmRelease(
        { name: '@applification/contexture', version: '1.2.3', integrity: 'sha512-tested' },
        request,
      ),
    ).rejects.toThrow('npm download differs');
  });

  it('does not treat registry failures as an unpublished version', async () => {
    const request: NpmRequest = async () => new Response(null, { status: 503 });
    await expect(
      inspectNpmRelease(
        { name: '@applification/contexture', version: '1.2.3', integrity: 'sha512-tested' },
        request,
      ),
    ).rejects.toThrow('HTTP 503');
  });
});
