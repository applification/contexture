const { spawnSync } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');

function buildMcpCli(options = {}) {
  const appDir = options.appDir ?? path.resolve(__dirname, '..');
  const workspaceRoot = options.workspaceRoot ?? path.resolve(appDir, '../..');
  const outDir = path.join(appDir, 'build', 'bin');
  const executableName =
    (options.platform ?? process.platform) === 'win32' ? 'contexture-mcp.exe' : 'contexture-mcp';
  const outFile = path.join(outDir, executableName);
  const entrypoint = path.join(workspaceRoot, 'packages', 'cli', 'src', 'mcp.ts');
  const mkdir = options.mkdirSync ?? mkdirSync;
  const spawn = options.spawnSync ?? spawnSync;

  mkdir(outDir, { recursive: true });

  const result = spawn('bun', ['build', '--compile', '--outfile', outFile, entrypoint], {
    cwd: workspaceRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Failed to build contexture-mcp: bun exited with status ${result.status ?? 1}`);
  }
}

if (require.main === module) {
  try {
    buildMcpCli();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

module.exports = { buildMcpCli };
