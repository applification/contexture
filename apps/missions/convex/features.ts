import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { featureStatus } from './schema';

export const listByMission = query({
  args: { missionId: v.id('missions') },
  handler: async (ctx, { missionId }) => {
    return await ctx.db
      .query('features')
      .withIndex('by_mission', (q) => q.eq('missionId', missionId))
      .collect();
  },
});

export const listByMilestone = query({
  args: { milestoneId: v.id('milestones') },
  handler: async (ctx, { milestoneId }) => {
    return await ctx.db
      .query('features')
      .withIndex('by_milestone', (q) => q.eq('milestoneId', milestoneId))
      .collect();
  },
});

export const setStatus = mutation({
  args: {
    featureId: v.id('features'),
    status: featureStatus,
    branch: v.optional(v.string()),
    pullRequestUrl: v.optional(v.string()),
  },
  handler: async (ctx, { featureId, status, branch, pullRequestUrl }) => {
    const feature = await ctx.db.get(featureId);
    if (!feature) throw new Error(`Feature not found: ${featureId}`);

    const patch: {
      status: typeof status;
      branch?: string;
      pullRequestUrl?: string;
    } = { status };
    if (branch !== undefined) patch.branch = branch;
    if (pullRequestUrl !== undefined) patch.pullRequestUrl = pullRequestUrl;
    await ctx.db.patch(featureId, patch);

    await ctx.db.insert('events', {
      missionId: feature.missionId,
      at: Date.now(),
      actor: 'orchestrator',
      kind: 'feature.statusChanged',
      detail: { featureId, from: feature.status, to: status },
    });
  },
});

export const setReviewVerdict = mutation({
  args: {
    featureId: v.id('features'),
    verdict: v.union(v.literal('approved'), v.literal('changes_requested')),
  },
  handler: async (ctx, { featureId, verdict }) => {
    const feature = await ctx.db.get(featureId);
    if (!feature) throw new Error(`Feature not found: ${featureId}`);
    await ctx.db.patch(featureId, { reviewVerdict: verdict });
    await ctx.db.insert('events', {
      missionId: feature.missionId,
      at: Date.now(),
      actor: 'orchestrator',
      kind: 'feature.reviewed',
      detail: { featureId, verdict },
    });
  },
});

export const incrementFixerAttempts = mutation({
  args: { featureId: v.id('features') },
  handler: async (ctx, { featureId }) => {
    const feature = await ctx.db.get(featureId);
    if (!feature) throw new Error(`Feature not found: ${featureId}`);
    await ctx.db.patch(featureId, { fixerAttempts: feature.fixerAttempts + 1 });
  },
});

export const replanMilestone = mutation({
  args: {
    milestoneId: v.id('milestones'),
    newFeatures: v.array(
      v.object({
        slug: v.string(),
        title: v.string(),
        prompt: v.string(),
        dependencies: v.array(v.id('features')),
        pathsOwned: v.array(v.string()),
        preferredAgent: v.union(v.literal('claude'), v.literal('codex')),
        skillRefs: v.array(v.string()),
      }),
    ),
  },
  handler: async (ctx, { milestoneId, newFeatures }) => {
    const milestone = await ctx.db.get(milestoneId);
    if (!milestone) throw new Error(`Milestone not found: ${milestoneId}`);

    const inserted: string[] = [];
    for (const f of newFeatures) {
      const id = await ctx.db.insert('features', {
        missionId: milestone.missionId,
        milestoneId,
        slug: f.slug,
        title: f.title,
        prompt: f.prompt,
        dependencies: f.dependencies,
        pathsOwned: f.pathsOwned,
        preferredAgent: f.preferredAgent,
        skillRefs: f.skillRefs,
        status: 'todo',
        fixerAttempts: 0,
      });
      inserted.push(id);
    }

    await ctx.db.insert('events', {
      missionId: milestone.missionId,
      at: Date.now(),
      actor: 'orchestrator',
      kind: 'milestone.replanned',
      detail: { milestoneId, addedFeatureIds: inserted },
    });

    return inserted;
  },
});
