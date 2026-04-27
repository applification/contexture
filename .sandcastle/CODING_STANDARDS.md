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

## Architecture

- `packages/stdlib` owns all implementation; `packages/runtime` is a thin re-export layer only
- Dependencies flow one way: `apps/* → runtime → stdlib`. Never import stdlib directly from apps
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
