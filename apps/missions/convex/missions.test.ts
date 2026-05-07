import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.*s');

const samplePlan = {
  slug: 'sample-mission',
  title: 'Sample',
  objective: 'Demonstrate things',
  milestones: [
    {
      slug: 'm1',
      title: 'Milestone 1',
      successCriteria: ['Criterion A'],
      validationPrompt: 'Check things',
      features: [
        {
          slug: 'f1',
          title: 'Feature 1',
          prompt: 'Do thing 1',
          dependencies: [] as string[],
          pathsOwned: ['src/foo/**'],
          preferredAgent: 'claude' as const,
          skillRefs: [],
        },
        {
          slug: 'f2',
          title: 'Feature 2',
          prompt: 'Do thing 2',
          dependencies: ['f1'],
          pathsOwned: ['src/bar/**'],
          preferredAgent: 'claude' as const,
          skillRefs: [],
        },
      ],
    },
  ],
};

describe('missions.create', () => {
  it('inserts mission with milestones and features, resolving slug deps to ids', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.missions.create, samplePlan);

    const result = await t.query(api.missions.getWithChildren, {
      slug: 'sample-mission',
    });
    expect(result).not.toBeNull();
    if (!result) throw new Error('mission not found');

    expect(result.mission.status).toBe('planning');
    expect(result.milestones).toHaveLength(1);
    expect(result.features).toHaveLength(2);

    const f1 = result.features.find((f) => f.slug === 'f1');
    const f2 = result.features.find((f) => f.slug === 'f2');
    if (!f1 || !f2) throw new Error('features missing');

    expect(f1.dependencies).toEqual([]);
    expect(f2.dependencies).toEqual([f1._id]);
  });

  it('rejects duplicate mission slug', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.missions.create, samplePlan);
    await expect(t.mutation(api.missions.create, samplePlan)).rejects.toThrow(/already exists/);
  });

  it('rejects unknown dependency slug', async () => {
    const t = convexTest(schema, modules);
    const broken = {
      ...samplePlan,
      slug: 'broken',
      milestones: [
        {
          ...samplePlan.milestones[0],
          features: [
            {
              ...samplePlan.milestones[0].features[0],
              dependencies: ['ghost'],
            },
          ],
        },
      ],
    };
    await expect(t.mutation(api.missions.create, broken)).rejects.toThrow(/unknown feature: ghost/);
  });
});

describe('missions.pause / resume', () => {
  it('pauses a running mission and resumes it', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.missions.create, samplePlan);
    await t.mutation(api.missions.setStatus, {
      slug: 'sample-mission',
      status: 'running',
    });

    await t.mutation(api.missions.pause, { slug: 'sample-mission' });
    let m = await t.query(api.missions.getBySlug, { slug: 'sample-mission' });
    expect(m?.status).toBe('paused');

    await t.mutation(api.missions.resume, { slug: 'sample-mission' });
    m = await t.query(api.missions.getBySlug, { slug: 'sample-mission' });
    expect(m?.status).toBe('running');
  });

  it('rejects resume on non-paused mission', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.missions.create, samplePlan);
    await expect(t.mutation(api.missions.resume, { slug: 'sample-mission' })).rejects.toThrow(
      /not paused/,
    );
  });
});
