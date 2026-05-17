/**
 * Pure emitter for optional agent guidance text. Contexture does not write this
 * automatically during Document bundle open/initialize; callers may expose it
 * as copyable integration guidance.
 */

const TEMPLATE = `# {{PROJECT_NAME}}

Contexture is the source of truth for this domain model.

## Source of truth

Keep the canonical IR in \`{{PROJECT_NAME}}.contexture.json\`. Generated targets
such as Zod, JSON Schema, Convex schema, schema indexes, MCP definitions,
structured outputs, and form validators are derived from that IR.

Do not edit generated files directly. To change the model, use Contexture's
desktop app, CLI, or MCP tools to apply Contexture Ops, then validate and emit:

\`\`\`
contexture validate --json
contexture emit --json
contexture check-generated --json
\`\`\`

If a generated file has been hand-edited, use Contexture drift/reconcile instead
of overwriting it blindly.

## Agent integration

- Inspect the existing repo before choosing integration points.
- Wire generated outputs only where they match the app's actual framework.
- Configure the Contexture MCP server where supported.
- Preserve the IR/generated-file contract.
- Report framework-specific uncertainty instead of guessing.
`;

export function emit(projectName: string): string {
  return TEMPLATE.replaceAll('{{PROJECT_NAME}}', projectName);
}
