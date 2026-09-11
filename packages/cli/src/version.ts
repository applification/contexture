import cliPackage from '../package.json' with { type: 'json' };

// The desktop's standalone executable supplies this define at build time.
declare const CONTEXTURE_MCP_VERSION: string | undefined;

export const CONTEXTURE_VERSION =
  typeof CONTEXTURE_MCP_VERSION === 'string' ? CONTEXTURE_MCP_VERSION : cliPackage.version;
