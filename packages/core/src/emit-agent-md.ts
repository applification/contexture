/**
 * Pure emitter for the root `AGENTS.md` that Contexture writes once at
 * project-scaffold time. Codex and other AGENTS.md-aware coding agents
 * read it on first open to learn the same source-of-truth rule as
 * `CLAUDE.md`.
 *
 * After the initial emit the file is user-owned; Contexture never
 * regenerates it, and the output intentionally carries no
 * `@contexture-generated` banner so the drift detector ignores it.
 */

import { emit as emitClaudeMd } from './emit-claude-md';

export function emit(projectName: string): string {
  return emitClaudeMd(projectName);
}
