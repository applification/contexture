/**
 * `place` namespace — physical locations and time zones.
 *
 * `Address` intentionally keeps regional fields optional because postal
 * formats vary wildly; the only required fields are `line1`, `locality`,
 * and `countryCode`. `TimeZoneId` is unconstrained — IANA zone ids drift
 * on OS timezone-database updates and over-validating would make valid
 * schemas go stale.
 */
import { z } from 'zod';
import { COUNTRY_CODES } from './countries';

export const CountryCode = z.enum(COUNTRY_CODES);
export type CountryCode = z.infer<typeof CountryCode>;

export const LatLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLng>;

export const Address = z.object({
  line1: z.string(),
  line2: z.string().optional(),
  locality: z.string(),
  region: z.string().optional(),
  postalCode: z.string().optional(),
  countryCode: CountryCode,
});
export type Address = z.infer<typeof Address>;

export const TimeZoneId = z.string();
export type TimeZoneId = z.infer<typeof TimeZoneId>;
