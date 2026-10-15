import { test, expect, type Page } from "@playwright/test";
import { exportCollection } from "../../src/lib/markdown";
import { greekRecipe, ingredientsOnlyRecipe } from "../fixtures";
import { metadataSchema, toRecipeContent } from "../../src/lib/recipe";
import { normalizeExtraction } from "../../src/lib/ai/provider";

async function manual(page: Page, title = "Κέικ λεμονιού") {
  await page.getByRole("button", { name: "Add your first recipe" }).click();
  await page.getByRole("button", { name: "Write a recipe manually" }).click();
  await page.getByLabel(/Recipe title/).fill(title);
  await page.getByRole("button", { name: "Add ingredient", exact: true }).click();
  await page.getByLabel("Ingredient 1 name").fill("Αλεύρι");
  await page.getByLabel("Quantity", { exact: true }).fill("1 ½");
  await page.getByLabel("Unit", { exact: true }).fill("φλιτζάνι");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await page.getByLabel("Step 1", { exact: true }).fill("Ψήστε στους 180°C για 35 λεπτά.");
  await page.getByLabel("Category", { exact: true }).fill("Γλυκά");
  await page.getByLabel("Tags", { exact: true }).fill("εύκολο");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Save recipe", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}

test("the paid API rejects unauthorized requests and prevents response caching", async ({ request }) => {
  const response = await request.post("/api/extract", { data: { images: [] } });
  expect([401, 503]).toContain(response.status());
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect((await response.json()).error).toBeTruthy();
});

test("manual CRUD, cooking checklist, search, filters, and persistence", async ({ page }) => {
  await page.goto("/"); await manual(page);
  await page.getByRole("checkbox").check(); await expect(page.getByRole("checkbox")).toBeChecked();
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await page.getByLabel(/Recipe title/).fill("Κέικ για όλους");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await page.getByLabel("Step 2", { exact: true }).fill("Ανακατέψτε.");
  await page.getByRole("button", { name: "Move step 2 up", exact: true }).click();
  await page.getByRole("button", { name: "Save recipe", exact: true }).click();
  await expect(page.locator(".cooking-steps li").first()).toContainText("Ανακατέψτε.");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Κέικ για όλους", exact: true })).toBeVisible();
  await page.getByLabel("Search recipes").fill("αλευρι");
  await expect(page.locator(".recipe-card")).toHaveCount(1);
  await page.getByLabel("Filter by category").selectOption("Γλυκά");
  await page.getByLabel("Filter by tag").selectOption("εύκολο");
  await page.locator(".recipe-card").click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Keep recipe" }).click();
  await expect(page.getByRole("heading", { name: "Κέικ για όλους", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete recipe", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add your first recipe" })).toBeVisible();
});

test("one Markdown download and previewed repeated merge/replace imports", async ({ page }) => {
  await page.goto("/"); await manual(page);
  await page.getByRole("button", { name: "Settings and backups" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export collection", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("recipe-collection.md");
  const payload = { name: "recipe-collection.md", mimeType: "text/markdown", buffer: Buffer.from(exportCollection([greekRecipe])) };
  await page.getByLabel("Import Markdown collection").setInputFiles(payload);
  await expect(page.getByRole("heading", { name: "Review your import" })).toBeVisible();
  await expect(page.getByText(/1 new/)).toBeVisible();
  await page.getByRole("button", { name: "Merge recipes" }).click();
  await expect(page.getByRole("dialog", { name: "Review your import" })).toBeHidden();
  await expect(page.locator(".recipe-card")).toHaveCount(2);
  await page.getByLabel("Import Markdown collection").setInputFiles(payload);
  await expect(page.getByText(/1 existing IDs/)).toBeVisible();
  await page.getByRole("button", { name: "Merge recipes" }).click();
  await expect(page.getByRole("dialog", { name: "Review your import" })).toBeHidden();
  await expect(page.locator(".recipe-card")).toHaveCount(2);
  await page.getByLabel("Import Markdown collection").setInputFiles(payload);
  await page.getByRole("radio", { name: /Replace collection/ }).check();
  await page.getByRole("button", { name: "Replace collection", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Review your import" })).toBeHidden();
  await expect(page.locator(".recipe-card")).toHaveCount(1);
});

test("offline reload preserves recipes and local editing", async ({ page, context }) => {
  await page.goto("/"); await manual(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await expect(page.getByText("Available offline on this device")).toBeAttached();
  await expect(page.getByText("Available offline on this device")).toBeHidden();
  await context.setOffline(true); await page.reload();
  await expect(page.getByText(/You’re offline/)).toBeVisible();
  await page.locator(".recipe-card").click();
  await expect(page.getByRole("heading", { name: "Κέικ λεμονιού", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await page.getByLabel(/Recipe title/).fill("Offline recipe");
  await page.getByRole("button", { name: "Save recipe", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Offline recipe", exact: true })).toBeVisible();
});

test("screenshots are temporary, errors retry, and extraction is reviewed before saving", async ({ page }) => {
  await page.goto("/");
  let attempts = 0;
  await page.route("**/api/extract", async (route) => {
    attempts++;
    const input = route.request().postDataJSON(); expect(input.images).toHaveLength(2);
    if (attempts === 1) await route.fulfill({ status: 502, json: { error: "Please retry with clearer screenshots." } });
    else { await route.fulfill({ json: { recipe: toRecipeContent(greekRecipe), warnings: [{ field: "ingredients.1.quantity", message: "Salt quantity is missing." }] } }); }
  });
  await page.getByRole("button", { name: "Add your first recipe" }).click();
  await page.locator('input[type="file"][multiple]').setInputFiles(["public/icons/icon-192.png", "public/icons/apple-touch-icon.png"]);
  await page.getByRole("button", { name: "Extract recipe", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Enter the private app code");
  expect(attempts).toBe(0);
  await page.getByLabel("Private app code", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "Retry extraction", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Please retry");
  await page.getByRole("button", { name: "Retry extraction", exact: true }).click();
  await expect(page.getByText("Salt quantity is missing.")).toBeVisible();
  await expect(page.getByLabel(/Recipe title/)).toHaveValue(greekRecipe.title);
  await page.getByRole("button", { name: "Save recipe", exact: true }).click();
  await expect(page.getByRole("heading", { name: greekRecipe.title, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".recipe-card")).toHaveCount(1);
});

test("ingredients-only extraction reviews and saves without inventing steps or missing amounts", async ({ page }) => {
  await page.goto("/");
  await page.route("**/api/extract", (route) => route.fulfill({ json: normalizeExtraction({ recipe: ingredientsOnlyRecipe }) }));
  await page.getByRole("button", { name: "Add your first recipe" }).click();
  await page.locator('input[type="file"][multiple]').setInputFiles("public/icons/icon-192.png");
  await page.getByLabel("Private app code", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "Extract recipe", exact: true }).click();
  await expect(page.getByLabel(/Recipe title/)).toHaveValue(ingredientsOnlyRecipe.title);
  await expect(page.getByText(/You can save the ingredients now and add steps later/)).toBeVisible();
  await expect(page.getByLabel("Quantity", { exact: true }).nth(3)).toHaveValue("");
  await expect(page.getByLabel("Preparation (minutes)")).toHaveValue("");
  await expect(page.getByLabel("Cooking (minutes)")).toHaveValue("");
  await expect(page.locator(".step-editor")).toHaveCount(0);
  await expect(page.locator(".recipe-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Save recipe", exact: true }).click();
  // The detail view appears only after the IndexedDB save transaction commits.
  await expect(page.getByRole("heading", { name: ingredientsOnlyRecipe.title, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".recipe-card")).toHaveCount(1);
  await page.locator(".recipe-card").click();
  await expect(page.getByRole("heading", { name: ingredientsOnlyRecipe.title, exact: true })).toBeVisible();
  await expect(page.locator(".cooking-steps li")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await expect(page.getByLabel("Quantity", { exact: true }).nth(3)).toHaveValue("");
  await expect(page.locator(".step-editor")).toHaveCount(0);
});

test("malformed import, cancel edits, dark mode, and responsive layout", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Import Markdown collection").setInputFiles({ name: "broken.md", mimeType: "text/markdown", buffer: Buffer.from("# not a collection") });
  await expect(page.locator('.toast[role="alert"]')).toContainText("Expected");
  await manual(page);
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await page.getByLabel(/Recipe title/).fill("Do not save");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();
  await page.getByRole("button", { name: "Settings and backups" }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Close dialog" }).click();
  const dismiss = page.getByRole("button", { name: "Dismiss notification" });
  if (await dismiss.isVisible()) await dismiss.click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/collection-${test.info().project.name}.png`, fullPage: true });
});

test("browser chrome follows saved appearance and system changes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const themeColor = page.locator('meta[name="theme-color"]');
  await expect(themeColor).toHaveCount(1);
  await expect(themeColor).toHaveAttribute("content", "#f7f6f0");
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute("content", "black-translucent");
  await page.getByRole("button", { name: "Settings and backups" }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(themeColor).toHaveAttribute("content", "#1c1e1a");
  await expect(page.locator("html")).toHaveCSS("background-color", "rgb(28, 30, 26)");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(28, 30, 26)");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await expect(themeColor).toHaveCount(1);
  await expect(themeColor).toHaveAttribute("content", "#1c1e1a");
  await page.getByRole("button", { name: "Settings and backups" }).click();
  await page.getByRole("button", { name: "System", exact: true }).click();
  await expect(themeColor).toHaveAttribute("content", "#f7f6f0");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(themeColor).toHaveAttribute("content", "#1c1e1a");
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(themeColor).toHaveAttribute("content", "#f7f6f0");
});

test("cards show cooking time alone, method-specific Celsius temperatures and servings on narrow screens", async ({ page }) => {
  await page.goto("/"); await manual(page);
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await page.getByLabel("Preparation (minutes)").fill("10");
  await page.getByLabel("Cooking (minutes)").fill("35");
  await page.getByLabel("Servings", { exact: true }).fill("4");
  await page.getByRole("button", { name: "Add temperature", exact: true }).click();
  await page.getByLabel("Temperature 1 (°C)").fill("180");
  await page.getByLabel("Cooking method 1").fill("fan oven");
  await page.getByRole("button", { name: "Add temperature", exact: true }).click();
  await page.getByLabel("Temperature 2 (°C)").fill("175");
  await page.getByLabel("Cooking method 2").fill("frying oil");
  await page.getByRole("button", { name: "Save recipe", exact: true }).click();
  await page.getByRole("button", { name: "All recipes", exact: true }).click();
  const card = page.locator(".recipe-card");
  await expect(card).toContainText("35 min cook"); await expect(card).not.toContainText("45 min"); await expect(card).not.toContainText("10 min");
  await expect(card).toContainText("180°C fan oven"); await expect(card).toContainText("175°C frying oil"); await expect(card).toContainText("Serves 4");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/metadata-card-${test.info().project.name}.png`, fullPage: true });
});

test("local measurement toggle persists and preserves originals until saved estimates exist", async ({ page }) => {
  let calls = 0; await page.route("**/api/*", route => { calls++; return route.abort(); });
  await page.goto("/"); await manual(page);
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await page.getByLabel("Quantity", { exact: true }).fill("120"); await page.getByLabel("Unit", { exact: true }).fill("g");
  await page.getByRole("button", { name: "Add ingredient", exact: true }).click();
  await page.getByLabel("Ingredient 2 name").fill("Chicken");
  await page.getByLabel("Quantity", { exact: true }).nth(1).fill("200"); await page.getByLabel("Unit", { exact: true }).nth(1).fill("g");
  await page.getByRole("button", { name: "Save recipe", exact: true }).click();
  await page.getByRole("button", { name: "Cups / Spoons", exact: true }).click();
  await expect(page.locator(".cooking-ingredients li").first()).toContainText("120 g Αλεύρι");
  await expect(page.locator(".cooking-ingredients li").nth(1)).toContainText("200 g Chicken");
  await expect(page.locator(".cooking-ingredients li").first()).toContainText("No saved equivalent");
  await page.reload(); await page.locator(".recipe-card").click();
  await expect(page.getByRole("button", { name: "Cups / Spoons", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Metric", exact: true }).click();
  await expect(page.locator(".cooking-ingredients li").first()).toContainText("120 g Αλεύρι");
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await expect(page.getByLabel("Quantity", { exact: true }).first()).toHaveValue("120");
  await expect(page.getByLabel("Unit", { exact: true }).first()).toHaveValue("g");
  expect(calls).toBe(0);
});

test("re-estimation preserves in-flight manual edits until per-field approval", async ({ page }) => {
  await page.goto("/"); await manual(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const suggested = metadataSchema.parse({ title: "AI title", prepTime: 15, cookTime: 20, servings: 4, category: "Γλυκά", tags: ["εύκολο"], cookingTemperatures: [{ celsius: 180, method: "oven", source: "estimated" }], metadataSources: { title: "estimated", prepTime: "estimated", cookTime: "estimated" } });
  await page.route("**/api/estimate", async route => {
    const input = route.request().postDataJSON();
    expect(input.vocabulary.categories).toContainEqual({ id: "category:Γλυκά", name: "Γλυκά" });
    expect(input.vocabulary.tags).toContainEqual({ id: "tag:εύκολο", name: "εύκολο" });
    expect(input.recipe.ingredients[0].name).toBe("Αλεύρι");
    await gate; await route.fulfill({ json: { metadata: suggested, requestId: input.conversions.requestId, conversionSuggestions: [] } });
  });
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await page.getByLabel("Cooking (minutes)").fill("35");
  await page.getByLabel("Private app code", { exact: true }).fill("1234");
  const requested = page.waitForRequest("**/api/estimate");
  await page.getByRole("button", { name: "Re-estimate metadata", exact: true }).click(); await requested;
  await page.getByLabel(/Recipe title/).fill("My handwritten title");
  await expect(page.getByRole("button", { name: "Save recipe", exact: true })).toBeDisabled();
  release();
  await expect(page.getByRole("button", { name: "Accept Cooking time", exact: true })).toBeVisible();
  await expect(page.getByLabel(/Recipe title/)).toHaveValue("My handwritten title");
  await expect(page.getByLabel("Cooking (minutes)")).toHaveValue("35");
  await page.getByRole("button", { name: "Reject Title", exact: true }).click();
  await page.getByRole("button", { name: "Accept Cooking time", exact: true }).click();
  await expect(page.getByLabel("Cooking (minutes)")).toHaveValue("20");
  await expect(page.getByLabel(/Recipe title/)).toHaveValue("My handwritten title");
  await page.getByRole("button", { name: "Save recipe", exact: true }).click();
  await expect(page.locator(".page-heading h1")).toHaveText("My handwritten title");
  await expect(page.locator(".detail-meta")).toContainText("≈ 20 min cook");
});

test("cooking notes CRUD stays separate from explicit revisions and confirmed restore preserves history", async ({ page }) => {
  await page.goto("/"); await manual(page);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Add cooking note", exact: true }).click();
  await page.getByLabel("Cooking date", { exact: true }).fill("2026-10-15");
  await page.getByLabel("Cooking note", { exact: true }).fill("Less salt next time.");
  await page.getByLabel("Personal rating (optional)").selectOption("4");
  await page.getByRole("button", { name: "Save cooking note", exact: true }).click();
  await expect(page.getByText("Less salt next time.", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox")).toBeChecked();
  await expect(page.getByText("No revisions saved yet.")).toBeVisible();
  await page.getByRole("button", { name: "Edit cooking note 2026-10-15", exact: true }).click();
  await page.getByLabel("Cooking note", { exact: true }).fill("Used oat milk. Excellent.");
  await page.getByLabel("Personal rating (optional)").selectOption("5");
  await page.getByRole("button", { name: "Save cooking note", exact: true }).click();
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await page.getByLabel("Save as a new revision", { exact: true }).check();
  await page.getByLabel("Revision description (optional)").fill("Baseline");
  await page.getByRole("button", { name: "Save recipe", exact: true }).click();
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await page.getByLabel(/Recipe title/).fill("Second version");
  await page.getByLabel("Save as a new revision", { exact: true }).check();
  await page.getByLabel("Revision description (optional)").fill("Less sugar");
  await page.getByRole("button", { name: "Save recipe", exact: true }).click();
  await expect(page.locator("details.journal-entry")).toHaveCount(2);
  await page.getByRole("checkbox").check();
  const baseline = page.locator("details.journal-entry").filter({ hasText: "Baseline" });
  await baseline.locator("summary").click();
  await baseline.getByRole("button", { name: "Restore this revision", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".page-heading h1")).toHaveText("Second version");
  await baseline.getByRole("button", { name: "Restore this revision", exact: true }).click();
  await page.getByRole("button", { name: "Restore revision", exact: true }).click();
  await expect(page.locator(".page-heading h1")).toHaveText("Κέικ λεμονιού");
  await expect(page.locator("details.journal-entry")).toHaveCount(3);
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await expect(page.getByText("Used oat milk. Excellent.", { exact: true })).toBeVisible();
  await page.reload(); await page.locator(".recipe-card").click();
  await expect(page.locator("details.journal-entry")).toHaveCount(3);
  await expect(page.getByLabel("Rating 5 out of 5")).toBeVisible();
  await page.getByRole("button", { name: "Delete cooking note 2026-10-15", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Used oat milk. Excellent.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete cooking note 2026-10-15", exact: true }).click();
  await page.getByRole("button", { name: "Delete cooking note", exact: true }).click();
  await expect(page.getByText("Used oat milk. Excellent.", { exact: true })).toHaveCount(0);
  await expect(page.locator("details.journal-entry")).toHaveCount(3);
});
