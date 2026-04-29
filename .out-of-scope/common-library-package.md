# Standalone `@contexture/common` package

Contexture will not ship cross-product common types as a separately-published npm package (`@contexture/common`) at this stage.

## Why this is out of scope

Common types (Email, URL, Money, ISODate, etc.) are already curated in-codebase via `@contexture/runtime` and `@contexture/stdlib`. Generated product code imports the runtime helpers directly. That arrangement covers the actual need today: shared, consistent primitive types across emitters.

Splitting these out into a separately-versioned `@contexture/common` published package would add:

- A new release/versioning lane to maintain
- A versioned ref syntax in the IR (e.g. `common@1.Email`) and a resolver to interpret it
- Cross-major-version migration concerns for product IRs

That overhead isn't justified at the project's current stage. The bundled approach is sufficient until there is concrete pressure from multiple production products that need to evolve common types independently.

The salvageable bits from the original PRD are not worth their own issues:

- IR validation of common refs falls out of normal type-checking against the bundled `@contexture/runtime` exports
- A "Common" section in the canvas field-type picker is a small UX polish item, not a feature

## Prior requests

- #159 — "PRD: Common library (`@contexture/common`)"
