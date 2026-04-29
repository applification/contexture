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

  it('includes the IR source path in the banner when provided', () => {
    const out = emit('blog', '/proj/packages/contexture/blog.contexture.json');
    expect(out).toContain('Source: /proj/packages/contexture/blog.contexture.json');
  });

  it('omits source path from the banner when not provided', () => {
    const out = emit('blog');
    expect(out).not.toContain('Source:');
  });
});
