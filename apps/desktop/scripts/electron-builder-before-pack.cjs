const fs = require('node:fs');
const path = require('node:path');
const { buildMcpCli } = require('./build-mcp-cli.cjs');

function findWorkspaceRoot(startDir) {
  let current = startDir;

  while (true) {
    const packageJsonPath = path.join(current, 'package.json');

    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      if (packageJson.workspaces) {
        return current;
      }
    }

    const parent = path.dirname(current);

    if (parent === current) {
      throw new Error(`Could not find workspace root from ${startDir}`);
    }

    current = parent;
  }
}

function findResolvedPackage(startDir, packageName) {
  let packageEntry;

  try {
    packageEntry = require.resolve(packageName, { paths: [startDir] });
  } catch {
    return undefined;
  }

  let current = path.dirname(packageEntry);

  while (true) {
    const packageJsonPath = path.join(current, 'package.json');

    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      if (packageJson.name === packageName) {
        return current;
      }
    }

    const parent = path.dirname(current);

    if (parent === current) {
      throw new Error(`Could not find package root for ${packageName} from ${packageEntry}`);
    }

    current = parent;
  }
}

function findInstalledPackage(workspaceRoot, packageName, range) {
  const bunStoreDir = path.join(workspaceRoot, 'node_modules', '.bun');
  const packageDirName = packageName.replace('/', '+');

  for (const entry of fs.readdirSync(bunStoreDir)) {
    if (!entry.startsWith(`${packageDirName}@`)) {
      continue;
    }

    const packageDir = path.join(bunStoreDir, entry, 'node_modules', packageName);
    const packageJsonPath = path.join(packageDir, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      continue;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    if (packageJson.version === range || range === '*' || range === packageJson.version) {
      return packageDir;
    }
  }

  throw new Error(`Could not find ${packageName}@${range} in ${bunStoreDir}`);
}

function readPackageJson(packageDir) {
  return JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
}

function createBeforePack(options = {}) {
  const buildPackagedMcpCli = options.buildMcpCli ?? buildMcpCli;

  return async function beforePack(context) {
    buildPackagedMcpCli();

    const appDir = context.packager.projectDir;
    const workspaceRoot = findWorkspaceRoot(appDir);
    const claudeAgentSdkDir = fs.realpathSync(
      path.join(appDir, 'node_modules', '@anthropic-ai', 'claude-agent-sdk'),
    );
    const claudeAgentSdkPackageJsonPath = path.join(claudeAgentSdkDir, 'package.json');
    const claudeAgentSdkPackageJson = JSON.parse(
      fs.readFileSync(claudeAgentSdkPackageJsonPath, 'utf8'),
    );
    const sdkRange = claudeAgentSdkPackageJson.dependencies?.['@anthropic-ai/sdk'];

    if (!sdkRange) {
      return;
    }

    const sdkDir = fs.realpathSync(
      findResolvedPackage(appDir, '@anthropic-ai/sdk') ??
        findInstalledPackage(workspaceRoot, '@anthropic-ai/sdk', sdkRange),
    );
    const sdkPackageJson = readPackageJson(sdkDir);
    const linkDir = path.join(claudeAgentSdkDir, 'node_modules', '@anthropic-ai');
    const linkPath = path.join(linkDir, 'sdk');

    claudeAgentSdkPackageJson.dependencies['@anthropic-ai/sdk'] = sdkPackageJson.version;
    fs.writeFileSync(
      claudeAgentSdkPackageJsonPath,
      `${JSON.stringify(claudeAgentSdkPackageJson, null, 2)}\n`,
    );

    fs.mkdirSync(linkDir, { recursive: true });

    if (fs.existsSync(linkPath)) {
      return;
    }

    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    const linkTarget = linkType === 'junction' ? sdkDir : path.relative(linkDir, sdkDir);

    fs.symlinkSync(linkTarget, linkPath, linkType);
  };
}

exports.createBeforePack = createBeforePack;
exports.default = createBeforePack();
