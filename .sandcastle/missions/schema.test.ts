import { describe, expect, test } from "bun:test";
import { MissionPlanSchema } from "./schema";

const validPlan = {
  slug: "convex-ir",
  title: "Bring up Convex emit IR",
  objective: "Generate Convex schemas from IR",
  milestones: [
    {
      slug: "m1",
      title: "Schema emit",
      successCriteria: ["Tables emitted", "Indexes match IR"],
      validationPrompt: "Run bun run typecheck and confirm no errors.",
      features: [
        {
          slug: "f1",
          title: "Emit schema.ts",
          prompt: "Add an emitter for schema.ts",
          dependencies: [],
          pathsOwned: ["packages/core/src/emit-convex/**"],
          preferredAgent: "claude",
          skillRefs: ["backend"],
        },
        {
          slug: "f2",
          title: "Emit per-table CRUD",
          prompt: "Generate CRUD functions",
          dependencies: ["f1"],
          pathsOwned: ["packages/core/src/emit-convex/crud/**"],
          preferredAgent: "claude",
          skillRefs: [],
        },
      ],
    },
  ],
};

describe("MissionPlanSchema", () => {
  test("accepts a valid plan and applies defaults", () => {
    const minimal = {
      slug: "min",
      title: "Min",
      objective: "Minimal",
      milestones: [
        {
          slug: "m1",
          title: "M1",
          successCriteria: ["ok"],
          validationPrompt: "check",
          features: [
            { slug: "f1", title: "F1", prompt: "do thing" },
          ],
        },
      ],
    };
    const parsed = MissionPlanSchema.parse(minimal);
    expect(parsed.milestones[0].features[0].dependencies).toEqual([]);
    expect(parsed.milestones[0].features[0].preferredAgent).toBe("claude");
  });

  test("accepts a fully-specified plan", () => {
    const parsed = MissionPlanSchema.parse(validPlan);
    expect(parsed.milestones).toHaveLength(1);
    expect(parsed.milestones[0].features[1].dependencies).toEqual(["f1"]);
  });

  test("rejects duplicate feature slugs", () => {
    const broken = structuredClone(validPlan);
    broken.milestones[0].features[1].slug = "f1";
    const result = MissionPlanSchema.safeParse(broken);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((i) => i.message.includes("duplicate feature slug"))).toBe(
      true,
    );
  });

  test("rejects unknown dependency slug", () => {
    const broken = structuredClone(validPlan);
    broken.milestones[0].features[1].dependencies = ["ghost"];
    const result = MissionPlanSchema.safeParse(broken);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      result.error.issues.some((i) => i.message.includes("unknown feature: ghost")),
    ).toBe(true);
  });

  test("rejects empty milestones array", () => {
    const broken = { ...validPlan, milestones: [] };
    expect(MissionPlanSchema.safeParse(broken).success).toBe(false);
  });

  test("rejects invalid slug characters", () => {
    const broken = { ...validPlan, slug: "Has Spaces" };
    expect(MissionPlanSchema.safeParse(broken).success).toBe(false);
  });
});
