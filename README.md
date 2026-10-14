# Recipe Tracker

A personal, mobile-first cookbook built with Next.js App Router, strict TypeScript, Tailwind, Lucide, Radix/shadcn-style owned UI primitives, Dexie/IndexedDB, Zod, and DeepSeek vision. Recipes stay on your device. Screenshots are temporary inputs, sent to the server and DeepSeek only when you request extraction.

## Run locally

Use Node.js 22 LTS or newer and npm. Dependencies are pinned in `package-lock.json`.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

On PowerShell, use `Copy-Item .env.example .env.local`. Visit http://localhost:3000. Manual recipes, editing, search, filters, cooking checklists, and Markdown backups work without AI configuration. Configure `DEEPSEEK_API_KEY` and a random `APP_ACCESS_TOKEN` of at least 32 characters to enable local extraction. Enter the app access token in the screenshot dialog; never enter your DeepSeek key in the browser. The access token is held in memory and must be entered again after reloading. The development limiter permits ten authorized requests per hour per token.

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

Production extraction fails closed until `DEEPSEEK_API_KEY`, `APP_ACCESS_TOKEN`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN` are configured. Upstash stores only expiring quota counters, never recipes or screenshots. No recipe cloud database, ORM, or account service is used. The API has authentication, same-origin checks, bounded streaming body reads, image validation, timeouts, a ten-request hourly shared quota, and no-store responses. Do not share the access token publicly. See [deployment](docs/DEPLOYMENT.md) for Vercel Firewall and spending limits.

See [architecture](docs/ARCHITECTURE.md), [Markdown specification](docs/RECIPE_FORMAT.md), and [Vercel setup](docs/DEPLOYMENT.md). `dev`/PRs are for previews; `main` is for production after human review. This project never merges or directly deploys production automatically from a local script.
