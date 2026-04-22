/**
 * `money` namespace — ISO 4217 currency codes and a safe money shape.
 *
 * Amounts are stored as strings rather than numbers: JSON `number` is an
 * IEEE-754 double, which corrupts values like `0.1 + 0.2`. Downstream
 * code should parse the string into a decimal library (big.js, decimal.js,
 * etc.) before doing arithmetic.
 */
import { z } from 'zod';
import { CURRENCY_CODES } from './currencies';

export const CurrencyCode = z.enum(CURRENCY_CODES);
export type CurrencyCode = z.infer<typeof CurrencyCode>;

export const Money = z.object({
  amount: z.string(),
  currencyCode: CurrencyCode,
});
export type Money = z.infer<typeof Money>;
