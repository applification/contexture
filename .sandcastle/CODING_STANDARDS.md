# Coding Standards

## Style

- PascalCase for types, interfaces, and Zod schemas; camelCase for functions and variables
- Named exports only — no default exports
- Zod schemas and their inferred types are always exported as a pair:
  ```ts
  export const Foo = z.object({ ... });
  export type Foo = z.infer<typeof Foo>;
  ```
- `import type` for type-only imports (enforced by Biome `useImportType`)
- No `any` — ever (`noExplicitAny` is an error)
- kebab-case filenames for components; camelCase for utilities
- 2-space indent, 100-char line width, single quotes, trailing commas (Biome enforced)
- **Never** suppress lint rules with `biome-ignore` (or `@ts-ignore`/`eslint-disable`). If a rule fires, fix the underlying code — restructure the effect, derive a value, lift state, or pick a different approach. A suppression silences the linter but leaves the smell; future readers can't tell whether it's still warranted. The same applies to `as any` and other type escape hatches.

## Architecture

- `packages/stdlib` owns implementation; `packages/runtime` is the public runtime re-export
- App code imports stdlib metadata only through `apps/desktop/src/shared/stdlib-registry.ts`; no other direct app imports from `@contexture/stdlib/*`
- Prefer deep modules: small interface, rich implementation. Reduce methods and parameters; hide complexity inside
- Accept dependencies as arguments — never construct external collaborators inside a function
- Return values, don't produce side effects where avoidable
- Optional parameters are a bug risk by omission. Scrutinise every optional param; prefer correctness over convenience

## Testing

### Core Principle

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests should only break if observable behavior changed.

### Test Structure

- Framework: Vitest (`.test.ts` / `.test.tsx` in `tests/`)
- One logical assertion per test; `describe()` blocks per module or component
- Test names describe **what** the system does, not how

```ts
// GOOD
test("createUser makes user retrievable", async () => {
  const user = await createUser({ name: "Alice" });
  expect((await getUser(user.id)).name).toBe("Alice");
});
```

### Mocking

Mock at **system boundaries only**: external APIs, time/randomness, network. Never mock your own modules or internal collaborators. If internal mocking feels necessary, the interface needs redesigning.

### TDD Workflow

One test → one implementation, repeat. Never write all tests first.

```
RED→GREEN: test1→impl1
RED→GREEN: test2→impl2
```

Never refactor while RED — reach GREEN first.

### Red Flags

- Mocking internal modules or classes
- Testing private methods
- Asserting on call counts/order of internal calls
- Test name describes HOW not WHAT
- Test breaks on refactor without behavior change

## Local environment setup

Real env values come from Infisical via [varlock](https://varlock.dev) — the
committed `.env.schema` files declare structure; nothing sensitive lives on
disk in the repo (see [CLAUDE.md](../CLAUDE.md) "Env vars").

To resolve those values locally you need an Infisical Universal Auth machine
identity scoped to the project, plus its Client ID and Client Secret stored
in your macOS Keychain so they reach every shell:

```bash
# Store creds in Keychain (one-off, after creating the machine identity in
# Infisical). Replace the values when prompted by `-w`.
security add-generic-password -a "$USER" -s INFISICAL_CLIENT_ID -w
security add-generic-password -a "$USER" -s INFISICAL_CLIENT_SECRET -w
```

Add to `~/.zshenv` (NOT `.zshrc` — non-interactive child shells skip that;
varlock invocations from CI scripts and Bun-spawned tools won't see them):

```bash
export INFISICAL_CLIENT_ID="$(security find-generic-password -a "$USER" -s INFISICAL_CLIENT_ID -w 2>/dev/null)"
export INFISICAL_CLIENT_SECRET="$(security find-generic-password -a "$USER" -s INFISICAL_CLIENT_SECRET -w 2>/dev/null)"
```

Restart Terminal (and any IDE / agent host) after editing `.zshenv` so the
new env propagates. To verify, run `bunx varlock load` inside one of the
schema directories (`apps/web`, `apps/desktop`, `.sandcastle`) — it should
resolve cleanly and exit zero.
