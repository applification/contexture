/**
 * `identity` namespace — names and handles.
 *
 * Intentionally permissive: names are cultural, so `PersonName` just
 * shapes the parts rather than constraining content. `Pronouns` is
 * free-form on purpose — enumerating pronoun sets reliably is out of
 * scope for a schema primitive.
 */
import { z } from 'zod';

export const PersonName = z.object({
  given: z.string(),
  family: z.string(),
  middle: z.string().optional(),
  suffix: z.string().optional(),
});
export type PersonName = z.infer<typeof PersonName>;

export const Pronouns = z.string();
export type Pronouns = z.infer<typeof Pronouns>;

/** Social handle — ASCII letters, digits, underscore; 1–30 chars. */
export const Handle = z.string().regex(/^[a-zA-Z0-9_]{1,30}$/);
export type Handle = z.infer<typeof Handle>;
