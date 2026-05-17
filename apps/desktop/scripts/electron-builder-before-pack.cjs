const fs = require('node:fs');
const path = require('node:path');

function parseVersion(version) {
  return version.split('.').map((part) => Number.parseInt(part, 10));
}

function satisfiesCaretZero(version, range) {
  if (!range.startsWith('^0.')) {
    return version === range || range === '*' || range === version;
  }

  const [major, minor, patch] = parseVersion(range.slice(1));
  const [candidateMajor, candidateMinor, candidatePatch] = parseVersion(version);

  if (candidateMajor !== major || candidateMinor !== minor) {
    return false;
  }

  return candidatePatch >= patch;
}

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

    if (satisfiesCaretZero(packageJson.version, range)) {
      return packageDir;
    }
  }

  throw new Error(`Could not find ${packageName}@${range} in ${bunStoreDir}`);
}

exports.default = async function beforePack(context) {
  const appDir = context.packager.projectDir;
  const workspaceRoot = findWorkspaceRoot(appDir);
  const claudeAgentSdkDir = fs.realpathSync(
    path.join(appDir, 'node_modules', '@anthropic-ai', 'claude-agent-sdk'),
  );
  const claudeAgentSdkPackageJson = JSON.parse(
    fs.readFileSync(path.join(claudeAgentSdkDir, 'package.json'), 'utf8'),
  );
  const sdkRange = claudeAgentSdkPackageJson.dependencies?.['@anthropic-ai/sdk'];

  if (!sdkRange) {
    return;
  }

  const sdkDir = findInstalledPackage(workspaceRoot, '@anthropic-ai/sdk', sdkRange);
  const linkDir = path.join(claudeAgentSdkDir, 'node_modules', '@anthropic-ai');
  const linkPath = path.join(linkDir, 'sdk');

  fs.mkdirSync(linkDir, { recursive: true });

  if (fs.existsSync(linkPath)) {
    return;
  }

  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  const linkTarget = linkType === 'junction' ? sdkDir : path.relative(linkDir, sdkDir);

  fs.symlinkSync(linkTarget, linkPath, linkType);
};
