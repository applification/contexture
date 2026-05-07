import { z } from "zod";

const slug = z
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "slug must be lowercase letters, digits, or hyphens");

export const FeaturePlanSchema = z.object({
  slug,
  title: z.string().min(1),
  prompt: z.string().min(1),
  dependencies: z.array(slug).default([]),
  pathsOwned: z.array(z.string()).default([]),
  preferredAgent: z.enum(["claude", "codex"]).default("claude"),
  skillRefs: z.array(z.string()).default([]),
});

export const MilestonePlanSchema = z.object({
  slug,
  title: z.string().min(1),
  successCriteria: z.array(z.string().min(1)).min(1),
  validationPrompt: z.string().min(1),
  features: z.array(FeaturePlanSchema).min(1),
});

export const MissionPlanSchema = z
  .object({
    slug,
    title: z.string().min(1),
    objective: z.string().min(1),
    milestones: z.array(MilestonePlanSchema).min(1),
  })
  .superRefine((plan, ctx) => {
    const allFeatureSlugs = new Set<string>();
    for (const m of plan.milestones) {
      for (const f of m.features) {
        if (allFeatureSlugs.has(f.slug)) {
          ctx.addIssue({
            code: "custom",
            message: `duplicate feature slug: ${f.slug}`,
            path: ["milestones", m.slug, "features", f.slug],
          });
        }
        allFeatureSlugs.add(f.slug);
      }
    }
    for (const m of plan.milestones) {
      for (const f of m.features) {
        for (const dep of f.dependencies) {
          if (!allFeatureSlugs.has(dep)) {
            ctx.addIssue({
              code: "custom",
              message: `feature ${f.slug} depends on unknown feature: ${dep}`,
              path: ["milestones", m.slug, "features", f.slug, "dependencies"],
            });
          }
        }
      }
    }
  });

export type FeaturePlan = z.infer<typeof FeaturePlanSchema>;
export type MilestonePlan = z.infer<typeof MilestonePlanSchema>;
export type MissionPlan = z.infer<typeof MissionPlanSchema>;
