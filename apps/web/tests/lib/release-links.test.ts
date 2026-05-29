import { describe, expect, it } from 'vitest';
import { getReleaseLinkLabel } from '@/lib/release-links';

describe('getReleaseLinkLabel', () => {
  it('summarises bare Contexture pull request links', () => {
    const href = 'https://github.com/applification/contexture/pull/320';

    expect(getReleaseLinkLabel(href, href)).toBe('Pull request #320');
  });

  it('summarises bare Contexture compare links', () => {
    const href = 'https://github.com/applification/contexture/compare/v0.1.0...v0.2.0';

    expect(getReleaseLinkLabel(href, href)).toBe('Compare changes');
  });

  it('keeps authored markdown link text unchanged', () => {
    const href = 'https://github.com/applification/contexture/compare/v0.1.0...v0.2.0';

    expect(getReleaseLinkLabel(href, 'Full changelog')).toBe('Full changelog');
  });

  it('falls back to the hostname for other bare links', () => {
    const href = 'https://example.com/really/long/path';

    expect(getReleaseLinkLabel(href, href)).toBe('example.com');
  });
});
