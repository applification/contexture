import { type MissionPlan, MissionPlanSchema } from "./schema";

const MAX_PLANNER_RETRIES = 1;

export type PlannerResult =
  | { ok: true; plan: MissionPlan; rawResponse?: string }
  | { ok: false; error: string; rawResponse?: string };

type ClaudePrintResponse = {
  type: "result";
  result?: string;
  is_error?: boolean;
};

function extractJsonBlock(text: string): string | null {
  const fence = /```json\s*\n([\s\S]*?)\n```/m.exec(text);
  if (fence) return fence[1];
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  return null;
}

async function runClaude(
  prompt: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn(["claude", "-p", "--output-format", "json", prompt], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { stdout, stderr, code };
}

function buildPrompt(objective: string, retryFeedback?: string): string {
  let prompt = `/mission-plan ${objective}`;
  if (retryFeedback) {
    prompt += `\n\nThe previous plan failed validation:\n${retryFeedback}\n\nEmit a corrected plan.`;
  }
  return prompt;
}

export async function planMission(objective: string): Promise<PlannerResult> {
  let retryFeedback: string | undefined;

  for (let attempt = 0; attempt <= MAX_PLANNER_RETRIES; attempt++) {
    const prompt = buildPrompt(objective, retryFeedback);
    const { stdout, stderr, code } = await runClaude(prompt);

    if (code !== 0) {
      return {
        ok: false,
        error: `claude CLI exited with code ${code}: ${stderr.trim() || stdout.slice(0, 500)}`,
      };
    }

    let parsed: ClaudePrintResponse;
    try {
      parsed = JSON.parse(stdout) as ClaudePrintResponse;
    } catch (err) {
      return {
        ok: false,
        error: `claude CLI did not return valid JSON: ${(err as Error).message}`,
        rawResponse: stdout.slice(0, 500),
      };
    }

    if (parsed.is_error || !parsed.result) {
      return { ok: false, error: parsed.result ?? "claude CLI returned an error" };
    }

    const block = extractJsonBlock(parsed.result);
    if (!block) {
      retryFeedback = "Your response did not contain a ```json fenced code block with the plan.";
      continue;
    }

    let planJson: unknown;
    try {
      planJson = JSON.parse(block);
    } catch (err) {
      retryFeedback = `The JSON code block is not valid JSON: ${(err as Error).message}`;
      continue;
    }

    const result = MissionPlanSchema.safeParse(planJson);
    if (!result.success) {
      retryFeedback = `The plan failed schema validation:\n${result.error.issues
        .map((i) => `- ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`;
      continue;
    }

    return { ok: true, plan: result.data, rawResponse: parsed.result };
  }

  return {
    ok: false,
    error: `Planner failed after ${MAX_PLANNER_RETRIES + 1} attempts. Last feedback: ${retryFeedback}`,
  };
}

export async function readPlanFromFile(path: string): Promise<PlannerResult> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return { ok: false, error: `File not found: ${path}` };
  }
  const text = await file.text();
  const block = extractJsonBlock(text) ?? text;

  let planJson: unknown;
  try {
    planJson = JSON.parse(block);
  } catch (err) {
    return { ok: false, error: `File does not contain valid JSON: ${(err as Error).message}` };
  }
  const result = MissionPlanSchema.safeParse(planJson);
  if (!result.success) {
    return {
      ok: false,
      error: `Plan failed schema validation:\n${result.error.issues
        .map((i) => `- ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`,
    };
  }
  return { ok: true, plan: result.data };
}
