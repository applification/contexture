import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { missionStatus } from './schema';

export const create = mutation({
  args: {
    slug: v.string(),
    title: v.string(),
    objective: v.string(),
    milestones: v.array(
      v.object({
        slug: v.string(),
        title: v.string(),
        successCriteria: v.array(v.string()),
        validationPrompt: v.string(),
        features: v.array(
          v.object({
            slug: v.string(),
            title: v.string(),
            prompt: v.string(),
            dependencies: v.array(v.string()),
            pathsOwned: v.array(v.string()),
            preferredAgent: v.union(v.literal('claude'), v.literal('codex')),
            skillRefs: v.array(v.string()),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, plan) => {
    const existing = await ctx.db
      .query('missions')
      .withIndex('by_slug', (q) => q.eq('slug', plan.slug))
      .unique();
    if (existing) throw new Error(`Mission already exists: ${plan.slug}`);

    const now = Date.now();
    const missionId = await ctx.db.insert('missions', {
      slug: plan.slug,
      title: plan.title,
      objective: plan.objective,
      status: 'planning',
      createdAt: now,
      updatedAt: now,
    });

    type FeatureSpec = (typeof plan.milestones)[number]['features'][number];
    const featureSlugToId = new Map<string, Id<'features'>>();
    const pendingFeatures: { tempId: Id<'features'>; spec: FeatureSpec }[] = [];

    for (let i = 0; i < plan.milestones.length; i++) {
      const m = plan.milestones[i];
      const milestoneId = await ctx.db.insert('milestones', {
        missionId,
        order: i,
        title: m.title,
        successCriteria: m.successCriteria,
        validationPrompt: m.validationPrompt,
        status: 'todo',
      });

      for (const f of m.features) {
        if (featureSlugToId.has(f.slug)) {
          throw new Error(`Duplicate feature slug: ${f.slug}`);
        }
        const featureId = await ctx.db.insert('features', {
          missionId,
          milestoneId,
          slug: f.slug,
          title: f.title,
          prompt: f.prompt,
          dependencies: [],
          pathsOwned: f.pathsOwned,
          preferredAgent: f.preferredAgent,
          skillRefs: f.skillRefs,
          status: 'todo',
          fixerAttempts: 0,
        });
        featureSlugToId.set(f.slug, featureId);
        pendingFeatures.push({ tempId: featureId, spec: f });
      }
    }

    for (const { tempId, spec } of pendingFeatures) {
      const depIds = spec.dependencies.map((depSlug) => {
        const id = featureSlugToId.get(depSlug);
        if (!id) {
          throw new Error(`Feature ${spec.slug} depends on unknown feature: ${depSlug}`);
        }
        return id;
      });
      if (depIds.length > 0) {
        await ctx.db.patch(tempId, { dependencies: depIds });
      }
    }

    await ctx.db.insert('events', {
      missionId,
      at: now,
      actor: 'user',
      kind: 'mission.created',
      detail: {
        milestoneCount: plan.milestones.length,
        featureCount: pendingFeatures.length,
      },
    });

    return missionId;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('missions').collect();
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query('missions')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
  },
});

export const getWithChildren = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const mission = await ctx.db
      .query('missions')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!mission) return null;

    const milestones = await ctx.db
      .query('milestones')
      .withIndex('by_mission', (q) => q.eq('missionId', mission._id))
      .collect();

    const features = await ctx.db
      .query('features')
      .withIndex('by_mission', (q) => q.eq('missionId', mission._id))
      .collect();

    return {
      mission,
      milestones: milestones.sort((a, b) => a.order - b.order),
      features,
    };
  },
});

export const setStatus = mutation({
  args: { slug: v.string(), status: missionStatus },
  handler: async (ctx, { slug, status }) => {
    const mission = await ctx.db
      .query('missions')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!mission) throw new Error(`Mission not found: ${slug}`);

    const now = Date.now();
    await ctx.db.patch(mission._id, { status, updatedAt: now });
    await ctx.db.insert('events', {
      missionId: mission._id,
      at: now,
      actor: 'orchestrator',
      kind: 'mission.statusChanged',
      detail: { from: mission.status, to: status },
    });
    return mission._id;
  },
});

export const pause = mutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const mission = await ctx.db
      .query('missions')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!mission) throw new Error(`Mission not found: ${slug}`);

    const now = Date.now();
    await ctx.db.patch(mission._id, { status: 'paused', updatedAt: now });
    await ctx.db.insert('events', {
      missionId: mission._id,
      at: now,
      actor: 'user',
      kind: 'mission.paused',
      detail: {},
    });
    return mission._id;
  },
});

export const resume = mutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const mission = await ctx.db
      .query('missions')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!mission) throw new Error(`Mission not found: ${slug}`);
    if (mission.status !== 'paused') {
      throw new Error(`Mission ${slug} is not paused (status: ${mission.status})`);
    }

    const now = Date.now();
    await ctx.db.patch(mission._id, { status: 'running', updatedAt: now });
    await ctx.db.insert('events', {
      missionId: mission._id,
      at: now,
      actor: 'user',
      kind: 'mission.resumed',
      detail: {},
    });
    return mission._id;
  },
});
