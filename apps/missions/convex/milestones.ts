import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { milestoneStatus } from './schema';

export const listByMission = query({
  args: { missionId: v.id('missions') },
  handler: async (ctx, { missionId }) => {
    const milestones = await ctx.db
      .query('milestones')
      .withIndex('by_mission', (q) => q.eq('missionId', missionId))
      .collect();
    return milestones.sort((a, b) => a.order - b.order);
  },
});

export const setStatus = mutation({
  args: { milestoneId: v.id('milestones'), status: milestoneStatus },
  handler: async (ctx, { milestoneId, status }) => {
    const milestone = await ctx.db.get(milestoneId);
    if (!milestone) throw new Error(`Milestone not found: ${milestoneId}`);

    const now = Date.now();
    await ctx.db.patch(milestoneId, { status });
    await ctx.db.insert('events', {
      missionId: milestone.missionId,
      at: now,
      actor: 'orchestrator',
      kind: 'milestone.statusChanged',
      detail: { milestoneId, from: milestone.status, to: status },
    });
  },
});
