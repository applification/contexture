import { emitConvexSchema } from '@renderer/model/emit-convex';
import type { Schema } from '@renderer/model/ir';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

function parses(source: string): boolean {
  const sf = ts.createSourceFile('schema.ts', source, ts.ScriptTarget.Latest, false);
  return (sf as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics.length === 0;
}

describe('emitConvexSchema', () => {
  it('emits the @contexture-generated banner and a defineSchema call for an empty IR', () => {
    const ir: Schema = { version: '1', types: [] };
    const out = emitConvexSchema(ir);
    expect(out).toContain('@contexture-generated');
    expect(out).toMatch(/defineSchema\s*\(/);
    expect(parses(out)).toBe(true);
  });

  it('emits a single table with v.* field validators', () => {
    const ir: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          table: true,
          fields: [
            { name: 'title', type: { kind: 'string' } },
            { name: 'views', type: { kind: 'number' } },
            { name: 'published', type: { kind: 'boolean' } },
            { name: 'createdAt', type: { kind: 'date' } },
            { name: 'kind', type: { kind: 'literal', value: 'post' } },
          ],
        },
      ],
    };
    const out = emitConvexSchema(ir);
    expect(out).toMatch(/Post:\s*defineTable\(\{/);
    expect(out).toContain('title: v.string()');
    expect(out).toContain('views: v.number()');
    expect(out).toContain('published: v.boolean()');
    expect(out).toContain('createdAt: v.number()');
    expect(out).toContain('kind: v.literal("post")');
    expect(parses(out)).toBe(true);
  });

  it('emits v.optional / v.union(..., v.null()) wrappers for optional and nullable fields', () => {
    const ir: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          table: true,
          fields: [
            { name: 'subtitle', type: { kind: 'string' }, optional: true },
            { name: 'summary', type: { kind: 'string' }, nullable: true },
            { name: 'both', type: { kind: 'string' }, optional: true, nullable: true },
          ],
        },
      ],
    };
    const out = emitConvexSchema(ir);
    expect(out).toContain('subtitle: v.optional(v.string())');
    expect(out).toContain('summary: v.union(v.string(), v.null())');
    expect(out).toContain('both: v.optional(v.union(v.string(), v.null()))');
  });

  it('emits v.array(...) for array fields', () => {
    const ir: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          table: true,
          fields: [{ name: 'tags', type: { kind: 'array', element: { kind: 'string' } } }],
        },
      ],
    };
    const out = emitConvexSchema(ir);
    expect(out).toContain('tags: v.array(v.string())');
  });

  it('emits v.id("Target") for refs to other table-flagged types', () => {
    const ir: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: 'Author', table: true, fields: [] },
        {
          kind: 'object',
          name: 'Post',
          table: true,
          fields: [{ name: 'author', type: { kind: 'ref', typeName: 'Author' } }],
        },
      ],
    };
    const out = emitConvexSchema(ir);
    expect(out).toContain('author: v.id("Author")');
    expect(parses(out)).toBe(true);
  });

  it('inlines non-table object types referenced from tables as v.object(...)', () => {
    const ir: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Address',
          fields: [
            { name: 'city', type: { kind: 'string' } },
            { name: 'zip', type: { kind: 'string' } },
          ],
        },
        {
          kind: 'object',
          name: 'User',
          table: true,
          fields: [{ name: 'home', type: { kind: 'ref', typeName: 'Address' } }],
        },
      ],
    };
    const out = emitConvexSchema(ir);
    expect(out).toMatch(
      /home:\s*v\.object\(\{\s*city:\s*v\.string\(\),\s*zip:\s*v\.string\(\)\s*\}\)/,
    );
    // Only User should be a defineTable entry.
    expect(out).not.toMatch(/Address:\s*defineTable/);
    expect(parses(out)).toBe(true);
  });

  it('emits .index("name", [...]) chained on defineTable', () => {
    const ir: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          table: true,
          fields: [
            { name: 'author', type: { kind: 'string' } },
            { name: 'publishedAt', type: { kind: 'date' } },
          ],
          indexes: [
            { name: 'by_author', fields: ['author'] },
            { name: 'by_author_and_date', fields: ['author', 'publishedAt'] },
          ],
        },
      ],
    };
    const out = emitConvexSchema(ir);
    expect(out).toContain('.index("by_author", ["author"])');
    expect(out).toContain('.index("by_author_and_date", ["author", "publishedAt"])');
    expect(parses(out)).toBe(true);
  });

  it('throws when a table name starts with "_"', () => {
    const ir: Schema = {
      version: '1',
      types: [{ kind: 'object', name: '_Post', table: true, fields: [] }],
    };
    expect(() => emitConvexSchema(ir)).toThrow(/_Post.*reserves/);
  });

  it('throws when a field name starts with "_"', () => {
    const ir: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          table: true,
          fields: [{ name: '_id', type: { kind: 'string' } }],
        },
      ],
    };
    expect(() => emitConvexSchema(ir)).toThrow(/_id.*reserves/);
  });

  it('includes the IR source path in the banner when provided', () => {
    const ir: Schema = { version: '1', types: [] };
    const out = emitConvexSchema(ir, '/proj/packages/contexture/app.contexture.json');
    expect(out).toContain('Source: /proj/packages/contexture/app.contexture.json');
  });

  it('omits source path from the banner when not provided', () => {
    const ir: Schema = { version: '1', types: [] };
    const out = emitConvexSchema(ir);
    expect(out).not.toContain('Source:');
  });

  it('does not flag `_`-prefix on non-table object types', () => {
    const ir: Schema = {
      version: '1',
      types: [
        { kind: 'object', name: '_Internal', fields: [{ name: '_x', type: { kind: 'string' } }] },
      ],
    };
    // No table-flagged types — emitter should succeed.
    expect(() => emitConvexSchema(ir)).not.toThrow();
  });
});
