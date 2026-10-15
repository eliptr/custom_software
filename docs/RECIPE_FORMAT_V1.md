# Single-file Markdown format, version 1

All recipes are UTF-8 text in **one** `recipe-collection.md`. No ZIP, one-file-per-recipe export, YAML dependency, or hidden binary payload is used. This format renders in Markdown editors including Obsidian. JSON string quoting is intentional: it distinguishes null from empty strings and safely preserves literal pipes, quotes, Markdown punctuation, Unicode, and line breaks.

## Grammar

The exact first nonblank lines are:

```markdown
# Recipe collection

Format: recipe-tracker/1
```

An empty collection contains just these lines. Each recipe follows this structure. Metadata labels, order, and section headings are fixed and case-sensitive:

```markdown
<!-- recipe:start -->
## "Κέικ λεμονιού 🍋"

- ID: "a96718b9-cb74-4573-9b7e-c2d2c0e6bbad"
- Description: "Με γιαούρτι και μέλι"
- Preparation minutes: 10
- Cooking minutes: 35
- Servings: 4
- Category: "Γλυκά"
- Tags: ["λεμόνι","εύκολο"]
- Created: "2026-10-14T12:00:00.000Z"
- Modified: "2026-10-14T12:01:00.000Z"

### Ingredients

- "Αλεύρι" | "1 ½" | "φλιτζάνι" | "κοσκινισμένο"
- "Αλάτι" | null | null | null

### Instructions

1. "Ανακατέψτε τα υλικά."
2. "Ψήστε στους 180°C για 35 λεπτά."

<!-- recipe:end -->
```

`##` holds a JSON string title. Each metadata value is a valid JSON scalar except Tags, which is an array of JSON strings. A nullable field uses unquoted `null`. Empty string `""` is distinct from `null` and round trips unchanged. Title/name/step must contain non-whitespace text (ingredients and steps may be empty lists).

Each ingredient is one Markdown bullet with **four JSON strings or nulls** separated by the exact delimiter ` | `: name, quantity, unit, notes. Name must be a nonblank string. The parser recognizes quoted strings before delimiters, so `"Salt | pepper"` is safe. Quantities are strings (e.g. `"200"`, `"½"`, `"to taste"`) or `null`; unknown amounts are never converted to zero.

Instructions are JSON strings numbered consecutively from `1.`; list order is cooking order. Literal line breaks inside any string are escaped as `\n`, quotes as `\"`, and backslashes as `\\`, following standard JSON. Recipe-boundary text inside a string remains data, never a boundary.

## Validation and limits

- IDs are UUIDs. Creation/modification are ISO 8601 timestamps with timezone; modification must not precede creation.
- Title/name ≤ 300 characters; description and each step ≤ 3,000; quantity/unit ≤ 100; ingredient notes ≤ 1,000; category ≤ 200; each nonempty tag ≤ 100.
- At most 200 ingredients, 200 steps, and 50 tags per recipe.
- Prep/cook time is an integer from 0 to 10,080 minutes or null. Servings is a number from 0.1 to 1,000 or null.
- Import file ≤ 5 MiB; at most 2,000 recipes. UTF-8 BOM, CRLF, and extra blank separator lines are accepted. Arbitrary prose, reordered/missing metadata, invalid JSON, trailing content, missing boundaries, nonconsecutive numbering, unsupported versions, and duplicate IDs in one file are rejected with errors identifying recipe/line where possible.

Save and merge operations enforce these same collection limits before writing, so every collection accepted by the app fits a restorable single-file backup. A capacity error leaves the existing collection unchanged. Import validates canonical serialized size as well as the original file size (extra JSON escaping can affect size).

## Canonical serialization and restoration

Export validates every recipe, sorts by UUID, emits the exact field order above using JSON serialization without optional extra spaces, LF newlines, and a final newline. Instructions and ingredient order are preserved; recipe display order is determined separately by the UI sort option. Every supported field is present; no export-time timestamps replace recipe dates.

Import parses the entire file before offering a preview. Merge inserts new IDs and replaces matching IDs with the file's exact values, without changing dates or creating duplicate rows. Replace clears existing rows and restores the file, in one atomic transaction; the user must select Replace and confirm the explicit destructive action. An empty file in this format can intentionally replace a collection with zero recipes. Repeated merge imports are idempotent by UUID. Titles are not identity keys.

To edit a backup manually, keep JSON quoting and structure; for example change `"1 ½"` to `"2"`. `null` means unknown; do not remove the field. Unknown future schema versions are rejected rather than partially restored. Unit tests prove recipe equivalence and canonical export → import → export stability, including Greek text, emoji, quotes, pipes, newlines, null, and empty strings.
