import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const { buildMcpCli } =
  require('../../scripts/build-mcp-cli.cjs') as typeof import('../../scripts/build-mcp-cli.cjs');
const { createBeforePack } =
  require('../../scripts/electron-builder-before-pack.cjs') as typeof import('../../scripts/electron-builder-before-pack.cjs');

describe('desktop packaging scripts', () => {
  it('builds the packaged MCP command into electron-builder extraResources', () => {
    const calls: unknown[][] = [];
    const mkdirCalls: unknown[][] = [];

    buildMcpCli({
      appDir: '/repo/apps/desktop',
      workspaceRoot: '/repo',
      platform: 'darwin',
      mkdirSync: (...args: unknown[]) => {
        mkdirCalls.push(args);
      },
      spawnSync: (...args: unknown[]) => {
        calls.push(args);
        return { status: 0 };
      },
      version: '0.15.38',
    });

    expect(mkdirCalls).toEqual([['/repo/apps/desktop/build/bin', { recursive: true }]]);
    expect(calls).toEqual([
      [
        'bun',
        [
          'build',
          '--compile',
          '--define',
          'CONTEXTURE_MCP_VERSION="0.15.38"',
          '--outfile',
          '/repo/apps/desktop/build/bin/contexture-mcp',
          '/repo/packages/cli/src/mcp.ts',
        ],
        { cwd: '/repo', stdio: 'inherit' },
      ],
    ]);
  });

  it('runs the MCP build during electron-builder beforePack', async () => {
    const root = await mkdtemp(join(tmpdir(), 'contexture-before-pack-'));
    const appDir = join(root, 'apps', 'desktop');
    const claudeAgentSdkDir = join(appDir, 'node_modules', '@anthropic-ai', 'claude-agent-sdk');
    const sdkDir = join(appDir, 'node_modules', '@anthropic-ai', 'sdk');
    const claudeAgentSdkPackageJsonPath = join(claudeAgentSdkDir, 'package.json');

    await mkdir(claudeAgentSdkDir, { recursive: true });
    await mkdir(sdkDir, { recursive: true });
    await writeFile(join(root, 'package.json'), JSON.stringify({ workspaces: ['apps/*'] }));
    await writeFile(
      claudeAgentSdkPackageJsonPath,
      JSON.stringify({
        name: '@anthropic-ai/claude-agent-sdk',
        dependencies: { '@anthropic-ai/sdk': '^0.95.0' },
      }),
    );
    await writeFile(
      join(sdkDir, 'package.json'),
      JSON.stringify({ name: '@anthropic-ai/sdk', version: '0.95.1', main: 'index.js' }),
    );
    await writeFile(join(sdkDir, 'index.js'), '');

    let built = false;
    const beforePack = createBeforePack({
      buildMcpCli: () => {
        built = true;
      },
    });

    await beforePack({ packager: { projectDir: appDir } });

    expect(built).toBe(true);
    await expect(readFile(claudeAgentSdkPackageJsonPath, 'utf8')).resolves.toContain(
      '"@anthropic-ai/sdk": "0.95.1"',
    );
  });
});
