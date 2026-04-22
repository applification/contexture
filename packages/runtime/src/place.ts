/**
 * `@contexture/runtime/place` — re-export of the `place` stdlib namespace.
 *
 * This is the module that generated `.schema.ts` files import from:
 * the editor's Zod emitter rewrites `import { Email } from '@contexture/place'`
 * into `import { Email } from '@contexture/runtime/place'`. Keeping the
 * public surface as thin re-export stubs lets consumers tree-shake
 * namespaces they don't use and keeps the implementation co-located
 * with the editor's IR sidecars in `packages/stdlib`.
 */
export * from '@contexture/stdlib/place';
