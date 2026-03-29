import { describe, it, expect } from 'vitest';
import { estimateTokenCount } from '@renderer/services/tokens';

describe('estimateTokenCount', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokenCount('')).toBe(0);
  });

  it('returns 0 for falsy input', () => {
    expect(estimateTokenCount(undefined as any)).toBe(0);
  });

  it('estimates tokens for short text', () => {
    const count = estimateTokenCount('Hello world');
    expect(count).toBeGreaterThan(0);
    expect(count).toBe(Math.ceil(11 / 3.5));
  });

  it('estimates tokens for longer text', () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    const count = estimateTokenCount(text);
    expect(count).toBe(Math.ceil(text.length / 3.5));
  });

  it('handles RDF/Turtle URIs', () => {
    const turtle = 'http://www.w3.org/2002/07/owl#Class';
    const count = estimateTokenCount(turtle);
    expect(count).toBeGreaterThan(0);
  });
});
