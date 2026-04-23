/**
 * Skills bundle — asserts the plugin directory has the shape the Agent
 * SDK's `{ type: 'local', path }` plugin loader expects, and that each
 * skill carries the YAML frontmatter the pivot plan specifies.
 *
 * Doesn't boot the SDK — the contract is "files in the right shape at
 * the right paths". Packaging (via `electron-builder`'s
 * `extraResources` entry) is verified by the build itself.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SKILLS_ROOT = join(__dirname, '..', '..', 'resources', 'skills');

function readSkill(name: string): { frontmatter: Record<string, string>; body: string } {
  const raw = readFileSync(join(SKILLS_ROOT, 'skills', `${name}.md`), 'utf8');
  const match = raw.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`no frontmatter in ${name}.md`);
  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { frontmatter, body: match[2] };
}

describe('skills bundle', () => {
  it('has a plugin manifest at .claude-plugin/plugin.json', () => {
    const raw = readFileSync(join(SKILLS_ROOT, '.claude-plugin', 'plugin.json'), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.name).toBe('contexture-skills');
    expect(typeof parsed.version).toBe('string');
  });

  it.each([
    'model-domain',
    'use-stdlib',
    'generate-sample',
  ] as const)('%s has name + description frontmatter', (name) => {
    const { frontmatter, body } = readSkill(name);
    expect(frontmatter.name).toBe(name);
    expect(frontmatter.description?.length ?? 0).toBeGreaterThan(0);
    expect(body.trim().length).toBeGreaterThan(0);
  });

  it('generate-sample carries an argument-hint', () => {
    const { frontmatter } = readSkill('generate-sample');
    expect(frontmatter['argument-hint']).toBe('<mode>');
  });
});
