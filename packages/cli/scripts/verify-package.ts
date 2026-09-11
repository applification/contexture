// Standalone Node 24 consumer test. CI copies only this file and the packed artifact.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, realpathSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

assert.equal(process.versions.node.split('.')[0], '24', 'Test the declared Node 24 baseline');
const artifactDirectory = resolve(process.argv[2] ?? 'packages/cli/dist/release');
const version = (await readFile(join(artifactDirectory, 'version.txt'), 'utf8')).trim();
const source = process.argv[4] ?? 'registry';
assert.ok(
  ['tarball', 'registry', 'npm'].includes(source),
  'Source must be tarball, registry or npm',
);
const manifest = JSON.parse(
  await readFile(join(artifactDirectory, 'package-manifest.json'), 'utf8'),
);
const filename = `contexture-cli-${version}.tgz`;
const tarball = await readFile(join(artifactDirectory, filename));
const checksum = await readFile(join(artifactDirectory, `${filename}.sha256`), 'utf8');
assert.equal(checksum, `${createHash('sha256').update(tarball).digest('hex')}  ${filename}\n`);

function executable(name: string): string {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = join(directory, process.platform === 'win32' ? `${name}.cmd` : name);
    if (existsSync(candidate)) return realpathSync(candidate);
    if (process.platform === 'win32' && existsSync(join(directory, `${name}.exe`))) {
      return join(directory, `${name}.exe`);
    }
  }
  throw new Error(`Required test tool missing: ${name}`);
}

const git = executable('git');
const pnpmExecutable = process.argv[3] ? resolve(process.argv[3]) : executable('pnpm');
const pnpm = pnpmExecutable.endsWith('.cmd')
  ? join(dirname(pnpmExecutable), 'node_modules/pnpm/bin/pnpm.cjs')
  : pnpmExecutable;
const temporary = realpathSync(await mkdtemp(join(tmpdir(), 'contexture-package-')));
const toolsDirectory = join(temporary, 'tools');
await mkdir(toolsDirectory);
const node = join(toolsDirectory, process.platform === 'win32' ? 'node.exe' : 'node');
await copyFile(process.execPath, node);
const systemPaths =
  process.platform === 'win32'
    ? [join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')]
    : ['/usr/bin', '/bin'];
const environment: NodeJS.ProcessEnv = {
  ...process.env,
  PATH: [toolsDirectory, ...systemPaths].join(delimiter),
  NODE_PATH: '',
  NODE_OPTIONS: '',
  CI: 'true',
  npm_config_update_notifier: 'false',
  npm_config_manage_package_manager_versions: 'false',
};
// Windows environment variable keys are case-insensitive; retain a single PATH key.
for (const key of Object.keys(environment)) {
  if (key !== 'PATH' && key.toUpperCase() === 'PATH') delete environment[key];
}

async function run(command: string, args: string[], cwd: string, expected = 0, production = false) {
  const child = spawn(command, args, {
    cwd,
    env: { ...environment, ...(production ? { NODE_ENV: 'production' } : {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk;
  });
  const [code] = await once(child, 'close');
  assert.equal(code, expected, `${command} ${args.join(' ')}\n${stdout}\n${stderr}`);
  return { stdout, stderr };
}

async function cli(cwd: string, args: string[], expected = 0) {
  // pnpm exec tests the installed bin mapping, including Windows command shims.
  const result = await run(node, [pnpm, 'exec', 'contexture', ...args], cwd, expected);
  assert.equal(result.stderr, '');
  return result.stdout;
}

interface RpcResult {
  serverInfo?: { version: string };
  tools?: { name: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

async function verifyMcp(cwd: string, irPath: string) {
  const child = spawn(node, [join(cwd, 'node_modules/@applification/contexture/dist/mcp.js')], {
    cwd,
    env: environment,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const closed = once(child, 'close');
  const replies = new Map<number, (result: RpcResult) => void>();
  const failures: string[] = [];
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk;
  });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    try {
      const message = JSON.parse(line);
      assert.equal(message.jsonrpc, '2.0');
      assert.equal(message.error, undefined);
      if (typeof message.id === 'number') {
        assert.ok(replies.has(message.id));
        replies.get(message.id)?.(message.result);
        replies.delete(message.id);
      }
    } catch (error) {
      failures.push(String(error));
    }
  });
  let id = 0;
  async function request(method: string, params: object): Promise<RpcResult> {
    id += 1;
    const requestId = id;
    return new Promise((resolveReply, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`MCP ${method} timed out: ${failures}; ${stderr}`)),
        15_000,
      );
      replies.set(requestId, (result) => {
        clearTimeout(timeout);
        resolveReply(result);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params })}\n`);
    });
  }
  try {
    const initialized = await request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'packed-consumer-test', version: '1.0.0' },
    });
    assert.equal(initialized.serverInfo?.version, version);
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
    );
    const discovered = await request('tools/list', {});
    for (const name of ['inspect_contexture', 'validate_contexture', 'check_contexture_drift']) {
      assert.ok(
        discovered.tools?.some((tool) => tool.name === name),
        `Missing MCP tool ${name}`,
      );
      const result = await request('tools/call', { name, arguments: { irPath } });
      assert.notEqual(result.isError, true);
      assert.equal(result.structuredContent?.path, irPath.replaceAll('\\', '/'));
      if (name === 'inspect_contexture') assert.equal(result.structuredContent?.typeCount, 1);
      if (name === 'validate_contexture') {
        assert.equal(result.structuredContent?.valid, true);
        assert.deepEqual(result.structuredContent?.mcp, { version });
      }
      if (name === 'check_contexture_drift') assert.equal(result.structuredContent?.clean, true);
    }
    child.stdin.end();
    const exit = await Promise.race([
      closed,
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('MCP did not stop on stdin EOF')), 5_000);
        timer.unref();
      }),
    ]);
    assert.deepEqual(exit, [0, null]);
    assert.deepEqual(failures, [], 'MCP stdout must contain only valid protocol messages');
    assert.equal(stderr, '');
  } finally {
    lines.close();
    if (child.exitCode === null) {
      child.kill();
      await closed;
    }
  }
}

const server = createServer((request, response) => {
  if (decodeURIComponent(request.url ?? '') === '/@applification/contexture') {
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        name: manifest.name,
        'dist-tags': { latest: version },
        versions: {
          [version]: {
            ...manifest,
            dist: {
              tarball: url,
              integrity: `sha512-${createHash('sha512').update(tarball).digest('base64')}`,
            },
          },
        },
      }),
    );
    return;
  }
  if (request.url !== `/releases/download/v${version}/${filename}`) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end(tarball);
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert.ok(address && typeof address !== 'string');
const url = `http://127.0.0.1:${address.port}/releases/download/v${version}/${filename}`;
const consumer = join(temporary, 'consumer with spaces');

try {
  await mkdir(consumer);
  const availableBun = await run(
    node,
    [
      '-e',
      'const {spawnSync}=require("node:child_process"); if(spawnSync("bun",["--version"]).error?.code!=="ENOENT") process.exit(1)',
    ],
    consumer,
  );
  assert.equal(availableBun.stdout, '');
  await writeFile(
    join(consumer, 'package.json'),
    `${JSON.stringify({ name: 'packed-cli-consumer', private: true })}\n`,
  );
  await writeFile(
    join(consumer, '.npmrc'),
    `@applification:registry=${source === 'registry' ? `http://127.0.0.1:${address.port}/` : 'https://registry.npmjs.org/'}\n`,
  );
  await run(
    node,
    [
      pnpm,
      'add',
      '-D',
      '--save-exact',
      `@applification/contexture@${source === 'tarball' ? url : version}`,
      '--ignore-scripts',
      '--store-dir',
      join(temporary, 'first-store'),
    ],
    consumer,
  );
  const installed = JSON.parse(
    await readFile(join(consumer, 'node_modules/@applification/contexture/package.json'), 'utf8'),
  );
  assert.equal(installed.version, version);
  assert.notEqual(installed.private, true);
  assert.equal(installed.publishConfig.access, 'public');
  const consumerManifest = JSON.parse(await readFile(join(consumer, 'package.json'), 'utf8'));
  assert.equal(
    consumerManifest.devDependencies[manifest.name],
    source === 'tarball' ? url : version,
  );
  assert.equal(installed.scripts, undefined);
  assert.equal(installed.engines.node, '>=24 <25');
  assert.ok(
    Object.entries(installed.dependencies).every(
      ([name, spec]) => !name.startsWith('@contexture/') && !String(spec).includes('workspace:'),
    ),
  );
  assert.match(await cli(consumer, ['--help']), /contexture <command>/);
  assert.equal((await cli(consumer, ['--version'])).trim(), version);
  assert.deepEqual(JSON.parse(await cli(consumer, ['--version', '--json'])), { ok: true, version });
  assert.equal(
    (await run(node, [pnpm, 'exec', 'contexture-mcp', '--version'], consumer)).stdout.trim(),
    version,
  );
  const missingConvex = JSON.parse(await cli(consumer, ['convex-capabilities', '--json'], 1));
  assert.equal(missingConvex.ok, false);
  assert.match(missingConvex.error.message, /Install convex/);

  const bundle = join(consumer, 'packages/contexture');
  await mkdir(bundle, { recursive: true });
  const irPath = join(bundle, 'app.contexture.json');
  const schema = {
    version: '1',
    types: [
      {
        kind: 'object',
        name: 'Grower',
        table: true,
        fields: [{ name: 'email', type: { kind: 'ref', typeName: 'common.Email' } }],
      },
    ],
  };
  await writeFile(irPath, `${JSON.stringify(schema)}\n`);
  assert.equal(JSON.parse(await cli(consumer, ['inspect', '--json'])).types[0].name, 'Grower');
  assert.equal(JSON.parse(await cli(consumer, ['validate', '--json'])).valid, true);
  assert.equal(JSON.parse(await cli(consumer, ['check-generated', '--json'], 1)).ok, false);
  assert.equal(JSON.parse(await cli(consumer, ['emit', '--json'])).ok, true);
  const generated = JSON.parse(await cli(consumer, ['check-generated', '--json']));
  assert.equal(generated.ok, true);
  const stdlibFiles = generated.files.filter((file: { path: string }) => /common/.test(file.path));
  assert.ok(stdlibFiles.length > 0, 'Standard-library runtime must be materialized');
  await verifyMcp(consumer, irPath);
  const convexSchema = join(bundle, 'convex/schema.ts');
  await writeFile(convexSchema, `${await readFile(convexSchema, 'utf8')}\n// consumer edit\n`);
  const drift = JSON.parse(await cli(consumer, ['check-generated', '--json'], 1));
  assert.ok(
    drift.drift.some(
      (file: { path: string; status: string }) =>
        file.path === convexSchema.replaceAll('\\', '/') && file.status === 'drifted',
    ),
  );
  await cli(consumer, ['emit', '--json']);
  await writeFile(irPath, '{"version":"1","types":[{"name":""}]}\n');
  assert.equal(JSON.parse(await cli(consumer, ['validate', '--json'], 1)).ok, false);
  await writeFile(
    irPath,
    JSON.stringify({
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Broken',
          fields: [{ name: 'ref', type: { kind: 'ref', typeName: 'Missing' } }],
        },
      ],
    }),
  );
  assert.equal(
    JSON.parse(await cli(consumer, ['validate', '--json'], 1)).errors[0].code,
    'unresolved_ref',
  );
  await writeFile(irPath, `${JSON.stringify(schema)}\n`);

  // Intentionally different from Contexture's pinned development Convex version.
  const consumerConvexVersion = '1.31.7';
  await run(
    node,
    [
      pnpm,
      'add',
      '-D',
      `convex@${consumerConvexVersion}`,
      '--save-exact',
      '--ignore-scripts',
      '--store-dir',
      join(temporary, 'first-store'),
    ],
    consumer,
  );
  const capabilities = JSON.parse(await cli(consumer, ['convex-capabilities', '--json'])).manifest;
  assert.equal(capabilities.packageVersion, consumerConvexVersion);
  assert.match(
    capabilities.cliVersion,
    new RegExp(`\\b${consumerConvexVersion.replaceAll('.', '\\.')}\\b`),
  );
  assert.ok(capabilities.validators.includes('string'));
  assert.ok(capabilities.serverExports.includes('defineSchema'));
  assert.ok(capabilities.cliCommands.includes('dev'));
  const nested = join(consumer, 'packages/app');
  await mkdir(nested);
  const nestedCapabilities = await run(
    node,
    [
      join(consumer, 'node_modules/@applification/contexture/dist/index.js'),
      'convex-capabilities',
      '--json',
    ],
    nested,
  );
  assert.equal(
    JSON.parse(nestedCapabilities.stdout).manifest.packageVersion,
    consumerConvexVersion,
  );

  await writeFile(join(consumer, '.gitignore'), 'node_modules\n');
  await writeFile(join(consumer, '.gitattributes'), '* text eol=lf\n');
  await run(git, ['init'], consumer);
  await run(git, ['add', '.'], consumer);
  await run(
    git,
    [
      '-c',
      'user.name=Artifact Test',
      '-c',
      'user.email=artifact@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-m',
      'test: lock release artifact',
    ],
    consumer,
  );
  const fresh = join(temporary, 'fresh consumer');
  await run(git, ['clone', '--no-hardlinks', consumer, fresh], temporary);
  const locked = await readFile(join(fresh, 'pnpm-lock.yaml'), 'utf8');
  if (source !== 'npm') assert.ok(locked.includes(url));
  assert.ok(
    locked.includes(`integrity: sha512-${createHash('sha512').update(tarball).digest('base64')}`),
  );
  await run(
    node,
    [
      pnpm,
      'install',
      '--frozen-lockfile',
      '--ignore-scripts',
      '--prod=false',
      '--store-dir',
      join(temporary, 'fresh-store'),
    ],
    fresh,
    0,
    true,
  );
  assert.equal(await readFile(join(fresh, 'pnpm-lock.yaml'), 'utf8'), locked);
  assert.equal((await cli(fresh, ['--version'])).trim(), version);
  assert.equal(JSON.parse(await cli(fresh, ['check-generated', '--json'])).ok, true);
  await verifyMcp(fresh, join(fresh, 'packages/contexture/app.contexture.json'));
  console.log(
    `Verified ${filename} on ${process.platform}/${process.arch}, Node ${process.versions.node}: scripts-disabled ${source} install, CLI, bundled stdlib, drift failures, MCP, consumer Convex ${consumerConvexVersion}, committed frozen lockfile and production build install.`,
  );
} catch (error) {
  // Report the behavior failure even if a Windows file lock also prevents cleanup.
  process.exitCode = 1;
  console.error(error);
} finally {
  server.closeAllConnections();
  server.close();
  await rm(temporary, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}
