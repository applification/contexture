/**
 * Pure emitter for optional AGENTS.md guidance. Contexture does not write this
 * automatically; callers may expose it as copyable integration guidance.
 */

import { emit as emitClaudeMd } from './emit-claude-md';

export function emit(projectName: string): string {
  return emitClaudeMd(projectName);
}
