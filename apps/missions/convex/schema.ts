import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const missionStatus = v.union(
  v.literal('planning'),
  v.literal('running'),
  v.literal('paused'),
  v.literal('done'),
  v.literal('failed'),
);

export const milestoneStatus = v.union(
  v.literal('todo'),
  v.literal('running'),
  v.literal('validating'),
  v.literal('done'),
  v.literal('blocked'),
);

export const featureStatus = v.union(
  v.literal('todo'),
  v.literal('planned'),
  v.literal('running'),
  v.literal('review'),
  v.literal('blocked'),
  v.literal('done'),
);

export const agentRole = v.union(
  v.literal('worker'),
  v.literal('reviewer'),
  v.literal('fixer'),
  v.literal('validator'),
  v.literal('replanner'),
);

export const runOutcome = v.union(v.literal('success'), v.literal('failure'), v.literal('aborted'));

export default defineSchema({
  missions: defineTable({
    slug: v.string(),
    title: v.string(),
    objective: v.string(),
    status: missionStatus,
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_slug', ['slug']),

  milestones: defineTable({
    missionId: v.id('missions'),
    order: v.number(),
    title: v.string(),
    successCriteria: v.array(v.string()),
    validationPrompt: v.string(),
    status: milestoneStatus,
  }).index('by_mission', ['missionId', 'order']),

  features: defineTable({
    missionId: v.id('missions'),
    milestoneId: v.id('milestones'),
    slug: v.string(),
    title: v.string(),
    prompt: v.string(),
    dependencies: v.array(v.id('features')),
    pathsOwned: v.array(v.string()),
    preferredAgent: v.union(v.literal('claude'), v.literal('codex')),
    skillRefs: v.array(v.string()),
    status: featureStatus,
    branch: v.optional(v.string()),
    pullRequestUrl: v.optional(v.string()),
    reviewVerdict: v.optional(v.union(v.literal('approved'), v.literal('changes_requested'))),
    fixerAttempts: v.number(),
  })
    .index('by_milestone', ['milestoneId'])
    .index('by_mission', ['missionId'])
    .index('by_status', ['status']),

  runs: defineTable({
    missionId: v.id('missions'),
    featureId: v.optional(v.id('features')),
    milestoneId: v.optional(v.id('milestones')),
    role: agentRole,
    agent: v.string(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    outcome: v.optional(runOutcome),
    branch: v.optional(v.string()),
    logUri: v.optional(v.string()),
  })
    .index('by_feature', ['featureId'])
    .index('by_mission', ['missionId']),

  events: defineTable({
    missionId: v.id('missions'),
    at: v.number(),
    actor: v.union(v.literal('orchestrator'), v.literal('dashboard'), v.literal('user')),
    kind: v.string(),
    detail: v.any(),
  }).index('by_mission', ['missionId', 'at']),
});
