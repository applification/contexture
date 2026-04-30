import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EnforcementProvider } from './index';

// Hook command path is resolved relative to the worktree root, which is the
// agent's cwd inside the sandbox. The biome-hook script lives in
// .sandcastle/enforcement/ — committed to the repo, so it's already on disk
// inside every sandbox worktree.
const HOOK_COMMAND = 'bun .sandcastle/enforcement/biome-hook.ts';

const HOOK_BLOCK = {
  PostToolUse: [
    {
      matcher: 'Edit|Write|MultiEdit',
      hooks: [{ type: 'command', command: HOOK_COMMAND }],
    },
  ],
};

// Merge our hook config into whatever .claude/settings.json the worktree
// already has (the repo checks one in). We overwrite `hooks` entirely
// rather than merging field-by-field — there are no other hooks defined,
// and a future contributor adding one will see the conflict explicitly.
export const claudeCodeEnforcement: EnforcementProvider = {
  async install(worktreePath: string): Promise<void> {
    const dir = join(worktreePath, '.claude');
    const file = join(dir, 'settings.json');
    await mkdir(dir, { recursive: true });

    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      // File missing or unreadable — start from empty.
    }

    const merged = { ...existing, hooks: HOOK_BLOCK };
    await writeFile(file, `${JSON.stringify(merged, null, 2)}\n`);
  },
};
