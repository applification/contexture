import type { AgentSpec } from "../harness";
import { claudeCodeEnforcement } from "./claudeCode";

// A provider-specific enforcement layer. `install` writes config files into
// the sandbox worktree so the in-container agent runs the hooks. Returning
// `null` from `enforcementFor` is the no-op: providers without a usable
// hook surface skip enforcement (asymmetric across providers, by design).
export type EnforcementProvider = {
  install(worktreePath: string): Promise<void>;
};

export function enforcementFor(spec: AgentSpec): EnforcementProvider | null {
  switch (spec.provider) {
    case "claudeCode":
      return claudeCodeEnforcement;
    case "codex":
    case "opencode":
    case "pi":
      return null;
  }
}
