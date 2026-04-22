---
name: use-stdlib
description: Use when a field or pattern in the schema matches a stdlib type (email, address, money, phone, URL, country, currency, etc.). Replaces bespoke regex/shape fields with `<namespace>.<TypeName>` refs.
---

# use-stdlib

Before adding a regex or a bespoke object shape, check whether the
bundled stdlib already covers the pattern. Qualified refs (`common.Email`)
resolve automatically — no `add_import` needed.

## Pattern → stdlib mapping

| Pattern in the domain | Use |
|---|---|
| email addresses | `common.Email` |
| URLs / links | `common.URL` |
| UUIDs / random ids | `common.UUID` |
| Calendar date without time | `common.ISODate` |
| Timestamp with timezone | `common.ISODateTime` |
| URL-safe slug | `common.Slug` |
| Non-empty free-text string | `common.NonEmptyString` |
| Positive integer (count, quantity) | `common.PositiveInt` |
| Positive decimal (weight, rate) | `common.PositiveNumber` |
| Person's name (given/family/middle/suffix) | `identity.PersonName` |
| Free-form pronouns | `identity.Pronouns` |
| Social handle (twitter/gh/etc.) | `identity.Handle` |
| Postal address | `place.Address` |
| Lat/lng coordinate | `place.LatLng` |
| ISO country code | `place.CountryCode` |
| IANA time zone id | `place.TimeZoneId` |
| Currency amount | `money.Money` |
| ISO currency code | `money.CurrencyCode` |
| E.164 phone number | `contact.PhoneE164` |

## Rules of thumb

- If the field is "a string that looks like X" and X is in the table
  above, use the stdlib ref. Don't write a regex when `common.Email`
  exists.
- If the field is a structured value (money amount, postal address),
  use the stdlib object. Don't flatten `amount + currency` onto the
  parent type.
- If a user explicitly needs tighter validation than the stdlib (e.g.
  "only .com emails"), use a `raw` TypeDef with a custom Zod
  expression — don't shoehorn it into the stdlib ref.
