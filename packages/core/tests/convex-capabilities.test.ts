import { describe, expect, it } from 'vitest';
import { buildConvexCapabilityManifest, parseConvexCliCommands } from '../src';

describe('convex capabilities', () => {
  it('parses Convex CLI commands from help output', () => {
    expect(
      parseConvexCliCommands(`
Commands:
  dev [options]                        Develop against a dev deployment
  dashboard|dash [options]             Open the dashboard
  ai-files                             Manage Convex AI files
`),
    ).toEqual(['ai-files', 'dashboard', 'dev']);
  });

  it('builds a stable capability manifest from local package surfaces', () => {
    expect(
      buildConvexCapabilityManifest({
        packageVersion: '1.40.0',
        cliVersion: '1.40.0',
        validators: ['string', 'id', 'id'],
        serverExports: ['defineSchema', 'defineTable'],
        cliHelp: 'Commands:\n  dev [options]\n  deployment\n',
        generatedAt: '2026-06-03T00:00:00.000Z',
      }),
    ).toEqual({
      version: 1,
      packageVersion: '1.40.0',
      cliVersion: '1.40.0',
      validators: ['id', 'string'],
      serverExports: ['defineSchema', 'defineTable'],
      cliCommands: ['deployment', 'dev'],
      defineSchemaOptions: ['schemaValidation', 'strictTableNameTypes'],
      generatedAt: '2026-06-03T00:00:00.000Z',
    });
  });
});
