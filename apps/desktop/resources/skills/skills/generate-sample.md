---
name: generate-sample
description: Use when generating sample data for a schema in the Eval panel. Produces a JSON document that parses cleanly against the selected root type.
argument-hint: <mode>
---

# generate-sample

Generate one JSON document that parses against the user's selected root
type. The `$1` argument picks the style:

- `realistic` — plausible production data. Names read like real people,
  emails use sensible domains, currencies match locale, dates land in
  the last year or so.
- `minimal` — the smallest valid document. Skip every optional field.
  Use the shortest/least-constrained valid values.
- `edge-case` — exercise the boundaries. Strings at their min/max
  length, numbers at their min/max, empty arrays where allowed, very
  long valid strings, Unicode.
- `adversarial` — inputs that are _valid_ but trip up naïve downstream
  code. SQL-ish strings, nested escape sequences, emoji, RTL text,
  dates near DST boundaries, zero-width joiners in names.

Mode: $1

## Hard rules

- The output **must** parse under the root Zod schema. Every required
  field present, every enum value one of the declared choices, every
  ref field populated with a document that matches its target type.
- Use the stdlib formats: emails that pass `z.string().email()`,
  ISO dates as `YYYY-MM-DD`, `ISODateTime` with a timezone offset, E.164
  phones starting with `+`, valid ISO 3166-1 alpha-2 country codes,
  valid ISO 4217 currency codes.
- No Lorem Ipsum for `realistic` — use domain-appropriate English.
- Discriminated unions: pick one variant and include the discriminator
  field plus every field of that variant's object.

## Style per mode

### realistic

Examples:
- Names from a diverse set (not all "John Smith").
- Dates within the last 18 months; timestamps spread across a workday.
- Currencies matching the country code (GBP in GB, USD in US…).
- Free-text fields one short sentence, capitalised, real punctuation.

### minimal

Examples:
- Strings: `"a"` when min is 1, `""` when no min; `"1970-01-01"` for
  ISODate; `"1970-01-01T00:00:00Z"` for ISODateTime.
- Numbers: `0` when allowed, otherwise `min`.
- Arrays: `[]` when `min` is 0 or absent.
- Enums: the first declared value.

### edge-case

Examples:
- Strings exactly at `min` and `max` length.
- Numbers exactly at `min` and `max`.
- Unicode characters in every free-text field: "Žížnivý škrečok 🦝".
- Arrays at their `max` length.
- Dates near month boundaries ("2024-02-29", "2025-12-31").

### adversarial

Examples:
- Free-text fields with `<script>alert(1)</script>` or `'; DROP TABLE`.
- Names with RTL characters, zero-width joiners, combining marks.
- Dates with `Z` vs `+00:00` inconsistencies within the same doc.
- Timestamps at DST transitions (`2024-03-10T02:30:00-05:00`).

## Closing

Emit only the JSON — no prose, no markdown fencing, no trailing
commentary. The eval harness re-parses it against the schema and
reports the first validation error.
