import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Baseline } from "./detectors/run-outlier";
import { emptyBaseline } from "./detectors/run-outlier";

// Read the rolling baseline from disk. Missing or unparseable file is
// treated as "no history yet"; we don't crash on a corrupt baseline because
// the analyzer is best-effort.
export function loadBaseline(path: string): Baseline {
  if (!existsSync(path)) return emptyBaseline();
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as Baseline;
    if (parsed && typeof parsed === "object" && parsed.byPhase) return parsed;
    return emptyBaseline();
  } catch {
    return emptyBaseline();
  }
}

export function saveBaseline(path: string, baseline: Baseline): void {
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`);
}
