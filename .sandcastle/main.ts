import { mkdirSync } from "node:fs";
import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { createLimit } from "./concurrency";
import { pickEligible } from "./eligibility";
import { fetchOpenLabelledIssues, fetchOpenPRsClosingIssues } from "./gh";
import { agent, streamLogger } from "./harness";
import { parsePlan } from "./plan";
import type { Issue } from "./plan";
import { describeExclusion, runIssuePipeline } from "./pipeline";
import type { IssueOutcome } from "./pipeline";
import { AGENTS, LABEL, MAX_ITERATIONS, MAX_PARALLEL } from "./workflow";

// Each sandbox gets its own bun cache. Sharing ~/.bun/install/cache across
// parallel sandboxes races on tarball extraction and silently produces broken
// installs (e.g. a package with package.json pointing at a build/ output that
// was never written). Cold installs are slower; broken node_modules are worse.
const sandboxProvider = docker({});

mkdirSync(".sandcastle/logs/plans", { recursive: true });

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  // Phase 1: Eligibility (deterministic) → optional subset selection (LLM).
  // pickEligible() filters by label and excludes issues already claimed by an
  // open PR; it returns already-validated Issue objects with deterministic
  // branch names. The LLM only runs when 2+ candidates survive (conflict
  // avoidance); a single eligible issue is dispatched directly.
  const [snapshots, openPRs] = await Promise.all([
    fetchOpenLabelledIssues(LABEL),
    fetchOpenPRsClosingIssues(),
  ]);

  const { eligible, needsPlanner, excluded } = pickEligible(snapshots, openPRs, { label: LABEL });

  for (const e of excluded) {
    console.log(`  - #${e.number} excluded: ${describeExclusion(e.reason)}`);
  }

  if (eligible.length === 0) {
    console.log("No eligible issues this iteration. Exiting.");
    break;
  }

  let issues: Issue[];
  if (needsPlanner) {
    console.log(
      `  ${eligible.length} eligible candidates; running subset selector for conflict avoidance.`,
    );
    const candidatesJson = JSON.stringify(eligible);
    const plan = await sandcastle.run({
      sandbox: sandboxProvider,
      name: "Subset selector",
      agent: agent(AGENTS.subsetSelector),
      promptFile: AGENTS.subsetSelector.promptPath,
      promptArgs: {
        LABEL,
        MAX_PARALLEL: String(MAX_PARALLEL),
        CANDIDATES_JSON: candidatesJson,
      },
      logging: streamLogger(`iter${iteration}-subset-selector`),
    });
    await Bun.write(`.sandcastle/logs/plans/plan-${iteration}.md`, plan.stdout);
    issues = parsePlan(plan.stdout).issues;
  } else {
    console.log("  1 eligible candidate; skipping subset selector.");
    issues = eligible;
  }

  if (issues.length === 0) {
    console.log("No issues to work on. Exiting.");
    break;
  }

  console.log(`Planning complete. ${issues.length} issue(s) to work in parallel:`);
  for (const issue of issues) {
    console.log(`  #${issue.number}: ${issue.title} → ${issue.branch} [${issue.labels.join(", ")}]`);
  }

  // Phase 2: per-issue pipeline (implement → maybe review → open PR), max N in parallel
  const limit = createLimit(MAX_PARALLEL);
  const settled = await Promise.allSettled(
    issues.map((issue) =>
      limit(() => runIssuePipeline(issue, { iteration, openPRs, sandboxProvider })),
    ),
  );

  for (const [i, outcome] of settled.entries()) {
    if (outcome.status === "rejected") {
      const issue = issues[i]!;
      const reason: unknown = outcome.reason;
      const errorTag =
        typeof reason === "object" && reason !== null && "_tag" in reason
          ? String((reason as { _tag: unknown })._tag)
          : reason instanceof Error
            ? reason.constructor.name
            : "UnknownError";
      const message = reason instanceof Error ? reason.message : String(reason);
      console.error(
        `  ✗ #${issue.number} (${issue.branch}) failed [${errorTag}]: ${message}`,
      );
    }
  }

  const fulfilled = settled.filter(
    (o): o is PromiseFulfilledResult<IssueOutcome> => o.status === "fulfilled",
  );
  const reconciledSkips = fulfilled.filter((o) => o.value.kind === "reconciledSkip").length;
  const completed = fulfilled.filter(
    (o) => o.value.kind === "ran" && o.value.result.commits.length > 0,
  );

  const summaryParts = [
    `${completed.length}/${issues.length} issue(s) produced commits`,
  ];
  if (reconciledSkips > 0) summaryParts.push(`${reconciledSkips} reconciled-skip`);
  console.log(`\nIteration ${iteration} complete. ${summaryParts.join("; ")}.`);

  if (completed.length === 0) {
    console.log("No progress this iteration. Exiting.");
    break;
  }
}

console.log("\nAll done.");
