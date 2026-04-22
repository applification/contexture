/**
 * `common` namespace — general-purpose primitives.
 *
 * See `plans/pivot.md §Stdlib spec`. Parity tests in
 * `apps/desktop/tests/stdlib/parity.test.ts` prove each of these
 * hand-written Zod forms accept/reject the same inputs as the Zod
 * emitted from the matching IR sidecar.
 */
import { z } from 'zod';

export const Email = z.string().email();
export type Email = z.infer<typeof Email>;

export const URL = z.string().url();
export type URL = z.infer<typeof URL>;

export const UUID = z.string().uuid();
export type UUID = z.infer<typeof UUID>;

/** Calendar date, YYYY-MM-DD. No time-of-day, no timezone. */
export const ISODate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type ISODate = z.infer<typeof ISODate>;

/**
 * RFC 3339 timestamp with a required timezone offset (e.g. `Z` or `+01:00`).
 *
 * Hand form uses `z.string().datetime({ offset: true })`. The IR sidecar
 * can't express the `offset: true` flag directly, so it falls back to a
 * `raw` TypeDef that inlines the same expression — parity tests prove
 * both accept and reject the same inputs.
 */
export const ISODateTime = z.string().datetime({ offset: true });
export type ISODateTime = z.infer<typeof ISODateTime>;

/** URL-safe slug — lowercase letters, digits, and single `-` separators. */
export const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export type Slug = z.infer<typeof Slug>;

export const NonEmptyString = z.string().min(1);
export type NonEmptyString = z.infer<typeof NonEmptyString>;

/** Positive integer — excludes zero. */
export const PositiveInt = z.number().int().positive();
export type PositiveInt = z.infer<typeof PositiveInt>;

/**
 * Positive number — excludes zero, allows fractional values.
 *
 * Zod's `.positive()` is strict-greater-than-zero; the IR's `number` kind
 * only supports inclusive `min`/`max`, so this also emits via a `raw`
 * TypeDef whose `zod` string is `z.number().positive()`.
 */
export const PositiveNumber = z.number().positive();
export type PositiveNumber = z.infer<typeof PositiveNumber>;
