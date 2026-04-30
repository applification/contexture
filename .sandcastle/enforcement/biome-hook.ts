#!/usr/bin/env bun

// PostToolUse hook for Claude Code. Reads the tool-call payload on stdin,
// runs `biome check --write` on the touched file, and exits silently on
// success. On failure, prints a terse "tool: file:line — rule — message"
// digest to stderr with a non-zero exit so Claude Code injects it back into
// the agent's context.
//
// Stdin payload shape (Claude Code PostToolUse):
//   { tool_name: "Edit"|"Write"|"MultiEdit", tool_input: { file_path: string, ... }, ... }

type BiomeDiagnostic = {
  category?: string;
  description?: string;
  message?: { content?: Array<{ content?: string } | string> | string } | string;
  location?: {
    path?: string;
    start?: { line?: number; column?: number };
  };
  severity?: string;
};

type BiomeReport = {
  diagnostics?: BiomeDiagnostic[];
};

const EXTENSIONS = /\.(ts|tsx|js|jsx|json|jsonc)$/;

async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of Bun.stdin.stream()) chunks.push(chunk);
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function extractFilePath(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const input = (payload as { tool_input?: unknown }).tool_input;
  if (typeof input !== 'object' || input === null) return null;
  const fp = (input as { file_path?: unknown }).file_path;
  return typeof fp === 'string' ? fp : null;
}

function messageText(d: BiomeDiagnostic): string {
  const m = d.message;
  if (typeof m === 'string') return m;
  if (m && typeof m === 'object' && m.content) {
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.content)) {
      return m.content
        .map((c) => (typeof c === 'string' ? c : (c?.content ?? '')))
        .join('')
        .trim();
    }
  }
  return d.description ?? 'unknown error';
}

function formatDiagnostic(filePath: string, d: BiomeDiagnostic): string {
  const line = d.location?.start?.line ?? '?';
  const rule = d.category ?? 'unknown';
  const msg = messageText(d).split('\n')[0]?.trim() ?? '';
  return `  ${filePath}:${line} — ${rule} — ${msg}`;
}

async function main(): Promise<void> {
  const raw = await readStdin();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const filePath = extractFilePath(payload);
  if (!filePath || !EXTENSIONS.test(filePath)) process.exit(0);

  const proc = Bun.spawn(['bunx', 'biome', 'check', '--write', '--reporter=json', filePath], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;

  let report: BiomeReport;
  try {
    report = JSON.parse(stdout);
  } catch {
    process.exit(0);
  }

  const errors = (report.diagnostics ?? []).filter((d) => d.severity === 'error');
  if (errors.length === 0) process.exit(0);

  process.stderr.write(`biome check failed for ${filePath}:\n`);
  for (const d of errors) process.stderr.write(`${formatDiagnostic(filePath, d)}\n`);
  process.exit(2);
}

void main();
