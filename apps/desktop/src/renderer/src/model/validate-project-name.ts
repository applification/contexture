/**
 * `validateProjectName` — enforces the name shape the scaffolder needs.
 *
 * The project name becomes all of: the monorepo directory, the npm
 * scope in `@<name>/schema`, and the Convex project slug passed to
 * `convex dev --project`. Intersecting those three rulesets gives us
 * kebab-case, must-start-with-letter, and the npm 214-char cap.
 */

export type ValidationResult = { ok: true } | { ok: false; reason: string };

const MAX_LEN = 214;
const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function validateProjectName(raw: string): ValidationResult {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, reason: 'Name cannot be empty.' };
  if (name.length > MAX_LEN) {
    return { ok: false, reason: `Name must be ${MAX_LEN} characters or fewer.` };
  }
  if (!KEBAB_CASE.test(name)) {
    if (/[A-Z]/.test(name)) {
      return { ok: false, reason: 'Name must be lowercase.' };
    }
    return {
      ok: false,
      reason: 'Name must be kebab-case (letters, digits, single hyphens; letter first).',
    };
  }
  return { ok: true };
}
