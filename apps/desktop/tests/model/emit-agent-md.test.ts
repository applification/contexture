import { emit } from '@contexture/core/emit-agent-md';
import { describe, expect, it } from 'vitest';

describe('emit (AGENTS.md)', () => {
  it('substitutes {{PROJECT_NAME}} with the given name', () => {
    const out = emit('my-blog');
    expect(out).toContain('my-blog');
    expect(out).not.toContain('{{PROJECT_NAME}}');
  });

  it('tells coding agents the schema source-of-truth rule', () => {
    const out = emit('my-blog');
    expect(out).toMatch(/source of truth/i);
    expect(out).toMatch(/my-blog\.contexture\.json/);
  });

  it('does not start with a @contexture-generated banner; AGENTS.md is user-owned', () => {
    const out = emit('my-blog');
    expect(out.split('\n', 1)[0]).not.toMatch(/@contexture-generated/);
  });
});
