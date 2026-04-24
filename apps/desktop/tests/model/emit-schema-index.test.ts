import { emit } from '@renderer/model/emit-schema-index';
import { describe, expect, it } from 'vitest';

describe('emit (schema index re-export)', () => {
  it('emits a @contexture-generated header', () => {
    const out = emit('blog');
    expect(out).toMatch(/^\/\/ @contexture-generated/);
  });

  it('re-exports the sibling schema module by base name', () => {
    const out = emit('blog');
    expect(out).toContain(`export * from './blog.schema';`);
  });

  it('works for other base names', () => {
    expect(emit('my-app')).toContain(`export * from './my-app.schema';`);
  });
});
