/**
 * `@contexture/runtime/identity` — re-export of the `identity` stdlib namespace.
 *
 * This is the module that generated `.schema.ts` files import from:
 * the editor's Zod emitter rewrites `import { Email } from '@contexture/identity'`
 * into `import { Email } from '@contexture/runtime/identity'`. Keeping the
 * public surface as thin re-export stubs lets consumers tree-shake
 * namespaces they don't use and keeps the implementation co-located
 * with the editor's IR sidecars in `packages/stdlib`.
 */
export * from '@contexture/stdlib/identity';
