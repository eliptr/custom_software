# Architecture

## Components and data flow

`src/app/page.tsx` renders the client `RecipeApp`. Its collection, detail, and editor views all use the same `/` application shell, avoiding uncached detail URLs. Radix Dialog provides modal focus trapping, keyboard escape, and accessible titles. Owned button/modal primitives follow the shadcn approach. CSS uses warm monochrome tokens, serif headings, touch targets, safe areas, and system/light/dark themes.

`ThemeChrome` synchronizes the single `theme-color` meta tag with the resolved CSS background after hydration, manual theme changes, or system appearance changes. An early head script restores the saved theme without mutating React-owned metadata before hydration. Both HTML and body paint the app background. Installed iOS uses `black-translucent` status-bar metadata plus a fixed dark safe-area backdrop, with added header height to keep controls below the status icons. The backdrop preserves contrast in light mode; native iOS rendering remains a physical-device check.

`src/lib/recipe.ts` defines one strict Zod content model and the persistence extension (UUID + timestamps). Optional semantic fields are always present and nullable; tags are always an array. Quantity is a string or null, preserving fractions, Greek text, and units rather than forcing a numeric representation. Drafts may have an empty title; saved recipes must have a nonblank title. Unicode is retained exactly; search separately removes accents and normalizes Greek final sigma. No HTML from recipe strings is rendered.

`src/lib/db.ts` owns the Dexie database, version 1. Recipes have UUID primary keys and indexes for title, dates, category, and tags. `useLiveQuery` updates the collection after mutations. Writes validate first; merge/replace uses a single IndexedDB transaction. Import UUIDs are authoritative: matching records are replaced by the reviewed file's values even if the file has an older modified date. The preview clearly labels matching IDs. Different IDs remain different recipes even with identical titles.

## Screenshot extraction

1. The browser accepts 1–6 JPEG/PNG/WebP files, at most 20 MB each. It decodes locally, rejects extreme dimensions, scales the longest side to at most 1800 pixels, and converts to JPEG. Combined decoded bytes must be at most 2.8 MB, each at most 1.5 MB.
2. The user enters a separate private app code (memory only). A same-origin POST sends images to `/api/extract`. No `NEXT_PUBLIC_` key is used. Original files and prepared images never enter IndexedDB, localStorage, or a file server.
3. The Node route checks the token using fixed-length SHA-256 digests and timing-safe comparison, enforces origin and JSON type, streams the body with a 4,000,000-byte cap, validates base64/MIME signatures, deduplicates identical image data, and consumes a rate-limit slot.
4. `RecipeExtractor` is the provider boundary. `DeepSeekExtractor` sends every screenshot in one Chat Completions vision message. `deepseek-flash` image support and JSON output were checked against official documentation on 2026-10-14: [vision](https://api-docs.deepseek.com/guides/vision/), [JSON mode](https://api-docs.deepseek.com/guides/json_mode/). The prompt treats screenshots as untrusted content, preserves language, and forbids guessing. Adding another provider requires implementing this interface; the UI/schema need not change.
5. The provider uses JSON mode, an 80-second timeout, and 6,000 output tokens; errors/truncation/empty/invalid content produce retryable feedback. Normalization supplies null only for omitted optional fields, converts explicit numeric quantities to strings, removes exact duplicates, and flags missing quantities and conflicting ingredient entries. It never fills unsupported facts. Model accuracy still requires user review.
6. The editor displays warnings and the draft. Only Save assigns UUID/timestamps and writes IndexedDB. Cancel removes the temporary inputs. Nothing is saved automatically by extraction.

DeepSeek receives the screenshots to process them; its data handling policy applies. The app does not retain screenshots or log request bodies. Failed requests may still consume the quota and provider credits. HEIC is deliberately rejected with conversion guidance.

## API access and quotas

All paid requests require a private `APP_ACCESS_TOKEN` of at least 32 characters. Invited users share that code and your AI quota; recipes remain separate on each device. Rotating the code revokes it for everyone. Vercel Deployment Protection is a separate access gate for protected previews.

Production calls `@vercel/firewall`'s `checkRateLimit` for rule ID `recipe-extraction`, with a SHA-256 hash of the validated app code and deployment environment as the bucket key. Caller IP cannot split the shared quota. Only the destination host and IP forwarding headers are supplied to the SDK; the app code, unrelated cookies, and uploaded images are not forwarded. The SDK adds Vercel's system-managed automation bypass secret to its internal request when configured. A three-second timeout bounds the check. Missing-rule and blocked results, network errors, and timeouts return 503 before DeepSeek is called; exhausted quota returns 429 with a conservative ten-minute Retry-After.

The published dashboard rule defines the production window and limit; the recommended fixed window is 10 requests / 10 minutes, compatible with Hobby's maximum window. Vercel's counters are regional, so traffic served in different regions can consume separate buckets. They survive function cold starts without a recipe database or Redis service. Local development/tests use process memory with the same recommended window; production outside Vercel fails closed rather than relying on process-local counters. See [Vercel setup](DEPLOYMENT.md) for the required dashboard configuration and optional edge protection against unauthorized traffic.

Request-size limits also enforce bodies without Content-Length. All API responses are no-store; service workers exclude `/api/` and all POST requests. API secrets are never returned to the browser. HTTPS is required for deployed use.

## Markdown and offline caching

`src/lib/markdown.ts` serializes every supported field into one canonical, versioned Markdown file. Recipes sort by UUID for deterministic output. A bounded parser validates structure, field order, consecutive steps, IDs, and Zod semantics. Blank separator lines, UTF-8 BOM, and CRLF are accepted. Duplicate IDs within a file are rejected. See the complete format specification.

The supported collection capacity is 2,000 recipes and 5 MiB of canonical Markdown. CRUD and merge validate this capacity inside the write transaction, guaranteeing that accepted saved collections can be restored from their export. Capacity errors do not modify existing data.

At build time the worker cache name gets a hash of source, public assets, build configuration, and lockfile. Installation fetches the root HTML, discovers its hashed JS/CSS assets, and caches those plus manifest/icons before completing. Navigation uses the network first and falls back to that installed shell offline. Immutable static assets use cache-first. A new worker waits; the app offers Update only outside editors and pending operations. Activation removes older Recipe Tracker caches and claims clients; an approved controller change reloads. IndexedDB is independent of the cache and is never cleared by updates. A failed worker installation keeps the previous worker active. Unsupported storage or operation failures have user-visible feedback.

Themes are the only preference stored in localStorage. Cooking checkboxes are temporary view state. There is no cross-device sync; Markdown is the portable backup.
