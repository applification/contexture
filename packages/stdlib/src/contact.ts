/**
 * `contact` namespace — reachable-identity primitives.
 *
 * Only `PhoneE164` lives here for now; email and messaging handles stay
 * in `common` / `identity` so cross-referencing them doesn't require a
 * `contact` import.
 */
import { z } from 'zod';

/** ITU-T E.164 phone number: `+` then 1–15 digits, first digit non-zero. */
export const PhoneE164 = z.string().regex(/^\+[1-9]\d{1,14}$/);
export type PhoneE164 = z.infer<typeof PhoneE164>;
