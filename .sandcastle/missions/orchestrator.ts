import type { api as MissionsApi, Id } from "@contexture/missions";
import { ConvexHttpClient } from "convex/browser";
import { runAgent, type RunAgentResult } from "./run-agent";
import { selectRunnable } from "./scheduler";
import type { MissionPlan } from "./schema";

const MAX_PARALLEL = 2;

type ApiType = typeof MissionsApi;

type FeatureStatus = "todo" | "planned" | "running" | "review" | "blocked" | "done";

type Mission = {
  _id: Id<"missions">;
  slug: string;
  title: string;
  status: "planning" | "running" | "paused" | "done" | "failed";
  updatedAt: number;
};

type Milestone = {
  _id: Id<"milestones">;
  missionId: Id<"missions">;
  order: number;
  title: string;
  status: "todo" | "running" | "validating" | "done" | "blocked";
};

type Feature = {
  _id: Id<"features">;
  milestoneId: Id<"milestones">;
  missionId: Id<"missions">;
  slug: string;
  title: string;
  status: FeatureStatus;
  dependencies: Id<"features">[];
  pathsOwned: string[];
  preferredAgent: "claude" | "codex";
  branch?: string;
  fixerAttempts: number;
};

export class Orchestrator {
  private readonly client: ConvexHttpClient;
  private readonly api: ApiType;

  constructor(opts: { url: string; api: ApiType; deployKey?: string }) {
    this.client = new ConvexHttpClient(opts.url);
    if (opts.deployKey) this.client.setAuth(opts.deployKey);
    this.api = opts.api;
  }

  async createMission(plan: MissionPlan): Promise<Id<"missions">> {
    return await this.client.mutation(this.api.missions.create, plan);
  }

  async listMissions(): Promise<Mission[]> {
    return await this.client.query(this.api.missions.list, {});
  }

  async getMission(slug: string): Promise<{
    mission: Mission;
    milestones: Milestone[];
    features: Feature[];
  } | null> {
    return await this.client.query(this.api.missions.getWithChildren, { slug });
  }

  async pause(slug: string): Promise<void> {
    await this.client.mutation(this.api.missions.pause, { slug });
  }

  async resume(slug: string): Promise<void> {
    await this.client.mutation(this.api.missions.resume, { slug });
  }

  async run(slug: string): Promise<{ ranFeatures: number; ranMilestones: number }> {
    let ranFeatures = 0;
    let ranMilestones = 0;

    while (true) {
      const state = await this.getMission(slug);
      if (!state) throw new Error(`Mission not found: ${slug}`);
      if (state.mission.status === "paused") {
        console.log(`Mission ${slug} is paused. Exiting cleanly.`);
        return { ranFeatures, ranMilestones };
      }

      if (state.mission.status === "planning") {
        await this.client.mutation(this.api.missions.setStatus, {
          slug,
          status: "running",
        });
      }

      const currentMilestone = state.milestones.find((m) => m.status !== "done");
      if (!currentMilestone) {
        await this.client.mutation(this.api.missions.setStatus, {
          slug,
          status: "done",
        });
        return { ranFeatures, ranMilestones };
      }

      const milestoneFeatures = state.features.filter(
        (f) => f.milestoneId === currentMilestone._id,
      );
      const sched = selectRunnable({
        features: milestoneFeatures.map((f) => ({
          id: f._id,
          slug: f.slug,
          status: f.status,
          dependencies: f.dependencies,
          pathsOwned: f.pathsOwned,
        })),
        maxParallel: MAX_PARALLEL,
      });

      if (sched.runnable.length === 0) {
        const allDone = milestoneFeatures.every((f) => f.status === "done");
        if (allDone) {
          // Slice 1: no validator. Mark milestone done immediately.
          await this.client.mutation(this.api.milestones.setStatus, {
            milestoneId: currentMilestone._id,
            status: "done",
          });
          ranMilestones += 1;
          continue;
        }
        // Nothing runnable but features still in flight (review/blocked) — exit.
        console.log(
          `Milestone ${currentMilestone.title}: nothing runnable. Deferred: ${sched.deferred
            .map((d) => `${d.feature.slug}(${d.reason.kind})`)
            .join(", ")}`,
        );
        return { ranFeatures, ranMilestones };
      }

      // Run features in parallel.
      const work = sched.runnable.map((sf) => {
        const feature = milestoneFeatures.find((f) => f._id === sf.id);
        if (!feature) throw new Error(`Feature missing: ${sf.id}`);
        return this.executeFeature(state.mission, currentMilestone, feature);
      });
      await Promise.all(work);
      ranFeatures += work.length;
    }
  }

  private async executeFeature(
    mission: Mission,
    milestone: Milestone,
    feature: Feature,
  ): Promise<void> {
    const branch = feature.branch ?? `mission/${mission.slug}/${feature.slug}`;

    await this.client.mutation(this.api.features.setStatus, {
      featureId: feature._id,
      status: "running",
      branch,
    });

    const runId = await this.client.mutation(this.api.runs.recordStart, {
      missionId: feature.missionId,
      featureId: feature._id,
      milestoneId: feature.milestoneId,
      role: "worker",
      agent: `stub:${feature.preferredAgent}`,
      branch,
    });

    let result: RunAgentResult;
    try {
      result = await runAgent({
        role: "worker",
        missionId: mission._id,
        missionSlug: mission.slug,
        milestoneId: milestone._id,
        featureId: feature._id,
        featureSlug: feature.slug,
        branch,
        promptArgs: {
          MISSION_SLUG: mission.slug,
          FEATURE_SLUG: feature.slug,
        },
        preferredAgent: feature.preferredAgent,
      });
    } catch (err) {
      await this.client.mutation(this.api.runs.recordEnd, {
        runId,
        outcome: "failure",
      });
      await this.client.mutation(this.api.features.setStatus, {
        featureId: feature._id,
        status: "blocked",
      });
      throw err;
    }

    await this.client.mutation(this.api.runs.recordEnd, {
      runId,
      outcome: result.outcome,
      logUri: result.logUri,
    });

    if (result.commits === 0) {
      await this.client.mutation(this.api.features.setStatus, {
        featureId: feature._id,
        status: "blocked",
      });
      return;
    }

    // Slice 1: no reviewer. Treat review as a pass-through to done.
    await this.client.mutation(this.api.features.setStatus, {
      featureId: feature._id,
      status: "review",
    });

    const prUrl = await this.openPullRequest(mission, feature, branch);
    await this.client.mutation(this.api.features.setStatus, {
      featureId: feature._id,
      status: "done",
      pullRequestUrl: prUrl ?? undefined,
    });
  }

  private async openPullRequest(
    mission: Mission,
    feature: Feature,
    branch: string,
  ): Promise<string | null> {
    const body = `Mission: ${mission.slug}\nFeature: ${feature._id}\nBranch: ${branch}\n\nGenerated by the missions orchestrator (slice 1 stub).`;
    const proc = Bun.spawn(
      [
        "gh",
        "pr",
        "create",
        "--title",
        `mission: ${mission.slug}/${feature.slug}`,
        "--body",
        body,
        "--head",
        branch,
        "--base",
        "main",
      ],
      { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const code = await proc.exited;
    if (code !== 0) {
      console.error(`gh pr create failed (exit ${code}): ${stderr.trim()}`);
      return null;
    }
    return stdout.trim() || null;
  }
}
