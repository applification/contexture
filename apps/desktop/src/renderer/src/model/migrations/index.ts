/**
 * IR migration chain.
 *
 * Registered migrations transform older `.contexture.json` shapes up to the
 * current IR version before the Zod meta-schema runs. Each migration declares
 * its source (`from`) and target (`to`) version strings; the loader walks the
 * chain, applying each in registration order, and emits a warning per step so
 * the UI can inform the user that an upgrade occurred.
 *
 * v1 is the current IR and has no prior versions — this module is the
 * scaffold so future bumps slot in cleanly. Register new migrations by
 * appending to `migrations` below.
 */

export interface Migration {
  /** Source version this migration consumes. */
  from: string;
  /** Target version this migration produces. */
  to: string;
  /** Structural transform from `from` to `to`. */
  migrate: (input: unknown) => unknown;
  /** Optional warning surfaced to the user after this step runs. */
  warning?: string;
}

/** The current IR version. Keep in sync with `IRSchema` (`./ir-schema.ts`). */
export const CURRENT_VERSION = '1';

/**
 * Ordered migration chain. Empty at v1; future versions append here.
 */
export const migrations: readonly Migration[] = [];

export interface MigrationResult {
  /** The IR after all applicable migrations ran. */
  ir: unknown;
  /** Warning messages, one per migration step that fired. */
  warnings: string[];
}

/**
 * Walks the migration chain from the input's version up to `CURRENT_VERSION`.
 * Throws if the input version is unknown and no migration path exists.
 */
export function runMigrations(
  rawIR: unknown,
  chain: readonly Migration[] = migrations,
): MigrationResult {
  const version = extractVersion(rawIR);
  if (version === CURRENT_VERSION) return { ir: rawIR, warnings: [] };

  const warnings: string[] = [];
  let current = rawIR;
  let currentVersion = version;

  while (currentVersion !== CURRENT_VERSION) {
    const step = chain.find((m) => m.from === currentVersion);
    if (!step) {
      throw new Error(
        `Unknown IR version "${currentVersion}" (current is "${CURRENT_VERSION}"). ` +
          'No migration registered for this version.',
      );
    }
    current = step.migrate(current);
    currentVersion = step.to;
    if (step.warning) warnings.push(step.warning);
  }

  return { ir: current, warnings };
}

function extractVersion(input: unknown): string {
  if (input && typeof input === 'object' && 'version' in input) {
    const v = (input as { version: unknown }).version;
    if (typeof v === 'string') return v;
  }
  // Missing or non-string version → let IRSchema report it with a proper path.
  return CURRENT_VERSION;
}
