import { emit } from '@contexture/core/emit-claude-md';
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
    expect(out).toMatch(/my-blog\.contexture\.json/);
  });

  it('warns against editing generated files directly', () => {
    const out = emit('my-blog');
    expect(out).toMatch(/Do not edit generated files directly/i);
    expect(out).toMatch(/drift\/reconcile/i);
  });

  it('tells agents to inspect the existing repo instead of assuming a framework', () => {
    const out = emit('my-blog');
    expect(out).toMatch(/Inspect the existing repo/i);
    expect(out).toMatch(/actual framework/i);
  });

  it('mentions MCP as the safe agent integration surface', () => {
    const out = emit('my-blog');
    expect(out).toMatch(/MCP server/i);
  });

  it('does not start with a @contexture-generated banner — CLAUDE.md is user-owned', () => {
    const out = emit('my-blog');
    expect(out.split('\n', 1)[0]).not.toMatch(/@contexture-generated/);
  });
});
