import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('web security headers', () => {
  it('applies baseline browser security headers to every route', async () => {
    const config = await readFile(resolve(process.cwd(), 'next.config.ts'), 'utf8');

    expect(config).toContain("source: '/:path*'");
    expect(config).toContain('Content-Security-Policy');
    expect(config).toContain("default-src 'self'");
    expect(config).toContain("object-src 'none'");
    expect(config).toContain("frame-ancestors 'none'");
    expect(config).toContain('X-Content-Type-Options');
    expect(config).toContain('Permissions-Policy');
  });
});
