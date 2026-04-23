/**
 * Runtime package smoke test.
 *
 * Proves `@contexture/runtime/<ns>` re-exports each stdlib namespace and
 * that the re-exported Zod schemas parse known-good inputs. The full
 * semantic contract is covered by the stdlib parity suite; this just
 * fixes the runtime surface so generated user code can import from
 * `@contexture/runtime/...` without a broken path.
 */
import { Email, NonEmptyString, UUID } from '@contexture/runtime/common';
import { PhoneE164 } from '@contexture/runtime/contact';
import { Handle } from '@contexture/runtime/identity';
import { Money } from '@contexture/runtime/money';
import { CountryCode } from '@contexture/runtime/place';
import { describe, expect, it } from 'vitest';

describe('@contexture/runtime smoke', () => {
  it('common re-exports Email + friends', () => {
    expect(Email.safeParse('foo@bar.com').success).toBe(true);
    expect(Email.safeParse('nope').success).toBe(false);
    expect(NonEmptyString.safeParse('').success).toBe(false);
    expect(UUID.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true);
  });

  it('identity re-exports Handle', () => {
    expect(Handle.safeParse('ada').success).toBe(true);
    expect(Handle.safeParse('has space').success).toBe(false);
  });

  it('place re-exports CountryCode', () => {
    expect(CountryCode.safeParse('GB').success).toBe(true);
    expect(CountryCode.safeParse('ZZ').success).toBe(false);
  });

  it('money re-exports Money', () => {
    expect(Money.safeParse({ amount: '1.23', currencyCode: 'USD' }).success).toBe(true);
    expect(Money.safeParse({ amount: 1.23, currencyCode: 'USD' }).success).toBe(false);
  });

  it('contact re-exports PhoneE164', () => {
    expect(PhoneE164.safeParse('+447911123456').success).toBe(true);
    expect(PhoneE164.safeParse('not-a-phone').success).toBe(false);
  });
});
