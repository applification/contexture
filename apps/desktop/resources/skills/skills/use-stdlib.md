---
name: use-stdlib
description: Use when a field or pattern in the schema matches a stdlib type (email, address, money, phone, URL, country, currency, etc.). Replaces bespoke regex/shape fields with `<namespace>.<TypeName>` refs.
---

# use-stdlib

Before adding a regex or a bespoke object shape, check whether the
bundled stdlib already covers the pattern.

**Always write stdlib refs with their namespace prefix** (e.g.
`place.CountryCode`, `money.Money`, `common.Email`). Bare refs like
`CountryCode` will NOT resolve — the validator only checks bare names
against locally-defined types in the schema. The namespace prefix is
what triggers the stdlib lookup; `add_import` is optional and only
needed if you want to rename the alias.

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

## Fixing `Unresolved ref "Foo"` errors

When the validator reports an unresolved ref, the fix is almost always
one of:

1. **Bare ref that should be qualified** — change `CountryCode` to
   `place.CountryCode`. Use `update_field` with a patch that **only
   changes `type.typeName`**, preserving `kind: "ref"` so the diagram
   edge stays intact:
   ```json
   { "kind": "update_field", "typeName": "Album", "fieldName": "country",
     "patch": { "type": { "kind": "ref", "typeName": "place.CountryCode" } } }
   ```
2. **Typo of a local type** — rename via `update_field` patching only
   `type.typeName`.
3. **Type genuinely doesn't exist yet** — `add_type` to create it.

**Never** "fix" an unresolved ref by replacing the field's type with a
primitive (`string`, `int`, `boolean`, etc.). That makes the error
disappear by silently deleting the relationship the ref represented,
losing the connection in the graph.
