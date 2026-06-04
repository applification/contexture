import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type ExecFileLike,
  getConvexAgentReadinessInfo,
  getConvexVersionInfo,
} from '@main/ipc/convex';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

describe('Convex version IPC helpers', () => {
  it('reports matching target app Convex versions from package.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contexture-convex-'));
    const appDir = join(dir, 'apps/plantry');
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, 'package.json'),
      JSON.stringify({ dependencies: { convex: '^1.39.1' } }),
      'utf8',
    );

    const result = await getConvexVersionInfo({
      irPath: join(appDir, 'plantry.contexture.json'),
    });

    expect(result).toMatchObject({
      emitterVersion: '1.39.1',
      targetVersion: '^1.39.1',
      status: 'ok',
    });
  });

  it('reports mismatched target app Convex versions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contexture-convex-'));
    const appDir = join(dir, 'apps/plantry');
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, 'package.json'),
      JSON.stringify({ devDependencies: { convex: '1.37.0' } }),
      'utf8',
    );

    const result = await getConvexVersionInfo({
      irPath: join(appDir, 'plantry.contexture.json'),
    });

    expect(result).toMatchObject({
      emitterVersion: '1.39.1',
      targetVersion: '1.37.0',
      status: 'mismatch',
    });
  });

  it('reports Convex versions from the configured monorepo Convex package', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contexture-convex-'));
    const convexPackageDir = join(dir, 'packages/convex');
    await mkdir(convexPackageDir, { recursive: true });
    await writeFile(join(dir, 'package.json'), JSON.stringify({}), 'utf8');
    await writeFile(
      join(convexPackageDir, 'package.json'),
      JSON.stringify({ dependencies: { convex: '^1.39.1' } }),
      'utf8',
    );
    await writeFile(
      join(dir, 'app.contexture.json'),
      JSON.stringify({
        version: '1',
        types: [],
        outputs: { convex: { dir: 'packages/convex' } },
      }),
      'utf8',
    );

    const result = await getConvexVersionInfo({
      irPath: join(dir, 'app.contexture.json'),
    });

    expect(result).toMatchObject({
      targetVersion: '^1.39.1',
      targetPackagePath: join(convexPackageDir, 'package.json'),
      status: 'ok',
    });
  });

  it('detects enabled Convex AI files and Contexture MCP from CLI output', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contexture-convex-'));
    const appDir = join(dir, 'apps/todo');
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, 'package.json'),
      JSON.stringify({ devDependencies: { convex: '1.40.0' } }),
      'utf8',
    );
    const execFile = vi.fn<ExecFileLike>(async (file) => {
      if (file === 'bunx') {
        return {
          stdout: `Convex AI files: enabled
  ✔ convex/_generated/ai/guidelines.md: installed, up to date
  ✔ AGENTS.md: Convex section present, up to date
  ✔ CLAUDE.md: Convex section present, up to date
  ✔ Agent skills: installed, up to date
`,
        };
      }
      return {
        stdout:
          'Name        Command                                                             Args  Env  Cwd  Status   Auth\ncontexture  /Applications/Contexture.app/Contents/Resources/bin/contexture-mcp  -     -    -    enabled  Unsupported\n',
      };
    });

    const result = await getConvexAgentReadinessInfo(
      { irPath: join(appDir, 'todo.contexture.json') },
      { execFile },
    );

    expect(result.convexAiFiles.status).toBe('ready');
    expect(result.contextureMcp.status).toBe('ready');
    expect(execFile).toHaveBeenCalledWith(
      'bunx',
      ['convex', 'ai-files', 'status'],
      expect.objectContaining({ cwd: appDir }),
    );
    expect(execFile).toHaveBeenCalledWith(
      'codex',
      ['mcp', 'list'],
      expect.objectContaining({ env: process.env }),
    );
  });

  it('probes Convex AI files from the model project root', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contexture-convex-'));
    const convexPackageDir = join(dir, 'packages/convex');
    await mkdir(convexPackageDir, { recursive: true });
    await writeFile(
      join(convexPackageDir, 'package.json'),
      JSON.stringify({ devDependencies: { convex: '1.40.0' } }),
      'utf8',
    );
    await writeFile(
      join(dir, 'app.contexture.json'),
      JSON.stringify({
        version: '1',
        types: [],
        outputs: { convex: { dir: 'packages/convex' } },
      }),
      'utf8',
    );
    const execFile = vi.fn<ExecFileLike>(async (file) => {
      if (file === 'bunx') {
        return {
          stdout: `Convex AI files: enabled
  ✔ Agent skills: installed, up to date
`,
        };
      }
      return {
        stdout:
          'Name        Command                                                             Args  Env  Cwd  Status   Auth\ncontexture  /Applications/Contexture.app/Contents/Resources/bin/contexture-mcp  -     -    -    enabled  Unsupported\n',
      };
    });

    await getConvexAgentReadinessInfo({ irPath: join(dir, 'app.contexture.json') }, { execFile });

    expect(execFile).toHaveBeenCalledWith(
      'bunx',
      ['convex', 'ai-files', 'status'],
      expect.objectContaining({ cwd: dir }),
    );
  });

  it('reports not-ready agent setup when CLI output lacks installed status', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contexture-convex-'));
    const appDir = join(dir, 'apps/todo');
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, 'package.json'), JSON.stringify({}), 'utf8');
    const execFile = vi.fn<ExecFileLike>(async (file) => {
      if (file === 'bunx') {
        return { stdout: 'Convex AI files: not installed\nRun npx convex ai-files install\n' };
      }
      return {
        stdout:
          'Name Command Args Env Cwd Status Auth\nnode_repl /path - - - enabled Unsupported\n',
      };
    });

    const result = await getConvexAgentReadinessInfo(
      { irPath: join(appDir, 'todo.contexture.json') },
      { execFile },
    );

    expect(result.convexAiFiles.status).toBe('not_ready');
    expect(result.contextureMcp.status).toBe('not_ready');
  });

  it('reports Codex configuration failures when probing Contexture MCP', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contexture-convex-'));
    const appDir = join(dir, 'apps/todo');
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, 'package.json'), JSON.stringify({}), 'utf8');
    const execFile = vi.fn<ExecFileLike>(async (file) => {
      if (file === 'bunx') {
        return {
          stdout: `Convex AI files: enabled
  ✔ Agent skills: installed, up to date
`,
        };
      }
      const err = new Error('Command failed: codex mcp list') as Error & { stderr: string };
      err.stderr = `Error: failed to load configuration

Caused by:
    0: /Users/rufus/.codex/config.toml:7:16: unknown variant \`priority\`, expected \`fast\` or \`flex\`
    1: unknown variant \`priority\`, expected \`fast\` or \`flex\`
       in \`service_tier\`
`;
      throw err;
    });

    const result = await getConvexAgentReadinessInfo(
      { irPath: join(appDir, 'todo.contexture.json') },
      { execFile },
    );

    expect(result.contextureMcp.status).toBe('probe_failed');
    expect(result.contextureMcp.message).toContain('Codex could not load its configuration');
    expect(result.contextureMcp.message).toContain('/Users/rufus/.codex/config.toml:7:16');
    expect(result.contextureMcp.message).toContain('service_tier');
  });
});
