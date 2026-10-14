# Implementation and validation record

Validated locally on 2026-10-15 (Europe/Athens), Windows, Node.js 24.15.0, npm 11.12.1. Runtime dependency versions are pinned in the lockfile; CI uses Node.js 22.

| Executed check | Result |
| --- | --- |
| `npm run typecheck` (Next type generation + strict TypeScript) | Passed |
| `npm run lint` | Passed, no warnings |
| `npm test` | 26 passed across 6 files |
| `npm run build` | Passed; static `/` shell and dynamic `/api/extract` |
| `npm run test:e2e` | 12 passed: 6 scenarios each at mobile and desktop sizes in Microsoft Edge |
| Dependency audit during final package installation | 0 vulnerabilities |
| `git diff --check` | Passed |

Unit coverage includes schema rejection, null quantities, Greek/Unicode/fractions, accent-insensitive search, CRUD/reopening IndexedDB, merge/upsert/replace, rollback for invalid data, restorable collection capacity, canonical Markdown round trips, malformed/duplicate/truncated Markdown, AI normalization/duplicate handling, one request for multiple images, provider errors, authentication/origin/streamed size limits, MIME checks, distributed/local quotas, and service-worker installation/activation/cache exclusions.

Browser checks cover unauthorized real API requests and no-store headers; manual create/edit/delete and confirmation; ingredient checkboxes; reordering steps; persistence across reload; title/ingredient search and filters; downloading one Markdown file; import previews, repeated merges, and replacement; actual service-worker-controlled offline reload and local editing; multiple-image extraction with mocked error/retry/review; malformed import feedback; cancel/discard behavior; dark mode; and absence of horizontal overflow. Mobile and desktop screenshots were visually inspected. The mobile suite exposed a notification blocking Settings; this was fixed and verified in the final passing run. Dialog focus restoration was also corrected.

Hosted CI exposed timing races in the E2E suite: a repeated import could start while the previous merge was still finishing, and a reload could interrupt an unfinished save. Tests now wait for the import dialog to close and the saved detail heading to appear before continuing. These are application completion signals, without arbitrary sleeps or test retries. GitHub Actions use current official releases with supported runtimes.

## Created or modified implementation files

- App: `src/app/page.tsx`, `layout.tsx`, `globals.css`, `api/extract/route.ts`.
- UI: `src/components/recipe-app.tsx`, `recipe-editor.tsx`, `recipe-details.tsx`, `pwa-status.tsx`, `ui/button.tsx`, `ui/modal.tsx`.
- Shared/local data: `src/lib/recipe.ts`, `db.ts`, `markdown.ts`, `images.ts`, `utils.ts`.
- Server extraction/security: `src/lib/ai/provider.ts`, `ai/deepseek.ts`, `server/security.ts`.
- PWA: `public/manifest.webmanifest`, `public/icons/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `scripts/build-service-worker.mjs`, `service-worker.js`, `generate-icons.mjs`. `public/sw.js` is generated and ignored.
- Validation: `vitest.config.ts`, `playwright.config.ts`, `tests/fixtures.ts`, `tests/unit/{recipe,db,markdown,ai,security,service-worker}.test.ts`, `tests/e2e/recipes.spec.ts`, `.github/workflows/ci.yml`.
- Setup/docs: `package.json`, `package-lock.json`, `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs`, `next.config.ts`, `.gitignore`, `.gitattributes`, `.env.example`, `README.md`, `docs/ARCHITECTURE.md`, `docs/RECIPE_FORMAT.md`, `docs/DEPLOYMENT.md`, this file. Next-generated `next-env.d.ts` is intentionally ignored.

## Verification limits and remaining setup

- GitHub authentication was restored on 2026-10-15. The initialized `main` and complete `dev` branches were published with normal pushes to [eliptr/custom_software](https://github.com/eliptr/custom_software). No branch protections were bypassed. The earlier authentication blocker is resolved; hosted CI and Vercel results must still be checked separately from the local results above.

- No real DeepSeek request was made: no API key was supplied. Official vision/JSON support was checked, and provider behavior was tested with mocked responses. Configure secrets and verify a real two-screenshot recipe on a private preview.
- Upstash's API contract was verified from [official REST documentation](https://upstash.com/docs/redis/features/restapi); rate-limit success/failure behavior was mocked, with no hosted Redis instance provisioned.
- Real iPhone Safari installation and keyboard/safe-area behavior need a physical device. The mobile suite uses Chromium emulation, not Safari/WebKit.
- Vercel's automatic Git integration reported a successful Preview deployment for commit `262b76f`. Its URL is [customsoftware-8yxff381k-eliptrs-projects.vercel.app](https://customsoftware-8yxff381k-eliptrs-projects.vercel.app); visiting it requires Vercel login. Page content could not be verified without that login, and access protection was not changed. No direct deployment or production merge was performed.
- Browser screenshots/traces, local dependency/build directories, credentials, and `.env.local` are excluded from Git. Recipe data is device-local; use Markdown backups for migration and recovery.
