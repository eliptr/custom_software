# Saved ingredient equivalents

Original ingredient names, quantity strings, unit strings and notes remain authoritative. AI estimates are separate data. An ingredient can have a saved metric amount and US cups/spoons amount regardless of catalog membership, including cottage cheese, ricotta, or manually entered ingredients. Estimates are practical cooking approximations and are not guaranteed to match a particular Google result, brand, density chart, or preparation.

## Request and review

Screenshot extraction (`/api/extract`) and **Re-estimate metadata** (`/api/estimate`) request equivalents in the same existing DeepSeek call, with `conversionVersion: 1`. Every current ingredient is submitted; there is no catalog requirement, shared density library, or separate conversion request. Authentication, request-size limits, quota checks, 80-second timeout and one bounded format retry remain unchanged.

The model proposes structured numeric amounts: solids use grams/kilograms, liquids ml/liters, alternatives use US cups/tablespoons/teaspoons. It may estimate ingredient-dependent or count-based equivalents. Missing quantities, to taste, ambiguous ranges and unavailable sides stay null. Original ingredient strings cannot be changed by applying suggestions. Invalid per-row data, unknown units, nonfinite/nonpositive numbers, duplicate references and mismatched fingerprints are ignored without clearing saved values or losing valid metadata/other proposals.

Screenshot pairs populate the unsaved draft for inspection before Save. Re-estimation displays current and proposed pairs together; each ingredient has Accept pair / Reject controls. Metadata acceptance is independent. Accepting replaces that pair in the draft, normal recipe saving persists it, and rejection leaves the old pair intact. Unavailable sides show the original when no exact same-dimension fallback is available. A model's partial null pair can be reviewed deliberately; an entirely unavailable or malformed proposal is never applied.

Every estimation target uses a request-local UUID and fingerprint of exact name, quantity, unit, notes and full source measurement context. Server and client validate targets, coverage and response correlation. The editor associates them with stable row IDs, not current array positions. Full input and prior accepted pair are checked again before applying. Concurrent quantity edits, removals/re-additions, or relevant context edits invalidate pending proposals; reordering remains safe. Failed requests leave current pairs unchanged.

## Deterministic relationships

`conversion/equivalents.ts` normalizes proposals before storage. Direct mass relationships override contradictory model mass amounts; direct volume relationships likewise anchor the US alternative. For liquids, metric and US amounts derive from a single volume so they cannot disagree. When density is needed, the ingredient-dependent amount remains marked estimated rather than claiming exactness. Preparation and packing are conveyed in the model's assumptions for user review. Heaped cups/spoons cannot establish an exact level volume.

Source convention is independent of display preference: US customary, 250 ml cup / 15 ml tablespoon / 5 ml teaspoon, 240 ml cup / 15 ml tablespoon / 5 ml teaspoon, Australian 250 ml cup / 20 ml tablespoon / 5 ml teaspoon, or unknown. Existing unspecified recipes retain the labelled US assumption; explicit US unit text takes precedence. US customary factors are documented by [NIST](https://nvlpubs.nist.gov/nistpubs/Legacy/LC/nbslettercircular1098.pdf). Unknown source conventions cannot authorize estimates for generic cups/spoons. Source number format can be automatic, English or Greek. Auto rejects ambiguous `1,000`/`1.000`; leading decimals and common fractions remain supported.

## Persistence, edits and display

`savedMeasurements` stores nullable `metric`/`cups`, form, per-side exact/estimated origin, assumptions, original input/fingerprint, model, prompt version, and estimation timestamp. The numeric pair and input are an immutable accepted basis. Quantity-only edits calculate a fresh ratio from that basis, without writing rounded results back. Repeated edits/toggles never accumulate rounding. Changes to name, notes, unit or measurement context disable the old pair until refreshed; it is retained for backup/history rather than erased. Ambiguous quantity edits also disable use.

The display path reads the valid saved side first, then uses deterministic same-dimension math, then shows the original. Existing recipes do not acquire AI estimates until the user deliberately requests Re-estimation. Catalog profiles no longer drive current density conversions; old identity data and provider response paths remain for backward compatibility. Opening or reloading never triggers paid work.

Details show the selected amount, an `≈` marker for AI estimates, and small original-amount helper text. Editor disclosures contain assumptions and provenance, source convention/number settings, and Keep original measurement. Numeric display uses practical fractions within 1% relative error or four significant decimal digits under the same bound; impractically tiny spoon measures stay original. Stored numeric precision is unchanged.

IndexedDB v4 and single-Markdown format `recipe-tracker/4` retain pairs in recipes and revision snapshots. Formats 1–3 and databases 1–3 add null fields without changing original text, dates or history. Display preferences remain in localStorage (`recipe-measurements-v1`). Opening, rendering, toggling, local edits, saved-equivalent rescaling, and offline reload make zero AI calls. Only the two explicit AI actions require internet and consume quota.

`equivalents-schema.ts`, `equivalents.ts`, and `equivalent-suggestions.ts` own the new model, math and review correlation. `units.ts`, `quantity.ts`, and `format.ts` remain reusable deterministic helpers. `measurements.ts` orchestrates display. The older catalog/identity/suggestions modules are retained only for stored history and older-client API compatibility.
