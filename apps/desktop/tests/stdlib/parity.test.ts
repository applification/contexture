/**
 * Parity tests: for every stdlib TypeDef, the hand-written Zod (from
 * `packages/stdlib/src/<ns>.ts`) accepts and rejects the same fixtures
 * as the Zod built from the matching IR sidecar. Proves the `.contexture.json`
 * files semantically match the hand-written modules they accompany.
 *
 * Fixture shape: `[input, expected]` where `expected` is `'accept'` or
 * `'reject'`. Edge fixtures (empty strings, boundary numbers, cross-type
 * look-alikes) live here so both sides get exercised the same way.
 */
import {
  HAND_ZOD_BY_NAMESPACE,
  IR_BY_NAMESPACE,
  NAMESPACES,
  type Namespace,
} from '@contexture/stdlib/registry';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { buildZodFromIR } from './ir-to-zod';

type Verdict = 'accept' | 'reject';
type Fixture = [unknown, Verdict];
type FixtureMap = Record<string, Fixture[]>;

const FIXTURES: Record<Namespace, FixtureMap> = {
  common: {
    Email: [
      ['foo@bar.com', 'accept'],
      ['a+b@example.co.uk', 'accept'],
      ['not an email', 'reject'],
      ['', 'reject'],
      [123, 'reject'],
    ],
    URL: [
      ['https://example.com', 'accept'],
      ['http://x.y/z?q=1', 'accept'],
      ['not a url', 'reject'],
      ['', 'reject'],
    ],
    UUID: [
      ['550e8400-e29b-41d4-a716-446655440000', 'accept'],
      ['not-a-uuid', 'reject'],
      ['', 'reject'],
    ],
    ISODate: [
      ['2026-04-22', 'accept'],
      ['1999-12-31', 'accept'],
      ['2026-4-22', 'reject'],
      ['2026-04-22T00:00:00Z', 'reject'],
      ['', 'reject'],
    ],
    ISODateTime: [
      ['2026-04-22T10:30:00Z', 'accept'],
      ['2026-04-22T10:30:00+01:00', 'accept'],
      ['2026-04-22T10:30:00', 'reject'], // no offset
      ['not a timestamp', 'reject'],
    ],
    Slug: [
      ['hello', 'accept'],
      ['hello-world', 'accept'],
      ['a-b-c-123', 'accept'],
      ['Hello', 'reject'],
      ['hello world', 'reject'],
      ['-hello', 'reject'],
      ['', 'reject'],
    ],
    NonEmptyString: [
      ['x', 'accept'],
      ['hello', 'accept'],
      ['', 'reject'],
    ],
    PositiveInt: [
      [1, 'accept'],
      [42, 'accept'],
      [0, 'reject'],
      [-1, 'reject'],
      [1.5, 'reject'],
    ],
    PositiveNumber: [
      [1, 'accept'],
      [0.1, 'accept'],
      [0, 'reject'],
      [-1, 'reject'],
    ],
  },
  identity: {
    PersonName: [
      [{ given: 'Ada', family: 'Lovelace' }, 'accept'],
      [{ given: 'Ada', family: 'Lovelace', middle: 'Byron' }, 'accept'],
      [{ given: 'Ada' }, 'reject'],
      [{}, 'reject'],
    ],
    Pronouns: [
      ['she/her', 'accept'],
      ['', 'accept'],
      [42, 'reject'],
    ],
    Handle: [
      ['ada', 'accept'],
      ['ada_l_123', 'accept'],
      ['a', 'accept'],
      ['', 'reject'],
      ['has spaces', 'reject'],
      ['toolongxxxxxxxxxxxxxxxxxxxxxxxxx', 'reject'], // 32 chars
    ],
  },
  place: {
    CountryCode: [
      ['GB', 'accept'],
      ['US', 'accept'],
      ['ZZ', 'reject'], // not assigned
      ['gb', 'reject'], // lower-case
      ['', 'reject'],
    ],
    LatLng: [
      [{ lat: 0, lng: 0 }, 'accept'],
      [{ lat: 51.5, lng: -0.12 }, 'accept'],
      [{ lat: 90, lng: 180 }, 'accept'],
      [{ lat: 91, lng: 0 }, 'reject'],
      [{ lat: 0, lng: -181 }, 'reject'],
      [{ lat: 0 }, 'reject'],
    ],
    Address: [
      [{ line1: '10 Downing St', locality: 'London', countryCode: 'GB' }, 'accept'],
      [
        {
          line1: '10 Downing St',
          line2: 'Apt 1',
          locality: 'London',
          region: 'Greater London',
          postalCode: 'SW1A 2AA',
          countryCode: 'GB',
        },
        'accept',
      ],
      [{ line1: '10 Downing St', locality: 'London' }, 'reject'], // missing cc
      [{ line1: '10 Downing St', locality: 'London', countryCode: 'ZZ' }, 'reject'],
    ],
    TimeZoneId: [
      ['Europe/London', 'accept'],
      ['America/Los_Angeles', 'accept'],
      ['', 'accept'], // unconstrained on purpose
      [42, 'reject'],
    ],
  },
  money: {
    CurrencyCode: [
      ['GBP', 'accept'],
      ['USD', 'accept'],
      ['ZZZ', 'reject'],
      ['gbp', 'reject'],
    ],
    Money: [
      [{ amount: '12.34', currencyCode: 'GBP' }, 'accept'],
      [{ amount: '0', currencyCode: 'USD' }, 'accept'],
      [{ amount: 12.34, currencyCode: 'GBP' }, 'reject'], // amount must be string
      [{ amount: '12.34' }, 'reject'],
      [{ amount: '12.34', currencyCode: 'ZZZ' }, 'reject'],
    ],
  },
  contact: {
    PhoneE164: [
      ['+447911123456', 'accept'],
      ['+14155550100', 'accept'],
      ['+1', 'reject'], // < 2 digits
      ['+0123456789', 'reject'], // leading 0
      ['447911123456', 'reject'], // missing +
      ['', 'reject'],
    ],
  },
};

for (const ns of NAMESPACES) {
  describe(`stdlib parity: ${ns}`, () => {
    const handZod = HAND_ZOD_BY_NAMESPACE[ns] as Record<string, unknown>;
    const irZod = buildZodFromIR(IR_BY_NAMESPACE[ns] as never);
    const fixtures = FIXTURES[ns];

    for (const typeName of Object.keys(fixtures)) {
      describe(typeName, () => {
        const hand = handZod[typeName] as z.ZodTypeAny | undefined;
        const emitted = irZod[typeName];

        it('exists in both hand-written module and IR', () => {
          expect(hand).toBeDefined();
          expect(emitted).toBeDefined();
        });

        for (const [input, expected] of fixtures[typeName]) {
          const label = `${expected}s ${JSON.stringify(input)}`;
          it(label, () => {
            const handOk = hand?.safeParse(input).success ?? false;
            const emittedOk = emitted?.safeParse(input).success ?? false;
            expect({ hand: handOk, emitted: emittedOk }).toEqual({
              hand: expected === 'accept',
              emitted: expected === 'accept',
            });
          });
        }
      });
    }
  });
}
