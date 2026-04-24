/**
 * Short, user-facing labels for the ten scaffolder stages. Kept in the
 * renderer because only the UI needs them; main-side code works with
 * stage numbers directly.
 */
export const SCAFFOLD_STAGE_LABELS: Readonly<Record<number, string>> = {
  1: 'Scaffolding monorepo (Turborepo)',
  2: 'Removing default web app',
  3: 'Installing Next.js',
  4: 'Adding shadcn/ui',
  5: 'Provisioning Convex',
  6: 'Emitting schema package',
  7: 'Emitting Convex schema + seeds',
  8: 'Stitching workspace + CLAUDE.md',
  9: 'Installing dependencies',
  10: 'Seeding initial IR',
};

export function labelForStage(stage: number): string {
  return SCAFFOLD_STAGE_LABELS[stage] ?? `Stage ${stage}`;
}
