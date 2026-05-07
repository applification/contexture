import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export type AgentRole = "worker" | "reviewer" | "fixer" | "validator" | "replanner";

export type RunAgentArgs = {
  role: AgentRole;
  missionId: string;
  missionSlug: string;
  milestoneId?: string;
  featureId?: string;
  featureSlug?: string;
  branch: string;
  baseBranch?: string;
  promptArgs: Record<string, string>;
  preferredAgent?: "claude" | "codex";
};

export type RunAgentResult = {
  outcome: "success" | "failure" | "aborted";
  commits: number;
  completionSignal?: string;
  logUri?: string;
};

async function spawnGit(args: string[], cwd: string): Promise<{ stdout: string; code: number }> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;
  return { stdout, code };
}

async function gitOrThrow(args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`git ${args.join(" ")} failed (exit ${code}): ${stderr.trim()}`);
  }
  return stdout;
}

async function runStubWorker(args: RunAgentArgs, repoRoot: string): Promise<RunAgentResult> {
  if (!args.featureSlug || !args.featureId) {
    throw new Error("worker role requires featureSlug and featureId");
  }

  const worktreesDir = join(repoRoot, ".sandcastle", "worktrees");
  await mkdir(worktreesDir, { recursive: true });
  const worktreePath = join(worktreesDir, `${args.missionSlug}-${args.featureSlug}`);

  const baseBranch = args.baseBranch ?? "main";
  const existing = await spawnGit(["rev-parse", "--verify", args.branch], repoRoot);
  if (existing.code === 0) {
    await gitOrThrow(["worktree", "add", worktreePath, args.branch], repoRoot);
  } else {
    await gitOrThrow(
      ["worktree", "add", "-b", args.branch, worktreePath, baseBranch],
      repoRoot,
    );
  }

  try {
    const readmePath = join(worktreePath, "README.md");
    const file = Bun.file(readmePath);
    const existingContent = (await file.exists()) ? await file.text() : "";
    const stamp = `\n<!-- mission: ${args.missionSlug}, feature: ${args.featureSlug}, ts: ${Date.now()} -->\n`;
    await Bun.write(readmePath, existingContent + stamp);

    await gitOrThrow(["add", "README.md"], worktreePath);
    await gitOrThrow(
      ["commit", "-m", `stub: ${args.missionSlug}/${args.featureSlug}`],
      worktreePath,
    );
    await gitOrThrow(["push", "-u", "origin", args.branch], worktreePath);

    return {
      outcome: "success",
      commits: 1,
      completionSignal: "<promise>COMPLETE</promise>",
    };
  } finally {
    await spawnGit(["worktree", "remove", worktreePath, "--force"], repoRoot);
  }
}

export async function runAgent(args: RunAgentArgs): Promise<RunAgentResult> {
  const repoRoot = process.cwd();

  switch (args.role) {
    case "worker":
      return await runStubWorker(args, repoRoot);
    case "reviewer":
    case "fixer":
    case "validator":
    case "replanner":
      throw new Error(`runAgent role "${args.role}" is not implemented in slice 1`);
  }
}
