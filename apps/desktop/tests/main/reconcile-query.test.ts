import {
  buildReconcileSystemPrompt,
  buildReconcileUserTurn,
  extractOpsArray,
  RECONCILE_MODEL,
} from '@main/ipc/reconcile-query';
import { describe, expect, it } from 'vitest';

describe('RECONCILE_MODEL', () => {
  it('is claude-haiku-4-5-20251001 for fast reconcile queries', () => {
    expect(RECONCILE_MODEL).toBe('claude-haiku-4-5-20251001');
  });
});

describe('extractOpsArray', () => {
  it('parses a bare JSON array', () => {
    const result = extractOpsArray('[{"op":{"kind":"add_type"},"label":"Add Post","lossy":false}]');
    expect(result).toEqual({
      ok: true,
      ops: [{ op: { kind: 'add_type' }, label: 'Add Post', lossy: false }],
    });
  });

  it('extracts array embedded in prose', () => {
    const result = extractOpsArray('Here are the ops:\n[{"op":{},"label":"x","lossy":true}]');
    expect(result.ok).toBe(true);
  });

  it('extracts array when prose before it contains square brackets', () => {
    const result = extractOpsArray(
      'See op list [below]:\n[{"op":{"kind":"add_type"},"label":"Add Post","lossy":false}]',
    );
    expect(result).toEqual({
      ok: true,
      ops: [{ op: { kind: 'add_type' }, label: 'Add Post', lossy: false }],
    });
  });

  it('returns ok:false when no array bracket found', () => {
    const result = extractOpsArray('no ops here');
    expect(result).toEqual({ ok: false, error: 'No JSON array found in response.' });
  });

  it('returns ok:false for malformed JSON', () => {
    const result = extractOpsArray('[{bad json}]');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to parse ops JSON/);
    }
  });

  it('handles empty array', () => {
    const result = extractOpsArray('[]');
    expect(result).toEqual({ ok: true, ops: [] });
  });
});

describe('buildReconcileSystemPrompt', () => {
  it('includes the op vocabulary', () => {
    const prompt = buildReconcileSystemPrompt('zod');
    expect(prompt).toContain('add_type');
    expect(prompt).toContain('add_field');
  });

  it('includes zod-specific kind description', () => {
    const prompt = buildReconcileSystemPrompt('zod');
    expect(prompt).toContain('Zod');
  });

  it('includes convex-specific kind description', () => {
    const prompt = buildReconcileSystemPrompt('convex');
    expect(prompt).toContain('Convex');
  });

  it('falls back gracefully for unknown target kinds', () => {
    const prompt = buildReconcileSystemPrompt('unknown-kind');
    expect(prompt).toContain('hand-edited generated file');
  });

  it('instructs the model to return only a JSON array', () => {
    const prompt = buildReconcileSystemPrompt('zod');
    expect(prompt).toContain('Return ONLY a JSON array');
  });
});

describe('buildReconcileUserTurn', () => {
  it('wraps IR and on-disk source in XML tags', () => {
    const turn = buildReconcileUserTurn('{"types":[]}', 'const x = 1;', 'zod');
    expect(turn).toContain('<current_ir>');
    expect(turn).toContain('{"types":[]}');
    expect(turn).toContain('</current_ir>');
    expect(turn).toContain('<on_disk_source kind="zod">');
    expect(turn).toContain('const x = 1;');
  });
});
