# Recipe Tracker

A personal, mobile-first cookbook built with Next.js App Router, strict TypeScript, Tailwind, Lucide, Radix/shadcn-style owned UI primitives, Dexie/IndexedDB, Zod, and DeepSeek vision. Recipes stay on your device. Screenshots are temporary inputs, sent to the server and DeepSeek only when you request extraction.

## Run locally

Use Node.js 22 LTS or newer and npm. Dependencies are pinned in `package-lock.json`.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

On PowerShell, use `Copy-Item .env.example .env.local`. Visit http://localhost:3000. Manual recipes, editing, search, filters, cooking checklists, and Markdown backups work without AI configuration. Configure `DEEPSEEK_API_KEY` and a random `APP_ACCESS_TOKEN` of at least 32 characters to enable local extraction. Enter this private app code in the screenshot dialog; never enter your DeepSeek key in the browser. The code is held in memory and must be entered again after reloading. The development limiter permits ten authorized requests per ten-minute window per code.

## What you can do

- Upload 1–6 screenshots of one recipe. Browser-side compression keeps the upload under Vercel's payload limit. Retry errors without selecting the files again.
- Review AI output, missing amounts, and ambiguities; edit all recipe fields, ingredients, and step order before saving.
- Create, view, edit, delete, search by title/ingredient, filter by category/tag, and sort recipes.
- Check off ingredients while cooking. Choose system, light, or dark appearance.
- Export everything into **one `recipe-collection.md`**. Preview imports, merge by UUID without duplicates, or explicitly replace the collection.
- Install the PWA and use saved recipes, local editing, and backups offline. AI extraction always requires internet.

## Offline / iPhone installation

Service workers run in the production build, not the development server:

```sh
npm run build
npm run start
```

On iPhone, open your HTTPS app URL in Safari, tap Share → **Add to Home Screen** → Add. Open it online until **Available offline on this device** appears. iPhone Safari and the installed Home Screen app may have separate browser storage; import your Markdown backup in the installed app if needed. Localhost works for desktop testing; an iPhone needs an HTTPS deployment to install and cache reliably.

The first successful visit downloads the shell and its assets. Later versions display an Update action; updates wait until you finish editing. Recipes are not cloud-synced. Browser eviction, clearing site data, or changing devices can remove local data. Export backups regularly; the app requests persistent storage when supported but cannot guarantee it.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

The E2E suite uses installed Microsoft Edge on Windows and bundled Chromium in CI, at iPhone 13 and desktop sizes. It tests a real production service worker and offline reload. On CI/Linux install Chromium first with `npx playwright install --with-deps chromium` and run with `CI=true`. Browser tests mock DeepSeek; they do not spend API credits. A real extraction needs server credentials and must be verified separately. Physical iPhone installation is a separate device check.

## Security and deployment

The only required user-configured secrets are `DEEPSEEK_API_KEY` and `APP_ACCESS_TOKEN`. Vercel's native Firewall SDK handles quota counters; publish its `recipe-extraction` rule as [documented](docs/DEPLOYMENT.md). Extraction fails closed if the rule is missing, blocked, or unreachable. No Redis account or Redis credentials are needed. Recipes remain in IndexedDB on each device; screenshots are temporary AI inputs. The API retains authentication, same-origin checks, bounded streaming body reads, image validation, timeouts, and no-store responses.

Share the private app code only with the people you invite to use screenshot extraction. Everyone uses your DeepSeek account and shares the configured quota (recommended: ten requests per ten minutes per environment and Vercel region). This is an invitation code, not a separate account per person: rotating it revokes the old code for everyone. It does not grant access to anyone else's device-local recipes. A Vercel-protected preview additionally requires Vercel deployment access; the app code does not bypass that login.

See [architecture](docs/ARCHITECTURE.md), [Markdown specification](docs/RECIPE_FORMAT.md), and [Vercel setup](docs/DEPLOYMENT.md). `dev`/PRs are for previews; `main` is for production after human review. This project never merges or directly deploys production automatically from a local script.
