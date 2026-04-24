/**
 * Scaffolder pre-flight checks (stage 0). Runs before any shell
 * command; each check returns a specific, tagged error so the UI can
 * render a directly actionable message ("install Bun", "pick another
 * folder", "no network"). Deps are injected so the checks are
 * unit-testable without shelling out or hitting the network.
 */

const REGISTRY_URL = 'https://registry.npmjs.org';
const MIN_FREE_BYTES = 500 * 1024 * 1024;

export interface PreflightConfig {
  targetDir: string;
}

export interface PreflightDeps {
  /** Run a short command and return stdout + exit code. */
  runCommand: (cmd: string) => Promise<{ stdout: string; code: number }>;
  headOk: (url: string) => Promise<boolean>;
  parentDirWritable: (path: string) => Promise<boolean>;
  targetDirExists: (path: string) => Promise<boolean>;
  freeBytes: (path: string) => Promise<number>;
}

export type PreflightError =
  | { kind: 'missing-bun' }
  | { kind: 'missing-git' }
  | { kind: 'missing-node' }
  | { kind: 'no-network' }
  | { kind: 'parent-not-writable'; path: string }
  | { kind: 'target-exists'; path: string }
  | { kind: 'insufficient-space'; bytesFree: number };

export type PreflightResult = { ok: true } | { ok: false; error: PreflightError };

function parentDirOf(path: string): string {
  const slash = path.lastIndexOf('/');
  if (slash <= 0) return '/';
  return path.slice(0, slash);
}

export async function runPreflight(
  config: PreflightConfig,
  deps: PreflightDeps,
): Promise<PreflightResult> {
  if ((await deps.runCommand('bun --version')).code !== 0)
    return { ok: false, error: { kind: 'missing-bun' } };
  if ((await deps.runCommand('git --version')).code !== 0)
    return { ok: false, error: { kind: 'missing-git' } };
  if ((await deps.runCommand('node --version')).code !== 0)
    return { ok: false, error: { kind: 'missing-node' } };
  if (!(await deps.headOk(REGISTRY_URL))) return { ok: false, error: { kind: 'no-network' } };

  const parent = parentDirOf(config.targetDir);
  if (!(await deps.parentDirWritable(parent)))
    return { ok: false, error: { kind: 'parent-not-writable', path: parent } };
  if (await deps.targetDirExists(config.targetDir))
    return { ok: false, error: { kind: 'target-exists', path: config.targetDir } };

  const bytes = await deps.freeBytes(parent);
  if (bytes < MIN_FREE_BYTES)
    return { ok: false, error: { kind: 'insufficient-space', bytesFree: bytes } };

  return { ok: true };
}
