import { isMcpMode } from '@main/mcp-entrypoint';
import { describe, expect, it } from 'vitest';

describe('packaged MCP entrypoint', () => {
  it('detects the explicit --mcp launch flag', () => {
    expect(isMcpMode(['/Applications/Contexture.app/Contents/MacOS/Contexture', '--mcp'])).toBe(
      true,
    );
  });

  it('leaves normal app launches on the Electron UI path', () => {
    expect(isMcpMode(['/Applications/Contexture.app/Contents/MacOS/Contexture'])).toBe(false);
  });
});
