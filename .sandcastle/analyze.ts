import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadBaseline, saveBaseline } from "./analyzer/baseline";
import { bashInsteadOfDedicated } from "./analyzer/detectors/bash-instead-of-dedicated";
import { excessiveExploration } from "./analyzer/detectors/excessive-exploration";
import { failedToolRetry } from "./analyzer/detectors/failed-tool-retry";
import { hardFailure } from "./analyzer/detectors/hard-failure";
import { redundantToolCall } from "./analyzer/detectors/redundant-tool-call";
import { reviewerReReads } from "./analyzer/detectors/reviewer-rereads";
import { runOutlier, updateBaseline } from "./analyzer/detectors/run-outlier";
import type { Event, Finding } from "./analyzer/detectors/types";
import { llmGrade } from "./analyzer/llm-grader";
import { groupByRun, parseStreamLog } from "./analyzer/parse";
import { renderReport } from "./analyzer/report";

const STREAM_LOG_PATH = ".sandcastle/logs/stream.log";
const ANALYSIS_LATEST = ".sandcastle/logs/analysis.md";
const ANALYSIS_ARCHIVE_DIR = ".sandcastle/logs/analysis";
const BASELINE_PATH = ".sandcastle/logs/baseline.json";

type Args = {
  llm: boolean;
  logPath: string;
};

function parseArgs(argv: readonly string[]): Args {
  let llm = false;
  let logPath = STREAM_LOG_PATH;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--llm") llm = true;
    else if (arg === "--log" && i + 1 < argv.length) {
      logPath = argv[++i] ?? logPath;
    }
  }
  return { llm, logPath };
}

async function main(): Promise<void> {
  const { llm, logPath } = parseArgs(process.argv.slice(2));

  if (!existsSync(logPath)) {
    console.log(`No stream log at ${logPath}; nothing to analyze.`);
    return;
  }

  const events = parseStreamLog(logPath);
  const runs = groupByRun(events);
  if (runs.length === 0) {
    console.log("Empty stream log; nothing to analyze.");
    return;
  }

  // Always analyse the most recent run; baselines aggregate across all runs
  // in the file (and across previous baseline.json state).
  const latestRun = runs[runs.length - 1];
  if (!latestRun) return;
  const runEvents = latestRun.events;

  const baseline = loadBaseline(BASELINE_PATH);

  const findings: Finding[] = [
    ...redundantToolCall.run(runEvents),
    ...failedToolRetry.run(runEvents),
    ...bashInsteadOfDedicated.run(runEvents),
    ...excessiveExploration.run(runEvents),
    ...reviewerReReads.run(runEvents),
    ...hardFailure.run(runEvents),
    ...runOutlier(runEvents, baseline),
  ];

  if (llm) {
    try {
      const llmFindings = await llmGrade(runEvents);
      findings.push(...llmFindings);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`LLM grading failed: ${msg}`);
    }
  }

  const report = renderReport({
    runId: latestRun.runId,
    events: runEvents,
    findings,
    generatedAt: new Date().toISOString(),
  });

  ensureDir(ANALYSIS_LATEST);
  ensureDir(`${ANALYSIS_ARCHIVE_DIR}/.x`);
  writeFileSync(ANALYSIS_LATEST, report);
  writeFileSync(`${ANALYSIS_ARCHIVE_DIR}/${latestRun.runId}.md`, report);

  // Update baseline with this run's measurements after analysis (so the
  // current run isn't graded against itself).
  saveBaseline(BASELINE_PATH, updateBaseline(baseline, runEvents));

  printStdoutSummary(latestRun.runId, findings);
}

function printStdoutSummary(runId: string, findings: readonly Finding[]): void {
  const sorted = [...findings].sort((a, b) => {
    if (b.wastedToolCalls !== a.wastedToolCalls) return b.wastedToolCalls - a.wastedToolCalls;
    return b.wastedSeconds - a.wastedSeconds;
  });
  const totalCalls = findings.reduce((s, f) => s + f.wastedToolCalls, 0);
  const totalSecs = findings.reduce((s, f) => s + f.wastedSeconds, 0);
  console.log(`\nSandcastle analysis (${runId})`);
  console.log(`  ${findings.length} finding${findings.length === 1 ? "" : "s"}, ~${totalCalls} wasted call${totalCalls === 1 ? "" : "s"}, ~${Math.round(totalSecs)}s`);
  for (const f of sorted.slice(0, 3)) {
    console.log(`  - [${f.detector}] ${f.message} (${f.agentName}, ~${Math.round(f.wastedSeconds)}s)`);
  }
  console.log(`  Full report: ${ANALYSIS_LATEST}`);
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

await main();
