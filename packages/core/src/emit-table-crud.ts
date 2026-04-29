/**
 * Pure emitter for `apps/web/convex/<table>.ts` — the starter CRUD file
 * scaffolded for each table-flagged object. Unlike the other emitters
 * in this folder, the output is `@contexture-seeded`: written once on
 * first project-mode open and then left alone. Users and coding agents
 * own this file from that point on, so the header specifically calls
 * out that the file is editable and will not be regenerated.
 *
 * Pure function: same IR in, same string out, no I/O.
 */
import type { Schema, TypeDef } from './ir';

const BANNER =
  '// @contexture-seeded — Contexture created this on scaffold. Edit freely; not regenerated.';

type ObjectType = Extract<TypeDef, { kind: 'object' }>;

export function emitTableCrud(schema: Schema, tableName: string): string {
  const type = schema.types.find((t) => t.name === tableName);
  if (!type || type.kind !== 'object' || type.table !== true) {
    throw new Error(`emitTableCrud: "${tableName}" is not a table-flagged object in the schema`);
  }
  return render(type);
}

function render(table: ObjectType): string {
  const patchFields = table.fields
    .filter((f) => f.name !== '_id' && f.name !== '_creationTime')
    .map((f) => `    ${f.name}: v.optional(v.any()),`)
    .join('\n');
  const createFields = table.fields
    .filter((f) => f.name !== '_id' && f.name !== '_creationTime')
    .map((f) => `    ${f.name}: v.any(),`)
    .join('\n');

  return `${BANNER}
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("${table.name}").collect();
  },
});

export const get = query({
  args: { id: v.id("${table.name}") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const create = mutation({
  args: {
${createFields}
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("${table.name}", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("${table.name}"),
${patchFields}
  },
  handler: async (ctx, { id, ...patch }) => {
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("${table.name}") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
`;
}
