---
name: model-domain
description: Use when the user asks to model or design a schema for a new domain from scratch. Walks through entities, relationships, enums, constraints, and stdlib opportunities in order.
---

# model-domain

You are modelling a domain as a closed-world Zod schema. Emit ops through the
op vocabulary (`add_type`, `add_field`, `add_import`, etc.) — never describe
the schema in prose when you could apply it.

## Checklist

Work through these in order. Skip a step only if the user's request
explicitly rules it out.

1. **Entities.** List the nouns the user mentioned. Each nontrivial noun
   becomes an `object` TypeDef. Plural nouns ("harvests") usually become a
   field on the parent ("Plot.harvests: Harvest[]").
2. **Relationships.** For each ref between entities, decide the direction
   and cardinality. Prefer one-way refs; mutual refs belong in a join type.
3. **Enums.** Any small closed set of string values — status, category,
   mode — becomes a `z.enum`. Lowercase-kebab values ("in-progress", not
   "In Progress"). Never use a boolean flag where an enum is clearer.
4. **Discriminated unions.** When variants of a type need different fields
   (`LoginEvent` vs `LogoutEvent`), emit a `discriminatedUnion` on a `kind`
   field, with each variant as its own `object` TypeDef.
5. **Constraints.** For every string field, ask: max length? regex? format
   (email/url/uuid/datetime)? For every number: int? min/max? Tighten only
   when the domain demands it — over-constraining makes the schema brittle.
6. **Stdlib opportunities.** Before adding a regex or custom shape, check
   the stdlib:
     - emails → `common.Email`
     - URLs → `common.URL`
     - UUIDs → `common.UUID`
     - postal addresses → `place.Address`
     - currency amounts → `money.Money`
     - phone numbers → `contact.PhoneE164`
   Qualified refs (`common.Email`) don't need an `add_import` — the editor
   resolves them from the bundled stdlib registry.

## House-style rules

- Type names are `PascalCase`, field names are `camelCase`, enum values are
  `lowercase-kebab`.
- Prefer discriminated unions over boolean flags. A schema with `isActive:
  boolean` usually wants a `status: 'active' | 'inactive' | 'archived'`
  enum instead.
- Prefer `common.Email` / `place.Address` / `money.Money` over bespoke
  regex or object shapes.
- Every object field that's only sometimes present is `optional: true`.
  Use `nullable: true` only when the API wire-format actually sends
  `null` (distinct from "absent").
- Descriptions go on the TypeDef, not on every field — keep them short,
  one sentence at most.

## Worked examples

### Allotment planning

The user says: "I'm planning an allotment; plots, crops, and harvests."

```
add_type Plot { name: string; location?: string; area: number(int, min 0) }
add_type Crop { name: string; family: string }
add_type Harvest {
  plot: → Plot;
  crop: → Crop;
  date: common.ISODate;
  quantity: number(min 0);
}
```

### Inventory

"A warehouse inventory — products, SKUs, stock counts."

```
add_type Product { name: string; sku: NonEmptyString }
add_type StockEntry {
  product: → Product;
  quantity: common.PositiveInt;
  location: string;
  countedAt: common.ISODateTime;
}
```

### Booking

"Resource bookings with a status workflow."

```
add_type Resource { name: string; kind: enum(room | desk | equipment) }
add_type Booking {
  resource: → Resource;
  start: common.ISODateTime;
  end: common.ISODateTime;
  status: enum(pending | confirmed | cancelled | completed);
  notes?: string;
}
```

### CRM

"A simple CRM — contacts, companies, interactions."

```
add_type Contact {
  name: identity.PersonName;
  email?: common.Email;
  phone?: contact.PhoneE164;
}
add_type Company { name: string; website?: common.URL }
add_type Interaction {
  contact: → Contact;
  company?: → Company;
  kind: enum(call | email | meeting | note);
  at: common.ISODateTime;
  summary: string;
}
```

## Closing

After the ops apply, briefly summarise what you added (1–2 sentences, no
prose schema dump — the user can see the graph). Offer the next most
useful refinement: "Want me to add a `Harvest.notes` field?" or "Should
`status` have an `archived` value?".
