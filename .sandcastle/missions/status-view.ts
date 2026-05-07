type FeatureStatus = "todo" | "planned" | "running" | "review" | "blocked" | "done";
type MilestoneStatus = "todo" | "running" | "validating" | "done" | "blocked";
type MissionStatus = "planning" | "running" | "paused" | "done" | "failed";

export type StatusViewMission = {
  slug: string;
  title: string;
  status: MissionStatus;
  updatedAt: number;
};

export type StatusViewMilestone = {
  id: string;
  order: number;
  title: string;
  status: MilestoneStatus;
};

export type StatusViewFeature = {
  id: string;
  milestoneId: string;
  slug: string;
  title: string;
  status: FeatureStatus;
  branch?: string;
  fixerAttempts: number;
  lastRunAt?: number;
};

export type StatusViewInput = {
  mission: StatusViewMission;
  milestones: StatusViewMilestone[];
  features: StatusViewFeature[];
  now: number;
  useColor: boolean;
};

const RESET = "\x1b[0m";
const COLORS = {
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
} as const;

function color(text: string, code: keyof typeof COLORS, useColor: boolean): string {
  return useColor ? `${COLORS[code]}${text}${RESET}` : text;
}

function visibleLength(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function pad(s: string, width: number): string {
  const len = visibleLength(s);
  return len >= width ? s : s + " ".repeat(width - len);
}

const FEATURE_STATUS_COLOR: Record<FeatureStatus, keyof typeof COLORS> = {
  todo: "gray",
  planned: "gray",
  running: "yellow",
  review: "blue",
  blocked: "red",
  done: "green",
};

const MILESTONE_STATUS_COLOR: Record<MilestoneStatus, keyof typeof COLORS> = {
  todo: "gray",
  running: "yellow",
  validating: "blue",
  done: "green",
  blocked: "red",
};

const MISSION_STATUS_COLOR: Record<MissionStatus, keyof typeof COLORS> = {
  planning: "cyan",
  running: "yellow",
  paused: "gray",
  done: "green",
  failed: "red",
};

function formatRelative(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export function renderStatus(input: StatusViewInput): string {
  const { mission, milestones, features, now, useColor } = input;
  const lines: string[] = [];

  const title = color(mission.title, "bold", useColor);
  const status = color(mission.status, MISSION_STATUS_COLOR[mission.status], useColor);
  lines.push(`${title} (${mission.slug}) — ${status}`);
  lines.push("");

  const sortedMilestones = [...milestones].sort((a, b) => a.order - b.order);

  for (const m of sortedMilestones) {
    const ms = color(`[${m.status}]`, MILESTONE_STATUS_COLOR[m.status], useColor);
    lines.push(`${color(m.title, "bold", useColor)} ${ms}`);

    const milestoneFeatures = features.filter((f) => f.milestoneId === m.id);
    if (milestoneFeatures.length === 0) {
      lines.push(color("  (no features)", "gray", useColor));
      lines.push("");
      continue;
    }

    const rows = milestoneFeatures.map((f) => ({
      slug: f.slug,
      title: f.title,
      status: color(f.status, FEATURE_STATUS_COLOR[f.status], useColor),
      branch: f.branch ?? color("—", "gray", useColor),
      fixers: String(f.fixerAttempts),
      lastRun: f.lastRunAt ? formatRelative(now - f.lastRunAt) : color("—", "gray", useColor),
    }));

    const widths = {
      slug: Math.max(4, ...rows.map((r) => visibleLength(r.slug))),
      title: Math.max(5, ...rows.map((r) => visibleLength(r.title))),
      status: Math.max(6, ...rows.map((r) => visibleLength(r.status))),
      branch: Math.max(6, ...rows.map((r) => visibleLength(r.branch))),
      fixers: Math.max(3, ...rows.map((r) => visibleLength(r.fixers))),
      lastRun: Math.max(8, ...rows.map((r) => visibleLength(r.lastRun))),
    };

    const header = [
      pad(color("slug", "bold", useColor), widths.slug),
      pad(color("title", "bold", useColor), widths.title),
      pad(color("status", "bold", useColor), widths.status),
      pad(color("branch", "bold", useColor), widths.branch),
      pad(color("fix", "bold", useColor), widths.fixers),
      pad(color("last run", "bold", useColor), widths.lastRun),
    ].join("  ");
    lines.push(`  ${header}`);

    for (const r of rows) {
      lines.push(
        `  ${[
          pad(r.slug, widths.slug),
          pad(r.title, widths.title),
          pad(r.status, widths.status),
          pad(r.branch, widths.branch),
          pad(r.fixers, widths.fixers),
          pad(r.lastRun, widths.lastRun),
        ].join("  ")}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
