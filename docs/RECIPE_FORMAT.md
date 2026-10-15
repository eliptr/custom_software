# Single-file Markdown format, version 4

Exports start with `Format: recipe-tracker/4`. All recipes, notes and revisions remain in **one** UTF-8 `recipe-collection.md`. Version 4 extends the version 3 grammar below: each entry of `### Ingredient conversion context` additionally contains `savedMeasurements`, null for an ingredient without saved equivalents.

A non-null `savedMeasurements` object has these exact fields:

- `form`: `solid` or `liquid`.
- `metric`: null or `{amount, unit, source}`. `amount` is a finite positive number ≤1e9. Solids use `g`/`kg`; liquids use `ml`/`L`.
- `cups`: null or `{amount, unit, source}` with the same numeric bounds and US `cup`, `tbsp`, or `tsp` units.
- Each side's `source`: `exact` for deterministic same-dimension unit math, otherwise `estimated` for an AI cooking approximation. Liquid pairs express one shared volume; direct source relationships are enforced during normalization.
- `assumptions`: nullable text ≤1,000 characters describing ingredient form/preparation and approximation assumptions.
- `input`: `{name, quantity, unit, notes, measurementContext}` containing the exact original ingredient strings/nulls and complete source convention/number context at estimation time. Unlike legacy identity context, this includes the original quantity.
- `inputFingerprint`: 16 lowercase hexadecimal characters calculated by `equivalentFingerprint` over canonical sorted-key JSON of `input`.
- `model`: nonempty string ≤100 characters identifying the generating model.
- `promptVersion`: nonempty string ≤100 characters, currently `ingredient-equivalents/1`.
- `estimatedAt`: timezone-aware ISO timestamp.

The accepted numeric pair and input remain a fixed basis. Quantity edits change the ingredient's original quantity string, not the pair's basis. Display derives a fresh ratio from that basis without cumulative rounding. Other identifying changes, ambiguous quantities, unsupported future prompt versions, invalid fingerprints, or inconsistent exact math disable the estimate without deleting it. A missing side falls back to exact same-dimension math when available, then the unchanged original.

Revision snapshot ingredient objects contain the same `savedMeasurements` field. Formats 1–3 and IndexedDB versions 1–3 add null saved measurements, including historical snapshots, without changing original text, dates, notes, profile data or revision IDs. Repeated imports remain idempotent. The display preference and request-local UUIDs remain device/transient state outside backups. Legacy profile identities remain round-trip data and compatibility metadata; they no longer drive new display density estimates.

All existing canonical serialization, validation, ordered sections, single-file limits and atomic merge/replace rules remain unchanged. Export always writes version 4; use the updated app when sharing new backups.

## Version 3 reference grammar

Exports start with `Format: recipe-tracker/3`. Version 3 retains the version 2 grammar below, with one additional required section **between Ingredients and Instructions**:

````markdown
### Ingredient conversion context

```json
[
  {
    "conversionMode": "auto",
    "identity": null,
    "measurementContext": {
      "convention": "us",
      "conventionSource": "assumed",
      "numberFormat": "auto"
    }
  }
]
```
````

The JSON array must have exactly one entry per ingredient in the same order. It never replaces the five readable original ingredient fields. Each entry contains `conversionMode` (`auto` or `original`), `measurementContext`, and nullable `identity`.

- `convention`: `us`, `metric-250`, `metric-240`, `australian`, or `unknown`. Explicit `US cup`/spoon unit text takes precedence over this default.
- `conventionSource`: `assumed`, `user`, `legacy`, or `extracted`. Older recipes use US customary with `legacy` provenance; this is an assumption, not evidence about the original recipe.
- `numberFormat`: `auto`, `en-US`, or `el-GR`. Auto rejects ambiguous three-digit decimal/grouping suffixes such as `1,000`.
- `identity`: null or `{profileId, source, catalogVersion, context, assumptionsConfirmed}`. `source` is `local`, `ai`, `user`, or `legacy`. Context stores the exact original `name`, nullable `notes` and `unit`, `convention`, and `numberFormat`; quantity is deliberately excluded so changing it retains a valid identity. `assumptionsConfirmed` is a boolean recording a user's explicit preparation confirmation. Profile IDs/versions not in the current catalog are preserved but not trusted for conversion.

Revision snapshot ingredients carry these same fields in their existing JSON objects. Importing old revisions adds conversion metadata only; their original names, quantity/unit strings, notes, dates, and IDs remain unchanged. No converted display quantity is persisted. Device display preferences and temporary AI request identifiers are not exported.

Versions 1 and 2 remain supported. Version 1 adds the previous empty notes/history/metadata defaults. Both older formats add US/legacy/auto measurement context, auto conversion mode, and, if an old ingredientType exists, an unverified `legacy/2` identity hint. Legacy classifications never establish density by themselves. Migration is deterministic, including historical snapshots, so repeated old imports do not create conflicting revisions or duplicate journal entries. Export always writes version 3; older app versions cannot read it. Use the latest app when sharing new backups.

All validation, canonical ordering, single-file limits, and merge/replace behavior below also apply to version 3. Malformed/missing conversion sections, invalid context fields, or mismatched ingredient/context counts reject the complete import before any write.

## Version 2 reference grammar

All recipes, cooking notes, and revision snapshots export to **one UTF-8 `recipe-collection.md`**. No ZIP, external attachments, or separate recipe files are created. Version 1 collections remain importable; their original specification is in [RECIPE_FORMAT_V1.md](RECIPE_FORMAT_V1.md).

## Grammar

The first nonblank lines are `# Recipe collection`, a blank separator, and `Format: recipe-tracker/2`. An empty collection contains only those lines. Recipes sort by UUID on export, and each uses this exact, case-sensitive field and section order:

````markdown
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
- Cooking temperatures: [{"celsius":180,"method":"fan oven","source":"extracted"}]
- Metadata sources: {"cookTime":"extracted","prepTime":"estimated"}

### Ingredients

- "Αλεύρι" | "1 ½" | "φλιτζάνι" | null | "flour"
- "Αλάτι" | null | null | null | null

### Instructions

1. "Ανακατέψτε τα υλικά."
2. "Ψήστε στους 180°C για 35 λεπτά."

### Cooking notes

- {"body":"Less salt next time.\nΔοκιμή με μέλι.","cookedOn":"2026-10-15","createdAt":"2026-10-15T08:00:00Z","id":"e22aa9a5-0753-486b-a835-4d3bad549901","rating":4,"updatedAt":"2026-10-15T08:00:00Z"}

### Revisions

```json
[]
```

<!-- recipe:end -->
````

Each title, step, and ingredient field uses JSON string quoting. This preserves Greek/Unicode, literal quotes, pipes, backslashes, newlines, empty strings, and null without delimiter ambiguity. Null is unquoted; empty string `""` remains distinct. Embedded boundary/fence text inside a JSON string remains data. Ingredients and instructions can be empty lists.

Ingredients have **five** JSON string/null fields separated by the exact delimiter ` | `: **name, original quantity, original unit, notes, ingredientType**. Quantity is always its original string or null; converted display amounts are never serialized over it. `ingredientType` is null or one of: `flour`, `sugar`, `brown-sugar` (packed), `powdered-sugar`, `butter`, `honey`, `cocoa`, `oats`, `water`, `milk`, `oil`.

Temperatures are objects with numeric `celsius`, a nonempty cooking `method`, and `source`. Metadata sources is an object whose optional keys are `title`, `prepTime`, `cookTime`, `cookingTemperatures`, `servings`, `category`, `tags`; values are `extracted`, `estimated`, `user`, or `unknown`. An absent source means unknown, including migrated version 1 values. Temperature sources have the same values. AI output cannot claim `user` provenance.

Cooking notes are individual JSON objects on Markdown bullet lines. Every note has a stable UUID `id`, ISO calendar date `cookedOn`, text `body`, nullable integer `rating` (1–5), and timezone-aware `createdAt`/`updatedAt`. A note needs text or a rating. Notes do not create recipe revisions.

Revisions are a JSON array in the fenced `json` block, pretty-printed for reading/editing in Obsidian. Every revision has a stable UUID `id`, timezone-aware `createdAt`, nullable `description`, and `snapshot`. A snapshot contains the complete recipe content: title, description, original ingredients (including ingredientType), instructions, prepTime, cookTime, cookingTemperatures, servings, category, tags, metadataSources. It excludes recipe identity, timestamps, notes, and revisions, so snapshots cannot recurse. Empty history is `[]`.

## Validation and canonical form

The shared Zod schemas validate persistence, imports, exports, and AI results. Object keys inside JSON structures are sorted; metadata labels have the fixed order above. Canonical output uses LF and a final newline. Ingredient/step/note/revision array order is preserved. All dates and original measurements round trip unchanged; no export-time dates replace saved values.

- UUID recipe/note/revision IDs; duplicate IDs within their respective recipe lists are rejected.
- At most 2,000 recipes and 5 MiB of canonical UTF-8 Markdown, enforced inside write transactions.
- At most 200 ingredients, 200 instructions, 50 tags, 10 cooking temperatures, 500 cooking notes, and 100 revisions per recipe. Full revision history counts toward the backup size.
- Title and ingredient name ≤300 characters, description/step ≤3,000, quantity/unit ≤100, ingredient note/revision description ≤1,000, cooking-note body ≤5,000, category ≤200, tag ≤100, temperature method 1–100.
- Prep/cook time is nullable integer 0–10,080 minutes, Celsius 0–500, servings nullable number 0.1–1,000, rating nullable integer 1–5. Modified dates cannot precede creation.
- UTF-8 BOM, CRLF, and blank separators are accepted. Invalid JSON, missing/reordered sections or metadata, unsupported versions, extra prose, truncated history, and nonconsecutive instruction numbers fail with useful recipe/line errors.

## Backward compatibility and merging

Version 1 uses four ingredient fields and has no temperature/source, note, or revision sections. Import preserves all old fields and adds null ingredientType, empty temperatures/notes/history, and unknown provenance. Export always writes version 2; older application versions cannot read it.

Import parses and previews the whole file before writing. Matching recipe UUIDs use incoming recipe content; notes and revisions are merged by their stable IDs, retaining local journal/history entries absent from the file. Repeated imports are idempotent. Incoming notes with matching IDs replace those note values; revisions are immutable: conflicting content for an existing revision ID rejects the merge atomically. Object-key order alone is not a conflict. Replace restores exactly the reviewed file, removing records/history absent from it in one transaction. Export a backup first.

Restoring a revision keeps cooking notes and all prior history. A safety snapshot of the current content is appended before replacement, so its state remains recoverable. Capacity errors leave the entire collection unchanged; no automatic pruning occurs. The user's measurement display preference is a device setting, not recipe data, and is not exported.
