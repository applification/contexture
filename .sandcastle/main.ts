import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { pickEligible } from "./eligibility";
import { fetchOpenLabelledIssues, fetchOpenPRsClosingIssues } from "./gh";
import { describeExclusion, runIssuePipeline } from "./pipeline";
import { LABEL, MAX_ITERATIONS } from "./workflow";

// Each sandbox gets its own bun cache. Sharing ~/.bun/install/cache across
// parallel sandboxes races on tarball extraction and silently produces broken
// installs (e.g. a package with package.json pointing at a build/ output that
// was never written). Cold installs are slower; broken node_modules are worse.
const sandboxProvider = docker({});

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  // Phase 1: Eligibility (deterministic). pickEligible() filters by label and
  // excludes issues already claimed by an open PR; survivors come back sorted
  // by issue number ascending so we can take the oldest with [0].
  const [snapshots, openPRs] = await Promise.all([
    fetchOpenLabelledIssues(LABEL),
    fetchOpenPRsClosingIssues(),
  ]);

  const { eligible, excluded } = pickEligible(snapshots, openPRs, { label: LABEL });

  for (const e of excluded) {
    console.log(`  - #${e.number} excluded: ${describeExclusion(e.reason)}`);
  }

  const issue = eligible[0];
  if (issue === undefined) {
    console.log("No eligible issues this iteration. Exiting.");
    break;
  }

  console.log(
    `Working on #${issue.number}: ${issue.title} → ${issue.branch} [${issue.labels.join(", ")}]`,
  );

  // Phase 2: per-issue pipeline (implement → maybe review → open PR).
  let outcome;
  try {
    outcome = await runIssuePipeline(issue, { iteration, openPRs, sandboxProvider });
  } catch (reason) {
    const errorTag =
      typeof reason === "object" && reason !== null && "_tag" in reason
        ? String((reason as { _tag: unknown })._tag)
        : reason instanceof Error
          ? reason.constructor.name
          : "UnknownError";
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error(`  ✗ #${issue.number} (${issue.branch}) failed [${errorTag}]: ${message}`);
    continue;
  }

  if (outcome.kind === "reconciledSkip") {
    console.log(`\nIteration ${iteration} complete. #${issue.number} reconciled-skip.`);
    continue;
  }

  const madeCommits = outcome.result.commits.length > 0;
  console.log(
    `\nIteration ${iteration} complete. #${issue.number} ${madeCommits ? "produced commits" : "made no progress"}.`,
  );

  if (!madeCommits) {
    console.log("No progress this iteration. Exiting.");
    break;
  }
}

console.log("\nAll done.");
