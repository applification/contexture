import { api } from "@contexture/missions";
import { Orchestrator } from "./missions/orchestrator";
import { planMission, readPlanFromFile } from "./missions/planner";
import { renderStatus } from "./missions/status-view";

const HELP = `Usage: bun run mission <command> [args]

Commands:
  plan "<objective>"             Run the mission-plan skill, validate, insert into Convex.
  plan --apply <path>            Read a previously-saved plan JSON and insert into Convex.
  run [--mission <slug>]         Execute runnable features for the given (or single active) mission.
  status [--mission <slug>]      Render a coloured status table from Convex.
  pause <slug>                   Mark a mission as paused.
  resume <slug>                  Mark a paused mission as running.
  replan <milestone-id>          Run the replanner agent (slice 3, not yet implemented).

Environment:
  CONVEX_URL                     URL of the Convex deployment (e.g. http://127.0.0.1:3210)
  CONVEX_DEPLOY_KEY              Optional. Admin auth for the deployment.

Run 'bun run convex:dev' in another terminal to start the local Convex deployment.`;

function readEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) {
    console.error(`Missing required environment variable: ${name}`);
    console.error(
      "  Set it in .sandcastle/.env or your shell. For local dev, copy CONVEX_URL from apps/missions/.env.local.",
    );
    process.exit(1);
  }
  return v;
}

function buildOrchestrator(): Orchestrator {
  const url = readEnv("CONVEX_URL");
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  return new Orchestrator({ url, api, deployKey });
}

function parseFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1 || idx === args.length - 1) return undefined;
  return args[idx + 1];
}

async function singleActiveMissionSlug(orch: Orchestrator): Promise<string> {
  const flag = parseFlag(process.argv, "--mission");
  if (flag) return flag;
  const list = await orch.listMissions();
  const active = list.filter((m) => m.status !== "done" && m.status !== "failed");
  if (active.length === 0) {
    console.error("No active missions. Run 'bun run mission plan \"<objective>\"' first.");
    process.exit(1);
  }
  if (active.length > 1) {
    console.error(
      `Multiple active missions (${active.map((m) => m.slug).join(", ")}). Use --mission <slug>.`,
    );
    process.exit(1);
  }
  return active[0].slug;
}

async function cmdPlan(args: string[]): Promise<void> {
  const applyIdx = args.indexOf("--apply");
  if (applyIdx !== -1) {
    const path = args[applyIdx + 1];
    if (!path) {
      console.error("--apply requires a file path");
      process.exit(1);
    }
    const result = await readPlanFromFile(path);
    if (!result.ok) {
      console.error(`Failed to read plan: ${result.error}`);
      process.exit(1);
    }
    const orch = buildOrchestrator();
    const id = await orch.createMission(result.plan);
    console.log(`Created mission ${result.plan.slug} (id: ${id})`);
    return;
  }

  const objective = args.filter((a) => !a.startsWith("--")).join(" ").trim();
  if (!objective) {
    console.error("plan requires an objective: bun run mission plan \"<objective>\"");
    process.exit(1);
  }
  console.log(`Planning mission: ${objective}`);
  const result = await planMission(objective);
  if (!result.ok) {
    console.error(`Planner failed: ${result.error}`);
    if (result.rawResponse) console.error(`\n--- raw response (truncated) ---\n${result.rawResponse}`);
    process.exit(1);
  }
  const orch = buildOrchestrator();
  const id = await orch.createMission(result.plan);
  console.log(`Created mission ${result.plan.slug} (id: ${id})`);
}

async function cmdRun(): Promise<void> {
  const orch = buildOrchestrator();
  const slug = await singleActiveMissionSlug(orch);
  console.log(`Running mission: ${slug}`);
  const summary = await orch.run(slug);
  console.log(
    `Done. Features executed: ${summary.ranFeatures}. Milestones completed: ${summary.ranMilestones}.`,
  );
}

async function cmdStatus(): Promise<void> {
  const orch = buildOrchestrator();
  const slug = await singleActiveMissionSlug(orch);
  const state = await orch.getMission(slug);
  if (!state) {
    console.error(`Mission not found: ${slug}`);
    process.exit(1);
  }
  const useColor = process.stdout.isTTY ?? false;
  const out = renderStatus({
    mission: state.mission,
    milestones: state.milestones.map((m) => ({
      id: m._id,
      order: m.order,
      title: m.title,
      status: m.status,
    })),
    features: state.features.map((f) => ({
      id: f._id,
      milestoneId: f.milestoneId,
      slug: f.slug,
      title: f.title,
      status: f.status,
      branch: f.branch,
      fixerAttempts: f.fixerAttempts,
    })),
    now: Date.now(),
    useColor,
  });
  console.log(out);
}

async function cmdPause(slug: string): Promise<void> {
  const orch = buildOrchestrator();
  await orch.pause(slug);
  console.log(`Paused mission: ${slug}`);
}

async function cmdResume(slug: string): Promise<void> {
  const orch = buildOrchestrator();
  await orch.resume(slug);
  console.log(`Resumed mission: ${slug}`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }

  switch (command) {
    case "plan":
      await cmdPlan(rest);
      return;
    case "run":
      await cmdRun();
      return;
    case "status":
      await cmdStatus();
      return;
    case "pause": {
      const slug = rest[0];
      if (!slug) {
        console.error("pause requires a mission slug: bun run mission pause <slug>");
        process.exit(1);
      }
      await cmdPause(slug);
      return;
    }
    case "resume": {
      const slug = rest[0];
      if (!slug) {
        console.error("resume requires a mission slug: bun run mission resume <slug>");
        process.exit(1);
      }
      await cmdResume(slug);
      return;
    }
    case "replan":
      console.error("replan is not yet implemented (slice 3).");
      process.exit(1);
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

await main();
