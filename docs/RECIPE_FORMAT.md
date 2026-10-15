# Single-file Markdown format, version 2

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
