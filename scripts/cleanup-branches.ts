#!/usr/bin/env bun
/**
 * Interactive cleanup of merged/closed branches and orphan worktrees.
 *
 * Run via: bun run cleanup
 */

import { readdir, rm } from 'node:fs/promises';

type PrState = 'MERGED' | 'CLOSED' | 'OPEN' | 'NONE' | 'UNKNOWN';

type Category = 'merged' | 'merged-via-squash' | 'closed-unmerged';

type Candidate = {
  branch: string;
  hasLocal: boolean;
  hasRemote: boolean;
  mergedIntoMain: boolean;
  prState: PrState;
  prNumber?: number;
  prUrl?: string;
  category: Category;
};

async function sh(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { code, stdout, stderr };
}

async function shOk(args: string[]): Promise<string> {
  const { code, stdout, stderr } = await sh(args);
  if (code !== 0) throw new Error(`${args.join(' ')} exited ${code}: ${stderr}`);
  return stdout;
}

async function currentBranch(): Promise<string> {
  return (await shOk(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])).trim();
}

async function workingTreeDirty(): Promise<boolean> {
  const { stdout } = await sh(['git', 'status', '--porcelain']);
  return stdout.trim().length > 0;
}

async function listLocalBranches(): Promise<string[]> {
  const out = await shOk(['git', 'for-each-ref', '--format=%(refname:short)', 'refs/heads/']);
  return out.split('\n').filter(Boolean);
}

async function listRemoteBranches(): Promise<string[]> {
  const out = await shOk([
    'git',
    'for-each-ref',
    '--format=%(refname:short)',
    'refs/remotes/origin/',
  ]);
  return out
    .split('\n')
    .filter(Boolean)
    .map((r) => r.replace(/^origin\//, ''))
    .filter((r) => r !== 'HEAD');
}

type WorktreeEntry = { path: string; branch: string | null };

async function listWorktrees(): Promise<WorktreeEntry[]> {
  const out = await shOk(['git', 'worktree', 'list', '--porcelain']);
  const entries: WorktreeEntry[] = [];
  let path: string | null = null;
  let branch: string | null = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (path !== null) entries.push({ path, branch });
      path = line.slice('worktree '.length);
      branch = null;
    } else if (line.startsWith('branch ')) {
      branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    } else if (line === 'detached') {
      branch = null;
    }
  }
  if (path !== null) entries.push({ path, branch });
  return entries;
}

async function clearSandcastleLogs(): Promise<number> {
  const dir = '.sandcastle/logs';
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of entries) {
    const p = `${dir}/${name}`;
    try {
      await rm(p, { recursive: true, force: true });
      removed++;
    } catch (e) {
      console.error(`  ${RED}✗ failed to remove ${p}: ${e}${RESET}`);
    }
  }
  return removed;
}

async function isMerged(ref: string): Promise<boolean> {
  const { code } = await sh(['git', 'merge-base', '--is-ancestor', ref, 'origin/main']);
  return code === 0;
}

type GhPr = { number: number; state: string; url: string; headRefName: string };

type PrLookup = (branch: string) => { state: PrState; pr?: GhPr };

async function buildPrLookup(): Promise<PrLookup> {
  // Pull every PR (any state) once; map by head branch name. Keep the most
  // recent one per branch (gh returns newest first). For branches whose PR is
  // not in the default page, fall back to a per-branch query.
  const { code, stdout, stderr } = await sh([
    'gh',
    'pr',
    'list',
    '--state',
    'all',
    '--limit',
    '1000',
    '--json',
    'number,state,url,headRefName',
  ]);
  const map = new Map<string, GhPr>();
  if (code !== 0) {
    console.warn(`! gh pr list failed: ${stderr.trim()} — falling back to per-branch lookup`);
  } else {
    try {
      for (const pr of JSON.parse(stdout) as GhPr[]) {
        if (!map.has(pr.headRefName)) map.set(pr.headRefName, pr);
      }
    } catch (e) {
      console.warn(`! could not parse gh output: ${e}`);
    }
  }
  return (branch: string) => {
    const pr = map.get(branch);
    if (!pr) return { state: 'NONE' };
    const s = pr.state.toUpperCase();
    if (s === 'MERGED' || s === 'CLOSED' || s === 'OPEN') return { state: s, pr };
    return { state: 'UNKNOWN', pr };
  };
}

function classify(mergedIntoMain: boolean, prState: PrState): Category | null {
  if (mergedIntoMain) return 'merged';
  if (prState === 'MERGED') return 'merged-via-squash';
  if (prState === 'CLOSED') return 'closed-unmerged';
  return null;
}

async function prompt(question: string): Promise<string> {
  process.stdout.write(question);
  const reader = Bun.stdin.stream().getReader();
  let buf = '';
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const nl = buf.indexOf('\n');
    if (nl !== -1) {
      reader.releaseLock();
      return buf.slice(0, nl).trim().toLowerCase();
    }
  }
  reader.releaseLock();
  return buf.trim().toLowerCase();
}

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';

async function main() {
  console.log('Fetching origin and pruning stale remote refs...');
  await sh(['git', 'fetch', '--prune', 'origin']);

  console.log('Loading PR list from GitHub...');
  const ghPrFor = await buildPrLookup();

  const cur = await currentBranch();
  const dirty = await workingTreeDirty();
  if (dirty && cur !== 'main') {
    console.error(
      `${RED}Working tree is dirty on ${cur}.${RESET} Commit/stash before running cleanup.`,
    );
    process.exit(1);
  }

  const worktrees = await listWorktrees();
  const branchesInWorktrees = new Set(
    worktrees.map((w) => w.branch).filter((b): b is string => b !== null),
  );

  const local = new Set(await listLocalBranches());
  const remote = new Set(await listRemoteBranches());
  const allBranches = new Set([...local, ...remote]);

  // Exclusions
  const skipNames = new Set(['main', 'HEAD', cur]);
  for (const name of skipNames) allBranches.delete(name);

  console.log(
    `\nScanning ${allBranches.size} branch(es). Excluded: main, current branch (${cur}), ${branchesInWorktrees.size} worktree-attached.\n`,
  );

  const candidates: Candidate[] = [];
  const skippedNoPr: string[] = [];
  const skippedOpen: string[] = [];
  const skippedUnknown: string[] = [];

  for (const branch of [...allBranches].sort()) {
    if (branchesInWorktrees.has(branch)) continue;

    const hasLocal = local.has(branch);
    const hasRemote = remote.has(branch);
    const ref = hasLocal ? branch : `origin/${branch}`;

    const merged = await isMerged(ref);
    const { state, pr } = ghPrFor(branch);

    if (state === 'OPEN') {
      skippedOpen.push(`${branch} (PR #${pr?.number} open)`);
      continue;
    }
    if (state === 'UNKNOWN') {
      skippedUnknown.push(branch);
      continue;
    }

    const category = classify(merged, state);
    if (category === null) {
      skippedNoPr.push(branch);
      continue;
    }

    candidates.push({
      branch,
      hasLocal,
      hasRemote,
      mergedIntoMain: merged,
      prState: state,
      prNumber: pr?.number,
      prUrl: pr?.url,
      category,
    });
  }

  if (candidates.length === 0) {
    console.log(`${GREEN}No deletion candidates.${RESET}\n`);
  } else {
    console.log(`${BOLD}${candidates.length} candidate branch(es) for deletion:${RESET}\n`);
  }

  let deletedLocal = 0;
  let deletedRemote = 0;
  let skipped = 0;
  let errors = 0;
  let aborted = false;

  for (const c of candidates) {
    if (aborted) break;

    const catColor =
      c.category === 'merged' ? GREEN : c.category === 'merged-via-squash' ? CYAN : YELLOW;
    console.log(`${BOLD}${c.branch}${RESET}`);
    if (c.prNumber) console.log(`  PR #${c.prNumber}: ${c.prState} — ${c.prUrl}`);
    else console.log(`  PR: ${c.prState}`);
    console.log(
      `  Local: ${c.hasLocal ? 'yes' : 'no'}  Remote: ${c.hasRemote ? 'yes' : 'no'}  ` +
        `Merged-into-main: ${c.mergedIntoMain ? 'yes' : 'no'}  ` +
        `Category: ${catColor}${c.category}${RESET}`,
    );

    const targets: string[] = [];
    if (c.hasLocal) targets.push('local');
    if (c.hasRemote) targets.push('remote');
    const ans = await prompt(`  Delete ${targets.join(' + ')}? [y/N/q] `);
    if (ans === 'q') {
      aborted = true;
      console.log(`${YELLOW}Aborted by user.${RESET}`);
      break;
    }
    if (ans !== 'y') {
      skipped++;
      console.log(`  ${DIM}skipped${RESET}\n`);
      continue;
    }

    if (c.hasLocal) {
      const { code, stderr } = await sh(['git', 'branch', '-D', c.branch]);
      if (code === 0) {
        deletedLocal++;
        console.log(`  ${GREEN}✓ deleted local${RESET}`);
      } else {
        errors++;
        console.error(`  ${RED}✗ local delete failed: ${stderr.trim()}${RESET}`);
      }
    }
    if (c.hasRemote) {
      const { code, stderr } = await sh(['git', 'push', 'origin', '--delete', c.branch]);
      if (code === 0) {
        deletedRemote++;
        console.log(`  ${GREEN}✓ deleted remote${RESET}`);
      } else {
        errors++;
        console.error(`  ${RED}✗ remote delete failed: ${stderr.trim()}${RESET}`);
      }
    }
    console.log();
  }

  // Worktree cleanup pass
  let worktreesRemoved = 0;
  const orphanWorktrees = worktrees.filter(
    (w) => w.path !== process.cwd() && w.path.includes('/.sandcastle/worktrees/'),
  );

  if (orphanWorktrees.length > 0 && !aborted) {
    console.log(`${BOLD}Worktrees under .sandcastle/worktrees/:${RESET}\n`);
    for (const wt of orphanWorktrees) {
      let prInfo = 'no branch';
      let safeToRemove = false;
      if (wt.branch) {
        const { state, pr } = ghPrFor(wt.branch);
        if (state === 'OPEN') {
          console.log(`${BOLD}${wt.path}${RESET}`);
          console.log(`  branch: ${wt.branch}  PR #${pr?.number} OPEN — keeping\n`);
          continue;
        }
        prInfo = `PR ${state}${pr ? ` #${pr.number}` : ''}`;
        safeToRemove = state === 'MERGED' || state === 'CLOSED' || state === 'NONE';
      } else {
        safeToRemove = true;
      }

      console.log(`${BOLD}${wt.path}${RESET}`);
      console.log(`  branch: ${wt.branch ?? '(detached)'}  ${prInfo}`);
      if (!safeToRemove) {
        console.log(`  ${DIM}skipping (PR state unknown)${RESET}\n`);
        continue;
      }
      const ans = await prompt(`  Remove worktree? [y/N/q] `);
      if (ans === 'q') {
        aborted = true;
        break;
      }
      if (ans !== 'y') {
        console.log(`  ${DIM}skipped${RESET}\n`);
        continue;
      }
      const r1 = await sh(['git', 'worktree', 'remove', wt.path]);
      if (r1.code === 0) {
        worktreesRemoved++;
        console.log(`  ${GREEN}✓ removed${RESET}\n`);
        continue;
      }
      console.warn(`  worktree dirty or busy: ${r1.stderr.trim()}`);
      const force = await prompt(`  Force remove (discards uncommitted changes)? [y/N] `);
      if (force === 'y') {
        const r2 = await sh(['git', 'worktree', 'remove', '--force', wt.path]);
        if (r2.code === 0) {
          worktreesRemoved++;
          console.log(`  ${GREEN}✓ force-removed${RESET}\n`);
        } else {
          errors++;
          console.error(`  ${RED}✗ force remove failed: ${r2.stderr.trim()}${RESET}\n`);
        }
      } else {
        console.log(`  ${DIM}skipped${RESET}\n`);
      }
    }
    await sh(['git', 'worktree', 'prune']);
  }

  const logsRemoved = await clearSandcastleLogs();
  if (logsRemoved > 0) {
    console.log(
      `${GREEN}Cleared ${logsRemoved} entr${logsRemoved === 1 ? 'y' : 'ies'} from .sandcastle/logs/${RESET}\n`,
    );
  }

  console.log(`${BOLD}Summary${RESET}`);
  console.log(`  Local branches deleted:  ${deletedLocal}`);
  console.log(`  Remote branches deleted: ${deletedRemote}`);
  console.log(`  Worktrees removed:       ${worktreesRemoved}`);
  console.log(`  Logs cleared:            ${logsRemoved}`);
  console.log(`  Skipped (this session):  ${skipped}`);
  console.log(`  Errors:                  ${errors}`);
  if (skippedOpen.length > 0) {
    console.log(`\n${DIM}Skipped — open PR (${skippedOpen.length}):${RESET}`);
    for (const b of skippedOpen) console.log(`  ${b}`);
  }
  if (skippedNoPr.length > 0) {
    console.log(`\n${DIM}Skipped — no PR, not merged (${skippedNoPr.length}):${RESET}`);
    for (const b of skippedNoPr) console.log(`  ${b}`);
  }
  if (skippedUnknown.length > 0) {
    console.log(`\n${DIM}Skipped — gh lookup failed (${skippedUnknown.length}):${RESET}`);
    for (const b of skippedUnknown) console.log(`  ${b}`);
  }
}

await main();
