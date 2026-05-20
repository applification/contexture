const { spawnSync } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');

const appDir = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(appDir, '../..');
const outDir = path.join(appDir, 'build', 'bin');
const executableName = process.platform === 'win32' ? 'contexture-mcp.exe' : 'contexture-mcp';
const outFile = path.join(outDir, executableName);
const entrypoint = path.join(workspaceRoot, 'packages', 'cli', 'src', 'mcp.ts');

mkdirSync(outDir, { recursive: true });

const result = spawnSync('bun', ['build', '--compile', '--outfile', outFile, entrypoint], {
  cwd: workspaceRoot,
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
