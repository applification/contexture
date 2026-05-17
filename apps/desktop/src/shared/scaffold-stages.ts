export type AppKind = 'web' | 'mobile' | 'desktop';

/**
 * Fixed stage numbers for the New Project scaffolder. Kept in shared
 * code because both main and renderer need the vocabulary, while only
 * main owns execution.
 */
export const STAGE = {
  TURBO_SKELETON: 1,
  WEB_NEXT: 2,
  WEB_SHADCN: 3,
  MOBILE_EXPO: 4,
  DESKTOP_ELECTRON: 5,
  CONVEX_INIT: 6,
  SCHEMA_PACKAGE: 7,
  CONVEX_EMIT: 8,
  WORKSPACE_STITCH: 9,
  BUN_INSTALL: 10,
  LLM_SEED: 11,
} as const;

export type StageNumber = (typeof STAGE)[keyof typeof STAGE];

/** Derive the ordered stage list for a given app selection. */
export function deriveStages(apps: AppKind[]): StageNumber[] {
  const stages: StageNumber[] = [STAGE.TURBO_SKELETON];
  if (apps.includes('web')) {
    stages.push(STAGE.WEB_NEXT, STAGE.WEB_SHADCN);
  }
  if (apps.includes('mobile')) {
    stages.push(STAGE.MOBILE_EXPO);
  }
  if (apps.includes('desktop')) {
    stages.push(STAGE.DESKTOP_ELECTRON);
  }
  stages.push(
    STAGE.CONVEX_INIT,
    STAGE.SCHEMA_PACKAGE,
    STAGE.CONVEX_EMIT,
    STAGE.WORKSPACE_STITCH,
    STAGE.BUN_INSTALL,
    STAGE.LLM_SEED,
  );
  return stages;
}
