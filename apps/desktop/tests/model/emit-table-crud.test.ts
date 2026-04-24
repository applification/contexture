/**
 * `emitTableCrud` — per-table CRUD seed emitter.
 *
 * Produces the contents of `apps/web/convex/<table>.ts`: a starter set
 * of queries + mutations for a single table. Unlike the other emitters
 * in this folder, this file is `@contexture-seeded` — written once at
 * scaffold time, then never re-generated (users / coding agents are
 * expected to edit it). The banner warns re-emitters off.
 */
import { emitTableCrud } from '@renderer/model/emit-table-crud';
import type { Schema } from '@renderer/model/ir';
import { describe, expect, it } from 'vitest';

const singleTable: Schema = {
  version: '1',
  types: [
    {
      kind: 'object',
      name: 'Post',
      table: true,
      fields: [
        { name: 'title', type: { kind: 'string' } },
        { name: 'body', type: { kind: 'string' } },
      ],
    },
  ],
};

describe('emitTableCrud', () => {
  it('starts with the @contexture-seeded banner', () => {
    const out = emitTableCrud(singleTable, 'Post');
    const firstLine = out.split('\n', 1)[0];
    expect(firstLine).toMatch(/@contexture-seeded/);
    expect(firstLine).toMatch(/edit freely/i);
    expect(firstLine).toMatch(/not regenerated/i);
  });

  it('imports the Convex query + mutation helpers', () => {
    const out = emitTableCrud(singleTable, 'Post');
    expect(out).toMatch(/from\s+["']\.\/_generated\/server["']/);
    expect(out).toMatch(/query/);
    expect(out).toMatch(/mutation/);
  });

  it('exports the baseline operations: list, get, create, update, remove', () => {
    const out = emitTableCrud(singleTable, 'Post');
    expect(out).toMatch(/export const list\s*=/);
    expect(out).toMatch(/export const get\s*=/);
    expect(out).toMatch(/export const create\s*=/);
    expect(out).toMatch(/export const update\s*=/);
    expect(out).toMatch(/export const remove\s*=/);
  });

  it('uses the table name when calling ctx.db methods', () => {
    const out = emitTableCrud(singleTable, 'Post');
    expect(out).toMatch(/ctx\.db\.query\("Post"\)/);
    expect(out).toMatch(/ctx\.db\.insert\("Post"/);
  });

  it('emits one file per named table — multi-table schemas stay isolated', () => {
    const multi: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          table: true,
          fields: [{ name: 'title', type: { kind: 'string' } }],
        },
        {
          kind: 'object',
          name: 'Comment',
          table: true,
          fields: [{ name: 'body', type: { kind: 'string' } }],
        },
      ],
    };
    const post = emitTableCrud(multi, 'Post');
    const comment = emitTableCrud(multi, 'Comment');
    expect(post).toContain('ctx.db.query("Post")');
    expect(post).not.toContain('"Comment"');
    expect(comment).toContain('ctx.db.query("Comment")');
    expect(comment).not.toContain('"Post"');
  });

  it('emits CRUD for an indexed table identically to a non-indexed one', () => {
    // Indexes live in schema.ts, not the per-table CRUD file, so CRUD
    // output must be unaffected by their presence.
    const indexed: Schema = {
      version: '1',
      types: [
        {
          kind: 'object',
          name: 'Post',
          table: true,
          fields: [
            { name: 'title', type: { kind: 'string' } },
            { name: 'body', type: { kind: 'string' } },
          ],
          indexes: [{ name: 'by_title', fields: ['title'] }],
        },
      ],
    };
    expect(emitTableCrud(indexed, 'Post')).toBe(emitTableCrud(singleTable, 'Post'));
  });

  it('throws when the named table does not exist or is not table-flagged', () => {
    expect(() => emitTableCrud(singleTable, 'Nope')).toThrow(/Post|table/i);
    const notATable: Schema = {
      version: '1',
      types: [{ kind: 'object', name: 'Inline', fields: [] }],
    };
    expect(() => emitTableCrud(notATable, 'Inline')).toThrow(/table/i);
  });
});
