# GitHub → Vercel deployment

The app is compatible with Vercel's Next.js framework preset. Do not merge the implementation pull request or deploy directly to production as part of development.

## Publish the already tested local commits

This workspace contains the initialized `main` and finished `dev` branches. On 2026-10-15, publishing was blocked: command-line Git had no usable authenticated credentials and the connected GitHub integration rejected the write with `403 Resource not accessible by integration`. No remote branches, pull request, or deployment were created.

Authenticate Git with your GitHub account through Git Credential Manager (or configure another authorized Git credential method), ensuring write access to `eliptr/custom_software`. Alternatively, reconnect/configure the GitHub integration with repository Contents write access. Keep existing branch protections intact. Then run:

```sh
git push -u origin main
git push -u origin dev
```

Create a pull request with base `main` and compare `dev` in GitHub. Do not merge it until the preview is configured and reviewed. The local commits are preserved; no reset, force-push, or branch deletion is needed.

## Connect once in Vercel

1. Import GitHub repository `eliptr/custom_software` into a Vercel project. Use Next.js, repository root, Node.js 22, install `npm ci`, build `npm run build`, and default output directory. The build generates the service worker before Next compiles; checked-in icons already exist.
2. Set the **Production Branch to `main`**. Keep automatic Git previews enabled: pushes to `dev` and PRs receive Preview deployments. Production uses `main` only after a human reviews and merges the PR. Connect GitHub access without disabling branch protections.
3. Configure the environment variables below for Preview and Production separately. Add them through Vercel's environment settings; never commit values or `.env.local`. Redeploy the relevant preview after changing configuration.
4. Open the actual Preview deployment URL and verify its status in Vercel. Successful local builds do not prove a hosted deployment succeeded. This repository does not contain credentials to create/configure a Vercel project.

## Required extraction configuration

| Variable | Value / purpose |
| --- | --- |
| `DEEPSEEK_API_KEY` | Server-only DeepSeek API key with sufficient credit |
| `APP_ACCESS_TOKEN` | A private, random string of at least 32 characters; users enter it in the app |
| `UPSTASH_REDIS_REST_URL` | HTTPS REST URL for a small Upstash Redis rate limiter |
| `UPSTASH_REDIS_REST_TOKEN` | Server-only credential permitting EVAL/INCR/EXPIRE |
| `DEEPSEEK_MODEL` | Optional; defaults to `deepseek-flash` |
| `APP_ORIGIN` | Optional exact HTTPS origin without trailing slash; omit in dynamic previews |

Generate an access token with a password manager or `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` in your own terminal; put the generated value only into environment settings. Use different access tokens and limiter credentials for preview/production. Do not use `NEXT_PUBLIC_` for any secrets. APP_ACCESS_TOKEN is **not** the DeepSeek key.

Upstash is only a shared quota counter, not recipe storage. Create a Redis instance, copy its REST URL/token, and configure both. The code permits 10 authenticated extraction requests per fixed hour per token across server instances; requests that fail downstream count against that quota. Redis absence/outage makes production extraction return 503 before spending API credit. Rate limits protect shared paid capacity; they do not replace authentication. Manual/offline features remain usable without AI configuration.

Use Vercel Firewall to rate-limit POST requests to `/api/extract` at the edge (for example 20 requests/minute/IP) and enable available bot protections. This covers unauthorized traffic before it reaches a function. Keep the app token private and rotate it if exposed. Set a DeepSeek spending/credit limit or account alert and Vercel usage alerts. Consider Vercel Deployment Protection for private preview access; authenticated previews need to be opened with Vercel access before shell caching can complete. See [Vercel Firewall docs](https://vercel.com/docs/vercel-firewall).

The API caps streamed JSON at 4,000,000 bytes (under Vercel's [4.5 MB function payload limit](https://vercel.com/docs/functions/limitations)), checks image types/signatures and aggregate sizes, refuses remote image URLs, and never writes screenshots to disk. Source input limit is 20 MB per file; prepared limit is 1.5 MB per image / 2.8 MB total. Use cropped recipe text if compression still exceeds the cap. HTTPS and a Node runtime function with 90-second max duration are required; use a Vercel plan/configuration that permits this duration.

## Verify the preview

- Create a manual recipe containing Greek text, ingredients with blank quantities, and ordered steps. Reload and edit it.
- Configure the preview's secrets, enter only its app access token, and extract two overlapping screenshots of one recipe. Review against the source, save, and retry an error if one occurs. No live extraction is claimed until this is actually checked.
- Export `recipe-collection.md`, re-import twice with Merge (no duplicate UUIDs), then test Replace after exporting a backup.
- Confirm the manifest/icons and **Available offline on this device** indicator. Disconnect and reload; saved recipes and editing must work, while extraction is clearly unavailable.
- On a real iPhone, open Safari → Share → Add to Home Screen. Verify standalone layout, keyboard behavior, safe areas, and offline startup. Desktop mobile emulation does not prove physical iOS installation.
- On a later preview build, verify the Update banner and that it waits while editing. IndexedDB survives shell updates. Keep service-worker `no-cache` headers.

Each preview hostname and production hostname has its own IndexedDB. Recipes do not automatically move between them; export/import the single Markdown file to migrate. Do not add a service worker that caches API requests or credentials.
