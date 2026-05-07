import picomatch from "picomatch";

export type SchedulerFeature = {
  id: string;
  slug: string;
  status: "todo" | "planned" | "running" | "review" | "blocked" | "done";
  dependencies: string[];
  pathsOwned: string[];
};

export type SelectInput = {
  features: SchedulerFeature[];
  maxParallel: number;
};

export type SelectResult = {
  runnable: SchedulerFeature[];
  deferred: { feature: SchedulerFeature; reason: DeferReason }[];
};

export type DeferReason =
  | { kind: "wrongStatus" }
  | { kind: "depsNotDone"; pendingDeps: string[] }
  | { kind: "pathConflict"; conflictsWith: string }
  | { kind: "concurrencyCap" };

const SAMPLE_PATHS = [
  "src/foo.ts",
  "src/bar/baz.ts",
  "packages/core/src/x.ts",
  "apps/web/app/page.tsx",
  "scripts/migrate.ts",
];

function ownerships(patterns: string[]): { test(path: string): boolean } {
  if (patterns.length === 0) return { test: () => false };
  const matchers = patterns.map((p) => picomatch(p));
  return { test: (path: string) => matchers.some((m) => m(path)) };
}

function hasPathOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;

  const aMatch = ownerships(a);
  const bMatch = ownerships(b);
  if (a.some((p) => bMatch.test(p))) return true;
  if (b.some((p) => aMatch.test(p))) return true;
  for (const sample of SAMPLE_PATHS) {
    if (aMatch.test(sample) && bMatch.test(sample)) return true;
  }
  return false;
}

export function selectRunnable({ features, maxParallel }: SelectInput): SelectResult {
  const byId = new Map(features.map((f) => [f.id, f]));
  const running = features.filter((f) => f.status === "running");
  const remainingSlots = Math.max(0, maxParallel - running.length);

  const runnable: SchedulerFeature[] = [];
  const deferred: SelectResult["deferred"] = [];
  const claimedPaths: { feature: SchedulerFeature }[] = running.map((f) => ({ feature: f }));

  for (const f of features) {
    if (f.status !== "todo") {
      if (f.status !== "running" && f.status !== "done") {
        deferred.push({ feature: f, reason: { kind: "wrongStatus" } });
      }
      continue;
    }

    const pendingDeps = f.dependencies
      .map((depId) => byId.get(depId))
      .filter((dep): dep is SchedulerFeature => dep !== undefined && dep.status !== "done")
      .map((dep) => dep.slug);
    if (pendingDeps.length > 0) {
      deferred.push({ feature: f, reason: { kind: "depsNotDone", pendingDeps } });
      continue;
    }

    const conflict = claimedPaths.find((c) => hasPathOverlap(f.pathsOwned, c.feature.pathsOwned));
    if (conflict) {
      deferred.push({
        feature: f,
        reason: { kind: "pathConflict", conflictsWith: conflict.feature.slug },
      });
      continue;
    }

    if (runnable.length >= remainingSlots) {
      deferred.push({ feature: f, reason: { kind: "concurrencyCap" } });
      continue;
    }

    runnable.push(f);
    claimedPaths.push({ feature: f });
  }

  return { runnable, deferred };
}
