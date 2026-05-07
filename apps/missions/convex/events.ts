import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const listByMission = query({
  args: {
    missionId: v.id('missions'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { missionId, limit }) => {
    return await ctx.db
      .query('events')
      .withIndex('by_mission', (q) => q.eq('missionId', missionId))
      .order('desc')
      .take(limit ?? 100);
  },
});

export const append = mutation({
  args: {
    missionId: v.id('missions'),
    actor: v.union(v.literal('orchestrator'), v.literal('dashboard'), v.literal('user')),
    kind: v.string(),
    detail: v.any(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('events', {
      ...args,
      at: Date.now(),
    });
  },
});
