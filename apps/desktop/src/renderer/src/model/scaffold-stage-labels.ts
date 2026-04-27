/**
 * Short, user-facing labels for scaffolder stages. Kept in the
 * renderer because only the UI needs them; main-side code works with
 * stage numbers directly.
 */
import { STAGE } from '@main/scaffold/scaffold-project';

export const SCAFFOLD_STAGE_LABELS: Readonly<Record<number, string>> = {
  [STAGE.TURBO_SKELETON]: 'Scaffolding monorepo',
  [STAGE.WEB_NEXT]: 'Installing Next.js',
  [STAGE.WEB_SHADCN]: 'Adding shadcn/ui',
  [STAGE.MOBILE_EXPO]: 'Installing Expo (React Native)',
  [STAGE.DESKTOP_ELECTRON]: 'Installing Electron (Forge)',
  [STAGE.CONVEX_INIT]: 'Provisioning Convex',
  [STAGE.SCHEMA_PACKAGE]: 'Emitting schema package',
  [STAGE.CONVEX_EMIT]: 'Emitting Convex schema + seeds',
  [STAGE.WORKSPACE_STITCH]: 'Stitching workspace + CLAUDE.md',
  [STAGE.BUN_INSTALL]: 'Installing dependencies',
  [STAGE.LLM_SEED]: 'Seeding initial IR',
};

export function labelForStage(stage: number): string {
  return SCAFFOLD_STAGE_LABELS[stage] ?? `Stage ${stage}`;
}
