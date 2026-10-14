# GitHub → Vercel deployment

The app is compatible with Vercel's Next.js framework preset. Do not merge the implementation pull request or deploy directly to production as part of development.

## Repository publication

The initialized `main` and complete `dev` branches were published to [eliptr/custom_software](https://github.com/eliptr/custom_software) on 2026-10-15 after Git authentication was restored. No branches were overwritten, deleted, or force-pushed. Production deployment remains a separate Vercel setup step.

For future pushes, authenticate Git through Git Credential Manager (or another authorized Git credential method), with write access to this repository. Keep existing branch protections intact. The normal publishing commands are:

```sh
git push -u origin main
git push -u origin dev
```

Pull requests use base `main` and compare `dev`. Do not merge until the preview is configured and reviewed. No reset, force-push, or branch deletion is needed.

## Connect once in Vercel

An existing Git integration has now published a successful protected Preview deployment. For that project, verify the settings below rather than importing a duplicate project. The implementation pull request is [PR #1](https://github.com/eliptr/custom_software/pull/1).

1. Import GitHub repository `eliptr/custom_software` into a Vercel project. Use Next.js, repository root, Node.js 22, install `npm ci`, build `npm run build`, and default output directory. The build generates the service worker before Next compiles; checked-in icons already exist.
2. Set the **Production Branch to `main`**. Keep automatic Git previews enabled: pushes to `dev` and PRs receive Preview deployments. Production uses `main` only after a human reviews and merges the PR. Connect GitHub access without disabling branch protections.
3. Configure the environment variables below for Preview and Production separately. Add them through Vercel's environment settings; never commit values or `.env.local`. Redeploy the relevant preview after changing configuration.
4. Open the actual Preview deployment URL and verify its status in Vercel. Successful local builds do not prove a hosted deployment succeeded. This repository does not contain credentials to create/configure a Vercel project.

## Required extraction configuration

The existing `custom_software` Vercel project was configured on 2026-10-15. Both required variables were created as encrypted `REPLACE_ME` placeholders for Preview and Production. Replace their values in Settings → Environment Variables, then redeploy **Preview** to apply them. `APP_ACCESS_TOKEN` can be any nonempty private code, with no minimum length. Blank values and the explicit `REPLACE_ME` placeholder keep extraction disabled.

The `recipe-extraction` Firewall rule is published and active (10 requests / 600 seconds, counted by the SDK's `x-vercel-rate-limit-key` header). A live isolated test returned HTTP 204 for ten checks and HTTP 429 for the eleventh, without calling DeepSeek. Automatic system variables are enabled, and the SDK automation bypass is configured as an environment variable. Interactive deployment protection remains enabled and the production Git branch remains `main`. No production code deployment or PR merge was performed. The instructions below describe the configuration for future reference; these settings do not need to be recreated.

| Variable | Value / purpose |
| --- | --- |
| `DEEPSEEK_API_KEY` | Server-only DeepSeek API key with sufficient credit |
| `APP_ACCESS_TOKEN` | A nonempty private code of your choice, with no minimum length; enter exactly the same value as the Private app code |
| `DEEPSEEK_MODEL` | Optional; defaults to `deepseek-flash` |
| `APP_ORIGIN` | Optional exact HTTPS origin without trailing slash; omit in dynamic previews |

Only `DEEPSEEK_API_KEY` and `APP_ACCESS_TOKEN` are required user-configured secrets. No Redis service or credentials are required. Generate an app code with a password manager or `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` in your own terminal; put the generated value only into environment settings. Use different codes for preview/production. Do not use `NEXT_PUBLIC_` for any secrets. `APP_ACCESS_TOKEN` is **not** the DeepSeek key.

For personal use, enter the private app code yourself. If you later invite a few trusted people, share that code with them privately. They can use screenshot extraction billed to your DeepSeek account and share your quota. Each person's recipes remain only in their device's IndexedDB. There are no individual accounts; rotating `APP_ACCESS_TOKEN` and redeploying revokes the old code for everyone. The code is kept in browser memory until reload. A protected Vercel preview also requires deployment access; this code does not bypass Vercel login.

## Configure native Vercel rate limiting once

The code uses `@vercel/firewall` 1.2.6. Installing the SDK does **not** create a firewall rule. In the existing project's Firewall tab, create and publish a custom rule with:

| Setting | Value |
| --- | --- |
| Name | Recipe extraction |
| If condition | `@vercel/firewall` |
| Rate limit ID | `recipe-extraction` (exactly) |
| Then action | Rate Limit |
| Algorithm | Fixed Window |
| Window | 10 minutes / 600 seconds |
| Limit | 10 requests |
| Bucket key | SDK header `x-vercel-rate-limit-key` |
| Rate-limited action | Rate limit, HTTP 429 |

Do not restrict this SDK rule to the original `/api/extract` path or POST method: the SDK checks it through an internal GET endpoint. The app calls it only after authentication and image validation, before contacting DeepSeek. Save and **Publish** the rule; publishing security configuration does not merge code or deploy `main`. The recommended ten-minute window fits Hobby's maximum window. Additional rules or higher limits depend on your Vercel plan. See the [official SDK setup](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk) and [rate-limit plan limits](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).

For protected Preview deployments, enable **Protection Bypass for Automation** in project Settings → Deployment Protection and **Automatically expose System Environment Variables** in project Settings → Environment Variables. Vercel supplies `VERCEL_AUTOMATION_BYPASS_SECRET` to the SDK automatically; do not copy it into the app or share it with users. These platform-managed settings add no extra user-created secret. Keep interactive preview protection enabled. Redeploy the preview after changing environment settings.

The app hashes the validated private code and combines it with the deployment environment for a shared bucket. Changing IPs does not create a new code quota. Vercel counters are **per region**, so this is not a strict worldwide or hourly spending cap. The window changed from the previous hourly limiter to ten minutes; all invited users share its ten slots. A downstream failure still consumes a slot. A full quota returns HTTP 429 and a conservative `Retry-After: 600`; a missing rule, blocked SDK request, outage, or three-second timeout returns 503 before spending AI credit. The firewall controls the deployed limit; keep its window at 600 seconds to match the retry guidance. Production outside Vercel is deliberately blocked. `npm run dev` uses the same recommended quota in process memory for local testing.

Manual/offline features work without this configuration. If your plan permits another rule, an optional edge rule for POST `/api/extract` can rate-limit unauthorized traffic before it reaches a function. That edge rule is separate from the required SDK rule. Keep your app code private and use provider credit limits and Vercel usage alerts as a separate spending control.

The API caps streamed JSON at 4,000,000 bytes (under Vercel's [4.5 MB function payload limit](https://vercel.com/docs/functions/limitations)), checks image types/signatures and aggregate sizes, refuses remote image URLs, and never writes screenshots to disk. Source input limit is 20 MB per file; prepared limit is 1.5 MB per image / 2.8 MB total. Use cropped recipe text if compression still exceeds the cap. HTTPS and a Node runtime function with 90-second max duration are required; use a Vercel plan/configuration that permits this duration. The provider has one 80-second budget for both attempts: invalid AI JSON or field types trigger a single automatic format retry, which can spend a second provider call within the same firewall slot. Service errors and quota exhaustion do not automatically retry.

## Verify the preview

- Create a manual recipe containing Greek text, ingredients with blank quantities, and ordered steps. Reload and edit it.
- Configure the two preview secrets and published firewall rule, enter only its private app code, and extract two overlapping screenshots of one recipe. Review against the source, save, and retry an error if one occurs. No live extraction is claimed until this is actually checked.
- Confirm the quota blocks the eleventh authorized request in the same ten-minute window with 429. Missing or unreachable firewall configuration must block extraction with 503; these failure paths are unit-tested with SDK mocks, not verified against a configured live Vercel rule yet.
- Export `recipe-collection.md`, re-import twice with Merge (no duplicate UUIDs), then test Replace after exporting a backup.
- Confirm the manifest/icons and **Available offline on this device** indicator. Disconnect and reload; saved recipes and editing must work, while extraction is clearly unavailable.
- On a real iPhone, open Safari → Share → Add to Home Screen. Verify standalone layout, keyboard behavior, safe areas, and offline startup. Desktop mobile emulation does not prove physical iOS installation.
- For the status-bar update, use the app's Update action, then close and reopen it. The dark status backdrop replaces the pale strip and preserves status-icon contrast in light mode. If iOS retains old installation metadata, export your collection before reinstalling the Home Screen app and restore the backup if needed.
- On a later preview build, verify the Update banner and that it waits while editing. IndexedDB survives shell updates. Keep service-worker `no-cache` headers.

Each preview hostname and production hostname has its own IndexedDB. Recipes do not automatically move between them; export/import the single Markdown file to migrate. Do not add a service worker that caches API requests or credentials.
