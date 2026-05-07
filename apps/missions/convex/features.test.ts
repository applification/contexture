import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.*s');

const seedPlan = {
  slug: 'feat-test',
  title: 'Feat Test',
  objective: 'Test feature mutations',
  milestones: [
    {
      slug: 'm1',
      title: 'M1',
      successCriteria: ['ok'],
      validationPrompt: 'check',
      features: [
        {
          slug: 'f1',
          title: 'F1',
          prompt: '...',
          dependencies: [] as string[],
          pathsOwned: [] as string[],
          preferredAgent: 'claude' as const,
          skillRefs: [] as string[],
        },
      ],
    },
  ],
};

describe('features.setStatus', () => {
  it('updates status, branch, and PR url; appends an event', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.missions.create, seedPlan);
    const result = await t.query(api.missions.getWithChildren, {
      slug: 'feat-test',
    });
    if (!result) throw new Error('mission not found');
    const f1 = result.features[0];

    await t.mutation(api.features.setStatus, {
      featureId: f1._id,
      status: 'running',
      branch: 'mission/feat-test/f1',
    });

    const refreshed = await t.query(api.features.listByMission, {
      missionId: result.mission._id,
    });
    expect(refreshed[0].status).toBe('running');
    expect(refreshed[0].branch).toBe('mission/feat-test/f1');

    const events = await t.query(api.events.listByMission, {
      missionId: result.mission._id,
    });
    expect(events.some((e) => e.kind === 'feature.statusChanged')).toBe(true);
  });
});

describe('features.replanMilestone', () => {
  it('inserts new features into the milestone with status=todo', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.missions.create, seedPlan);
    const result = await t.query(api.missions.getWithChildren, {
      slug: 'feat-test',
    });
    if (!result) throw new Error('mission not found');

    const milestoneId = result.milestones[0]._id;
    const newIds = await t.mutation(api.features.replanMilestone, {
      milestoneId,
      newFeatures: [
        {
          slug: 'fix-1',
          title: 'Fix 1',
          prompt: 'fix the thing',
          dependencies: [],
          pathsOwned: [],
          preferredAgent: 'claude',
          skillRefs: [],
        },
      ],
    });
    expect(newIds).toHaveLength(1);

    const features = await t.query(api.features.listByMilestone, { milestoneId });
    expect(features).toHaveLength(2);
    const fix = features.find((f) => f.slug === 'fix-1');
    expect(fix?.status).toBe('todo');
    expect(fix?.fixerAttempts).toBe(0);
  });
});
