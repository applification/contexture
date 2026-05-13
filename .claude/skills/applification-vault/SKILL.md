---
name: applification-vault
description: Read and write the Applification Ltd Obsidian vault via the local obsidian CLI. Use when planning architecture, recalling prior product/business decisions, or recording an architectural decision worth preserving for Contexture. Read-first; writes restricted to Products/Contexture/ and log.md.
---

# Applification vault

Contexture is one product within Applification Ltd. The company's curated knowledge — AI engineering research, business/marketing/product thinking, and per-product strategy — lives in an Obsidian vault. This skill is the protocol for accessing it from the Contexture repo.

## The vault

- **Name**: `Applification Ltd` (single vault on this machine — no need to pass `vault=`)
- **Path**: `/Users/rufus/Documents/Applification Ltd`
- **CLI**: `/usr/local/bin/obsidian` — invoked via `Bash` as `obsidian <command> …`. Run `obsidian help` or `obsidian help <command>` for the full surface.

Top-level layout:

- `index.md` — curated catalog. **Always read this first** when answering "what do we know about X?"
- `log.md` — append-only chronological record (`## [YYYY-MM-DD] <op> | <title>`)
- `Knowledge/{AI Engineering,Business,Engineering,Marketing,Product}/` — synthesised wiki layer
- `Products/<Product>/` — per-product strategy & direction (Contexture, Plantry, Allotment, Ontograph, Contract Finder, Scarlett Hudson)
- `Clippings/`, `Marketing/`, `Minutes/`, `TaxCredits/`, `Tech Stack/` — operational notes

## When to use this skill

**Read** before:
- Architectural or product decisions for Contexture
- Planning a feature that touches the product's direction
- The user references prior thinking, a pivot, "what we decided", or vault content
- Drafting docs/ADRs that should be informed by business context

**Write** when (and only when):
- The user has explicitly agreed an architectural decision is worth recording in the vault
- The decision is about Contexture (not generic engineering knowledge — that's vault-curator territory)

## Read protocol

1. **`index.md` first**: `Read /Users/rufus/Documents/Applification Ltd/index.md`. It's the human-curated catalog grouped by Knowledge sub-folder + tag cluster, with hub notes and Dataview blocks.
2. **Contexture-specific context**: `Read /Users/rufus/Documents/Applification Ltd/Products/Contexture/<file>.md`. As of writing: `Contexture Future Direction.md`, `Pivot.md` — but list the folder first to catch new files: `obsidian files folder="Products/Contexture"`.
3. **Drill into Knowledge notes** referenced by index/Contexture docs. Files are on the local filesystem at the vault path — prefer `Read` with the absolute path over `obsidian` for plain file reads (faster, no CLI overhead).
4. **Search as fallback**, not as the first move. When you do search, prefer `search:context` over `search`:
   ```bash
   obsidian search:context query="schema designer" path=Products/Contexture limit=10
   ```
5. **Other useful read commands** (`Bash` → `obsidian …`):
   - `obsidian files folder=<path>` — list files in a folder
   - `obsidian backlinks file="<name>"` — what links to this note
   - `obsidian links file="<name>"` — what this note links to
   - `obsidian outline path=<path>` — heading tree
   - `obsidian tags sort=count` — tag frequency
   - `obsidian tag name=<tag> verbose` — files carrying a tag

## Write protocol

**Scope guardrail**: writes are limited to `Products/Contexture/` and `log.md`. Touching `Knowledge/`, `Marketing/`, `Minutes/`, `Clippings/`, `.obsidian/`, or other `Products/<Product>/` folders requires the user to explicitly ask. Refuse silently-broadening the scope.

**Confirm before writing**: surface the proposed content and target path to the user; get a go-ahead before running any `obsidian append`, `obsidian create`, `obsidian move`, or `obsidian delete`.

### Default: append to an existing direction doc

When the decision extends or refines existing strategy, append a dated section to the relevant doc — usually `Products/Contexture/Contexture Future Direction.md`:

```bash
obsidian append path="Products/Contexture/Contexture Future Direction.md" content="\n\n## [2026-05-13] Decision: <slug>\n\n<one-paragraph summary of the decision and the why>.\n\nRelated: [[<knowledge-or-product-note>]]"
```

Note: the CLI converts `\n` to newlines in `content`. Quote the whole value.

### When to create a new file instead

Create a new file in `Products/Contexture/` when the decision is substantial and self-contained enough that it deserves its own page (e.g. a major architectural pivot, a new pricing model, a competitive positioning note). Choose a descriptive kebab-case filename, not a date-prefixed ADR slug.

```bash
obsidian create path="Products/Contexture/<descriptive-slug>.md" content="---\ntitle: <Title>\ncreated: 2026-05-13\nupdated: 2026-05-13\ncreated-by: agent:claude-code\n---\n\n# <Title>\n\n<body, using [[wikilinks]] to related notes>"
```

### Always: append a one-liner to `log.md`

Whether you appended or created, also append to `log.md` matching the vault's existing format:

```bash
obsidian append path=log.md content="\n## [2026-05-13] decision | <slug>\n\n<one-sentence summary>. See [[<note-name-without-md>]]."
```

### Frontmatter convention for new files

```yaml
---
title: <Title>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
created-by: agent:claude-code
---
```

When editing an existing file you created, bump `updated:`.

### Linking

Use `[[wikilinks]]` for all internal references (Obsidian convention). Link to relevant `Knowledge/` notes and hub notes (e.g. `[[Agent Harness]]`, `[[Compound Engineering]]`) where the decision draws on them — those backlinks are how the vault compounds value over time.

## Verification after a write

After any write, `Read` the target file (absolute path) to confirm the content landed correctly. The `obsidian` CLI does not always surface errors loudly.

## What this skill does NOT do

- Curate clippings into Knowledge notes (that's the vault's own `/clippings-curator` skill, run from inside the vault).
- Lint the vault (vault's `/vault-lint` skill).
- Mirror this repo's `docs/adr/` ADRs into the vault — code-level ADRs stay in-repo; product-level decisions go to the vault.
- Touch `.obsidian/`. Ever.
