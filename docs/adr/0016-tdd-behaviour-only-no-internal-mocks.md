# ADR 0016: TDD red-green-refactor; tests verify behaviour through public interfaces; mock only at system boundaries

- **Status:** Accepted (backfilled)
- **Date:** 2026-05-01

## Context

Tests have two failure modes. They can fail to catch real regressions (too lax). They can also fail to *survive* refactors — breaking on every internal restructure even though observable behaviour is unchanged (too coupled).

Codebases that mock internal collaborators end up with the second failure mode. Every refactor cascades into test edits. Confidence in the test suite drops because a green run means "the implementation matches the test's wiring", not "the system behaves correctly".

For an editor with a long lifetime, a closed-world op vocabulary, and a Zod-typed IR, tests should be cheap to keep green across refactors and expensive to fool.

## Decision

- TDD red-green-refactor loop: one test → one implementation → repeat. Never write all tests first. Never refactor while red.
- Tests verify behaviour through public interfaces only. Test names describe **what** the system does, not how.
- Mock at system boundaries only — external APIs, time, randomness, network, filesystem. Never mock internal modules or classes. If internal mocking feels necessary, the interface needs redesigning.
- One logical assertion per test. `describe()` blocks per module or component.

## Consequences

- Refactors that preserve behaviour leave the test suite green.
- The cost of each test is real implementation work, not mock plumbing.
- Internal interfaces stay clean because hard-to-test code surfaces as hard-to-write tests.
- Cost: some end-to-end tests are slower than equivalent mock-driven unit tests would have been. Accepted — the boundary tests pay the price; the bulk of the suite is fast unit tests over pure modules (the IR/ops/emitters were designed to be pure precisely so this works, see ADR 0008).

## Alternatives considered

- **Mock-heavy unit tests:** fast, brittle, and silently encode implementation details.
- **Test-after development:** loses the design pressure TDD applies to keep public interfaces small.
- **Property-based testing as the default:** valuable for the IR meta-schema and migrations specifically; worth adding selectively but not as the default style.
