/**
 * `validateProjectName` — the rules the New Project dialog enforces on
 * the project-name input. Kept as a pure helper so the dialog component
 * stays dumb and the regression surface lives here.
 *
 * Kebab-case is the house style because it becomes the npm package name
 * (`@<name>/schema`), the monorepo directory, and the Convex project
 * slug — all three require the lowercase-letters-digits-hyphen shape.
 */
import { validateProjectName } from '@renderer/model/validate-project-name';
import { describe, expect, it } from 'vitest';

describe('validateProjectName', () => {
  it('accepts a simple kebab-case name', () => {
    expect(validateProjectName('my-proj')).toEqual({ ok: true });
  });

  it('accepts a single lowercase word', () => {
    expect(validateProjectName('app')).toEqual({ ok: true });
  });

  it('rejects an empty string', () => {
    const result = validateProjectName('');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/empty/i);
  });

  it('rejects whitespace-only input', () => {
    const result = validateProjectName('   ');
    expect(result.ok).toBe(false);
  });

  it('rejects uppercase letters', () => {
    const result = validateProjectName('MyProj');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/lowercase/i);
  });

  it('rejects underscores', () => {
    const result = validateProjectName('my_proj');
    expect(result.ok).toBe(false);
  });

  it('rejects leading hyphen', () => {
    expect(validateProjectName('-proj').ok).toBe(false);
  });

  it('rejects trailing hyphen', () => {
    expect(validateProjectName('proj-').ok).toBe(false);
  });

  it('rejects double hyphens', () => {
    expect(validateProjectName('my--proj').ok).toBe(false);
  });

  it('rejects names starting with a digit (npm requires a letter first)', () => {
    expect(validateProjectName('1-proj').ok).toBe(false);
  });

  it('accepts digits after the first character', () => {
    expect(validateProjectName('proj-v2').ok).toBe(true);
  });

  it('rejects names longer than 214 chars (npm package name limit)', () => {
    const long = `a${'-x'.repeat(120)}`;
    expect(long.length).toBeGreaterThan(214);
    expect(validateProjectName(long).ok).toBe(false);
  });
});
