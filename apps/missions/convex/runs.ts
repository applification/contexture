import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { agentRole, runOutcome } from './schema';

export const listByFeature = query({
  args: { featureId: v.id('features') },
  handler: async (ctx, { featureId }) => {
    return await ctx.db
      .query('runs')
      .withIndex('by_feature', (q) => q.eq('featureId', featureId))
      .collect();
  },
});

export const recordStart = mutation({
  args: {
    missionId: v.id('missions'),
    featureId: v.optional(v.id('features')),
    milestoneId: v.optional(v.id('milestones')),
    role: agentRole,
    agent: v.string(),
    branch: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('runs', {
      ...args,
      startedAt: Date.now(),
    });
  },
});

export const recordEnd = mutation({
  args: {
    runId: v.id('runs'),
    outcome: runOutcome,
    logUri: v.optional(v.string()),
  },
  handler: async (ctx, { runId, outcome, logUri }) => {
    const run = await ctx.db.get(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);

    const patch: {
      finishedAt: number;
      outcome: typeof outcome;
      logUri?: string;
    } = { finishedAt: Date.now(), outcome };
    if (logUri !== undefined) patch.logUri = logUri;
    await ctx.db.patch(runId, patch);
  },
});
