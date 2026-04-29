import { emit } from '@renderer/model/emit-claude-md';
import { describe, expect, it } from 'vitest';

describe('emit (CLAUDE.md)', () => {
  it('substitutes {{PROJECT_NAME}} with the given name', () => {
    const out = emit('my-blog');
    expect(out).toContain('my-blog');
    expect(out).not.toContain('{{PROJECT_NAME}}');
  });

  it('tells coding agents the schema source-of-truth rule', () => {
    const out = emit('my-blog');
    expect(out).toMatch(/source of truth/i);
    expect(out).toMatch(/packages\/contexture\/my-blog\.contexture\.json/);
  });

  it('warns against editing the generated Convex schema directly', () => {
    const out = emit('my-blog');
    expect(out).toMatch(/packages\/contexture\/convex\/schema\.ts/);
    expect(out).toMatch(/do not edit|regenerat/i);
  });

  it('names the workspace package as @{{PROJECT_NAME}}/contexture', () => {
    const out = emit('my-blog');
    expect(out).toContain('@my-blog/contexture');
  });

  it('mentions the .contexture/ internal directory as off-limits', () => {
    const out = emit('my-blog');
    expect(out).toContain('.contexture/');
  });

  it('does not start with a @contexture-generated banner — CLAUDE.md is user-owned', () => {
    const out = emit('my-blog');
    expect(out.split('\n', 1)[0]).not.toMatch(/@contexture-generated/);
  });
});
