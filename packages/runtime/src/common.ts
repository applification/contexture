/**
 * `@contexture/runtime/common` — re-export of the `common` stdlib namespace.
 *
 * This is the module that generated `.schema.ts` files import from:
 * the editor's Zod emitter rewrites `import { Email } from '@contexture/common'`
 * into `import { Email } from '@contexture/runtime/common'`. Keeping the
 * public surface as thin re-export stubs lets consumers tree-shake
 * namespaces they don't use and keeps the implementation co-located
 * with the editor's IR sidecars in `packages/stdlib`.
 */
export * from '@contexture/stdlib/common';
