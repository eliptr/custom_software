# Implementation and validation record

Validated locally on 2026-10-15 (Europe/Athens), Windows, Node.js 24.15.0, npm 11.12.1. Runtime dependency versions are pinned in the lockfile; CI uses Node.js 22.

| Executed check | Result |
| --- | --- |
| `npm run typecheck` (Next type generation + strict TypeScript) | Passed |
| `npm run lint` | Passed, no warnings |
| `npm test` | 42 passed across 7 files |
| `npm run build` | Passed; static `/` shell and dynamic `/api/extract` |
| `npm run test:e2e` | 14 passed: 7 scenarios each at mobile and desktop sizes in Microsoft Edge |
| `npm audit --audit-level=moderate` | 0 vulnerabilities |
| `git diff --check` | Passed |

Unit coverage includes schema rejection, null quantities, Greek/Unicode/fractions, accent-insensitive search, CRUD/reopening IndexedDB, merge/upsert/replace, rollback for invalid data, restorable collection capacity, canonical Markdown round trips, malformed/duplicate/truncated Markdown, AI normalization/duplicate handling, one request for multiple images, provider errors, authentication/origin/streamed size limits, MIME checks, Vercel/local quotas, and service-worker installation/activation/cache exclusions. New rate-limit checks cover a shared hashed code bucket across IPs, separate preview/production keys, credential-free SDK headers, local window rollover, 429 retry guidance, missing/blocked rules, outages, timeouts, and fail-closed production outside Vercel. Route integration tests verify that failed authentication or quotas prevent provider calls and that successful checks precede extraction.

Private app codes no longer have a minimum length. Matching one-character, four-character, and longer codes are unit-tested; wrong codes, blank configuration, and the `REPLACE_ME` placeholder are rejected. The route integration tests use a four-character code. The screenshot browser flow rejects a blank code before sending a request, then proceeds with a four-character code through the mocked error/retry/review workflow.

Browser checks cover unauthorized real API requests and no-store headers; manual create/edit/delete and confirmation; ingredient checkboxes; reordering steps; persistence across reload; title/ingredient search and filters; downloading one Markdown file; import previews, repeated merges, and replacement; actual service-worker-controlled offline reload and local editing; multiple-image extraction with mocked error/retry/review; malformed import feedback; cancel/discard behavior; dark mode; and absence of horizontal overflow. Chrome-color checks cover manual overrides, saved-theme reloads, and live system appearance changes. The new check caught duplicate theme-color metadata after reload; bootstrap metadata mutation was removed and the full suite passed. Mobile and desktop screenshots were visually inspected. Earlier notification/focus issues were also fixed and verified.

Hosted CI exposed timing races in the E2E suite: a repeated import could start while the previous merge was still finishing, and a reload could interrupt an unfinished save. Tests now wait for the import dialog to close and the saved detail heading to appear before continuing. These are application completion signals, without arbitrary sleeps or test retries. GitHub Actions use current official releases with supported runtimes.

## Created or modified implementation files

- App: `src/app/page.tsx`, `layout.tsx`, `globals.css`, `api/extract/route.ts`.
- UI: `src/components/recipe-app.tsx`, `recipe-editor.tsx`, `recipe-details.tsx`, `pwa-status.tsx`, `theme-chrome.tsx`, `ui/button.tsx`, `ui/modal.tsx`.
- Shared/local data: `src/lib/recipe.ts`, `db.ts`, `markdown.ts`, `images.ts`, `utils.ts`.
- Server extraction/security: `src/lib/ai/provider.ts`, `ai/deepseek.ts`, `server/security.ts`.
- PWA: `public/manifest.webmanifest`, `public/icons/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `scripts/build-service-worker.mjs`, `service-worker.js`, `generate-icons.mjs`. `public/sw.js` is generated and ignored.
- Validation: `vitest.config.ts`, `playwright.config.ts`, `tests/fixtures.ts`, `tests/unit/{recipe,db,markdown,ai,security,extract-route,service-worker}.test.ts`, `tests/e2e/recipes.spec.ts`, `.github/workflows/ci.yml`.
- Setup/docs: `package.json`, `package-lock.json`, `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs`, `next.config.ts`, `.gitignore`, `.gitattributes`, `.env.example`, `README.md`, `docs/ARCHITECTURE.md`, `docs/RECIPE_FORMAT.md`, `docs/DEPLOYMENT.md`, this file. Next-generated `next-env.d.ts` is intentionally ignored.

## Verification limits and remaining setup

- GitHub authentication was restored on 2026-10-15. The initialized `main` and complete `dev` branches were published with normal pushes to [eliptr/custom_software](https://github.com/eliptr/custom_software). No branch protections were bypassed. The earlier authentication blocker is resolved; hosted CI and Vercel results must still be checked separately from the local results above.

- No real DeepSeek request was made: no API key was supplied. Official vision/JSON support was checked, and provider behavior was tested with mocked responses. Configure secrets and verify a real two-screenshot recipe on a private preview.
- Redis rate limiting has been replaced by `@vercel/firewall` 1.2.6, checked against the installed SDK and [official SDK documentation](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk). The native rule is now published and verified active/valid through the authenticated Vercel CLI. Eleven live checks using an isolated header bucket returned ten HTTP 204 responses followed by HTTP 429, without calling DeepSeek or using the app's actual quota bucket. SDK error and route-ordering behavior is additionally covered by mocks.
- The Vercel project has encrypted entries for `DEEPSEEK_API_KEY` and `APP_ACCESS_TOKEN` in Preview/Production, initially created as placeholders. Their presence and updated timestamps were checked after the owner edited the values; no secret values were displayed. The app-code setting's help text now reflects the absence of a minimum length. System environment exposure and an environment-enabled automation bypass were verified true. The production branch was verified `main`, and interactive deployment protection remains enabled. New environment values require a Preview redeployment; no production code deployment was performed.
- The user's iPhone screenshot showed the dark UI with a pale native status strip. The status-bar metadata, root backgrounds, dark standalone safe-area backdrop, and header spacing have been updated. The revised native status-bar appearance and keyboard/safe-area behavior need physical-device confirmation; the browser suite uses Chromium emulation.
- Before the rate-limit update, GitHub Actions passed for commit `a65f81d` and Vercel's automatic Git integration reported a successful Preview deployment. Its URL is [customsoftware-bqnkxg95v-eliptrs-projects.vercel.app](https://customsoftware-bqnkxg95v-eliptrs-projects.vercel.app); visiting it requires Vercel login. Page content could not be verified without that login, and access protection was not changed. Current commit checks and newer preview URLs are available on [PR #1](https://github.com/eliptr/custom_software/pull/1). No direct deployment or production merge was performed.
- Browser screenshots/traces, local dependency/build directories, credentials, and `.env.local` are excluded from Git. Recipe data is device-local; use Markdown backups for migration and recovery.
