# Architecture

## Components and data flow

`src/app/page.tsx` renders the client `RecipeApp`. Its collection, detail, and editor views all use the same `/` application shell, avoiding uncached detail URLs. Radix Dialog provides modal focus trapping, keyboard escape, and accessible titles. Owned button/modal primitives follow the shadcn approach. CSS uses warm monochrome tokens, serif headings, touch targets, safe areas, and system/light/dark themes.

`src/lib/recipe.ts` defines one strict Zod content model and the persistence extension (UUID + timestamps). Optional semantic fields are always present and nullable; tags are always an array. Quantity is a string or null, preserving fractions, Greek text, and units rather than forcing a numeric representation. Drafts may have an empty title; saved recipes must have a nonblank title. Unicode is retained exactly; search separately removes accents and normalizes Greek final sigma. No HTML from recipe strings is rendered.

`src/lib/db.ts` owns the Dexie database, version 1. Recipes have UUID primary keys and indexes for title, dates, category, and tags. `useLiveQuery` updates the collection after mutations. Writes validate first; merge/replace uses a single IndexedDB transaction. Import UUIDs are authoritative: matching records are replaced by the reviewed file's values even if the file has an older modified date. The preview clearly labels matching IDs. Different IDs remain different recipes even with identical titles.

## Screenshot extraction

1. The browser accepts 1–6 JPEG/PNG/WebP files, at most 20 MB each. It decodes locally, rejects extreme dimensions, scales the longest side to at most 1800 pixels, and converts to JPEG. Combined decoded bytes must be at most 2.8 MB, each at most 1.5 MB.
2. The user enters a separate app access token (memory only). A same-origin POST sends images to `/api/extract`. No `NEXT_PUBLIC_` key is used. Original files and prepared images never enter IndexedDB, localStorage, or a file server.
3. The Node route checks the token using fixed-length SHA-256 digests and timing-safe comparison, enforces origin and JSON type, streams the body with a 4,000,000-byte cap, validates base64/MIME signatures, deduplicates identical image data, and consumes a rate-limit slot.
4. `RecipeExtractor` is the provider boundary. `DeepSeekExtractor` sends every screenshot in one Chat Completions vision message. `deepseek-flash` image support and JSON output were checked against official documentation on 2026-10-14: [vision](https://api-docs.deepseek.com/guides/vision/), [JSON mode](https://api-docs.deepseek.com/guides/json_mode/). The prompt treats screenshots as untrusted content, preserves language, and forbids guessing. Adding another provider requires implementing this interface; the UI/schema need not change.
5. The provider uses JSON mode, an 80-second timeout, and 6,000 output tokens; errors/truncation/empty/invalid content produce retryable feedback. Normalization supplies null only for omitted optional fields, converts explicit numeric quantities to strings, removes exact duplicates, and flags missing quantities and conflicting ingredient entries. It never fills unsupported facts. Model accuracy still requires user review.
6. The editor displays warnings and the draft. Only Save assigns UUID/timestamps and writes IndexedDB. Cancel removes the temporary inputs. Nothing is saved automatically by extraction.

DeepSeek receives the screenshots to process them; its data handling policy applies. The app does not retain screenshots or log request bodies. Failed requests may still consume the hourly quota and provider credits. HEIC is deliberately rejected with conversion guidance.

## API access and quotas

All paid requests require a private `APP_ACCESS_TOKEN` of at least 32 characters. No anonymous paid proxy exists. Ten authorized requests per fixed hour per token are allowed. Local development uses process memory. Production requires Upstash Redis REST; one atomic Lua INCR/EXPIRE operation shares counters across function instances and survives cold starts. Only a hashed token prefix, a time-window index, and a count are stored for one hour. Limiter absence or failure returns 503 before DeepSeek is called. Configure Vercel Firewall as documented to limit unauthorized traffic at the edge. No client IP supplied by a user is trusted for billing quotas.

Request-size limits also enforce bodies without Content-Length. All API responses are no-store; service workers exclude `/api/` and all POST requests. API secrets are never returned to the browser. HTTPS is required for deployed use.

## Markdown and offline caching

`src/lib/markdown.ts` serializes every supported field into one canonical, versioned Markdown file. Recipes sort by UUID for deterministic output. A bounded parser validates structure, field order, consecutive steps, IDs, and Zod semantics. Blank separator lines, UTF-8 BOM, and CRLF are accepted. Duplicate IDs within a file are rejected. See the complete format specification.

The supported collection capacity is 2,000 recipes and 5 MiB of canonical Markdown. CRUD and merge validate this capacity inside the write transaction, guaranteeing that accepted saved collections can be restored from their export. Capacity errors do not modify existing data.

At build time the worker cache name gets a hash of source, public assets, build configuration, and lockfile. Installation fetches the root HTML, discovers its hashed JS/CSS assets, and caches those plus manifest/icons before completing. Navigation uses the network first and falls back to that installed shell offline. Immutable static assets use cache-first. A new worker waits; the app offers Update only outside editors and pending operations. Activation removes older Recipe Tracker caches and claims clients; an approved controller change reloads. IndexedDB is independent of the cache and is never cleared by updates. A failed worker installation keeps the previous worker active. Unsupported storage or operation failures have user-visible feedback.

Themes are the only preference stored in localStorage. Cooking checkboxes are temporary view state. There is no cross-device sync; Markdown is the portable backup.
