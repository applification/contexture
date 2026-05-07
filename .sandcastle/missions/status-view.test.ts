import { describe, expect, test } from "bun:test";
import { renderStatus } from "./status-view";

const sample = {
  mission: {
    slug: "demo",
    title: "Demo mission",
    status: "running" as const,
    updatedAt: 1_000_000,
  },
  milestones: [
    { id: "m1", order: 0, title: "Milestone 1", status: "running" as const },
    { id: "m2", order: 1, title: "Milestone 2", status: "todo" as const },
  ],
  features: [
    {
      id: "f1",
      milestoneId: "m1",
      slug: "foo",
      title: "Add foo",
      status: "running" as const,
      branch: "mission/demo/foo",
      fixerAttempts: 0,
      lastRunAt: 999_000,
    },
    {
      id: "f2",
      milestoneId: "m1",
      slug: "bar",
      title: "Add bar",
      status: "review" as const,
      branch: "mission/demo/bar",
      fixerAttempts: 1,
      lastRunAt: 990_000,
    },
    {
      id: "f3",
      milestoneId: "m2",
      slug: "baz",
      title: "Add baz",
      status: "todo" as const,
      fixerAttempts: 0,
    },
  ],
  now: 1_000_000,
  useColor: false,
};

describe("renderStatus", () => {
  test("renders mission header with slug and status", () => {
    const out = renderStatus(sample);
    expect(out).toContain("Demo mission");
    expect(out).toContain("(demo)");
    expect(out).toContain("running");
  });

  test("renders both milestones with their statuses", () => {
    const out = renderStatus(sample);
    expect(out).toContain("Milestone 1");
    expect(out).toContain("Milestone 2");
    expect(out).toContain("[running]");
    expect(out).toContain("[todo]");
  });

  test("renders feature rows under their milestone", () => {
    const out = renderStatus(sample);
    const lines = out.split("\n");
    const m1Index = lines.findIndex((l) => l.includes("Milestone 1"));
    const m2Index = lines.findIndex((l) => l.includes("Milestone 2"));
    const fooIndex = lines.findIndex((l) => l.includes("foo"));
    const bazIndex = lines.findIndex((l) => l.includes("baz"));
    expect(m1Index).toBeLessThan(fooIndex);
    expect(fooIndex).toBeLessThan(m2Index);
    expect(m2Index).toBeLessThan(bazIndex);
  });

  test("renders relative last-run time", () => {
    const out = renderStatus(sample);
    expect(out).toContain("1s ago");
    expect(out).toContain("10s ago");
  });

  test("emits ANSI codes when useColor is true", () => {
    const out = renderStatus({ ...sample, useColor: true });
    expect(out).toContain("\x1b[");
  });

  test("renders an em-dash for missing branch and last run", () => {
    const out = renderStatus(sample);
    const bazLine = out.split("\n").find((l) => l.startsWith("  baz")) ?? "";
    expect(bazLine).toContain("—");
  });

  test("handles a milestone with no features", () => {
    const noFeatures = { ...sample, features: [] };
    const out = renderStatus(noFeatures);
    expect(out).toContain("(no features)");
  });
});
