import { describe, expect, test } from "bun:test";
import { type SchedulerFeature, selectRunnable } from "./scheduler";

function feature(overrides: Partial<SchedulerFeature> & { id: string }): SchedulerFeature {
  return {
    slug: overrides.id,
    status: "todo",
    dependencies: [],
    pathsOwned: [],
    ...overrides,
  };
}

describe("selectRunnable", () => {
  test("returns features whose status is todo and deps are done, capped at maxParallel", () => {
    const result = selectRunnable({
      features: [
        feature({ id: "a" }),
        feature({ id: "b" }),
        feature({ id: "c" }),
      ],
      maxParallel: 2,
    });
    expect(result.runnable.map((f) => f.id)).toEqual(["a", "b"]);
    expect(result.deferred[0].feature.id).toBe("c");
    expect(result.deferred[0].reason.kind).toBe("concurrencyCap");
  });

  test("blocks a feature whose dependency is not done", () => {
    const result = selectRunnable({
      features: [
        feature({ id: "a", status: "running" }),
        feature({ id: "b", dependencies: ["a"] }),
      ],
      maxParallel: 2,
    });
    expect(result.runnable).toEqual([]);
    const def = result.deferred.find((d) => d.feature.id === "b");
    expect(def?.reason.kind).toBe("depsNotDone");
    if (def?.reason.kind === "depsNotDone") {
      expect(def.reason.pendingDeps).toContain("a");
    }
  });

  test("schedules a feature after its dependency is done", () => {
    const result = selectRunnable({
      features: [
        feature({ id: "a", status: "done" }),
        feature({ id: "b", dependencies: ["a"] }),
      ],
      maxParallel: 2,
    });
    expect(result.runnable.map((f) => f.id)).toEqual(["b"]);
  });

  test("serializes features with overlapping pathsOwned", () => {
    const result = selectRunnable({
      features: [
        feature({ id: "a", pathsOwned: ["src/foo/**"] }),
        feature({ id: "b", pathsOwned: ["src/foo/bar.ts"] }),
        feature({ id: "c", pathsOwned: ["src/other/**"] }),
      ],
      maxParallel: 3,
    });
    expect(result.runnable.map((f) => f.id)).toEqual(["a", "c"]);
    const def = result.deferred.find((d) => d.feature.id === "b");
    expect(def?.reason.kind).toBe("pathConflict");
    if (def?.reason.kind === "pathConflict") {
      expect(def.reason.conflictsWith).toBe("a");
    }
  });

  test("respects already-running features when serializing on path", () => {
    const result = selectRunnable({
      features: [
        feature({ id: "a", status: "running", pathsOwned: ["src/foo/**"] }),
        feature({ id: "b", pathsOwned: ["src/foo/bar.ts"] }),
      ],
      maxParallel: 2,
    });
    expect(result.runnable).toEqual([]);
    expect(result.deferred[0].reason.kind).toBe("pathConflict");
  });

  test("counts running features toward the concurrency cap", () => {
    const result = selectRunnable({
      features: [
        feature({ id: "a", status: "running" }),
        feature({ id: "b" }),
        feature({ id: "c" }),
      ],
      maxParallel: 2,
    });
    expect(result.runnable.map((f) => f.id)).toEqual(["b"]);
    const def = result.deferred.find((d) => d.feature.id === "c");
    expect(def?.reason.kind).toBe("concurrencyCap");
  });

  test("ignores features in non-actionable statuses (review, done, blocked)", () => {
    const result = selectRunnable({
      features: [
        feature({ id: "a", status: "review" }),
        feature({ id: "b", status: "done" }),
        feature({ id: "c", status: "blocked" }),
        feature({ id: "d" }),
      ],
      maxParallel: 2,
    });
    expect(result.runnable.map((f) => f.id)).toEqual(["d"]);
    expect(result.deferred.some((d) => d.feature.id === "a")).toBe(true);
    expect(result.deferred.some((d) => d.feature.id === "c")).toBe(true);
    expect(result.deferred.some((d) => d.feature.id === "b")).toBe(false);
  });

  test("features with no pathsOwned do not conflict with each other", () => {
    const result = selectRunnable({
      features: [feature({ id: "a" }), feature({ id: "b" })],
      maxParallel: 3,
    });
    expect(result.runnable).toHaveLength(2);
  });
});
