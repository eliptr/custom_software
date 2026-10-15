import { test, expect, type Page } from "@playwright/test";
import { greekRecipe } from "../fixtures";
import { ingredientSchema, metadataSchema, toRecipeContent } from "../../src/lib/recipe";
import { exportCollection } from "../../src/lib/markdown";
import { normalizeEquivalentPair } from "../../src/lib/conversion/equivalents";
import { normalizeEquivalentSuggestions } from "../../src/lib/conversion/equivalent-suggestions";

const date = "2026-10-15T12:00:00Z";
const pair = (cups = 1) => ({ form: "solid", metric: { amount: 200, unit: "g" }, cups: { amount: cups, unit: "cup" }, assumptions: "Practical estimate for the ingredient's usual preparation." });
function ingredient(name: string, quantity: string, cups: number) {
  const original = ingredientSchema.parse({ name, quantity, unit: "g", notes: null });
  return { ...original, savedMeasurements: normalizeEquivalentPair(pair(cups), original, "deepseek-flash", date)! };
}
const recipe = { ...greekRecipe, title: "Cottage cheese bake", ingredients: [ingredient("Cottage cheese", "200", 1), ingredient("Ricotta", "100", 0.5)] };
async function seed(page: Page) {
  await page.goto("/");
  await page.getByLabel("Import Markdown collection").setInputFiles({ name: "recipe-collection.md", mimeType: "text/markdown", buffer: Buffer.from(exportCollection([recipe])) });
  await page.getByRole("button", { name: "Merge recipes", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Review your import" })).toBeHidden();
  await page.locator(".recipe-card").click();
}
async function edit(page: Page) { await page.getByRole("button", { name: "Edit recipe", exact: true }).click(); }

test("review pairs for noncatalog ingredients independently of metadata, with safe row reordering and rejection", async ({ page }) => {
  await seed(page); await edit(page);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let calls = 0;
  await page.route("**/api/estimate", async route => {
    calls++; const input = route.request().postDataJSON();
    expect(input.conversionVersion).toBe(1); expect(input.conversions.targets).toHaveLength(2);
    expect(input.recipe.ingredients.map((item: { name: string }) => item.name)).toEqual(["Cottage cheese", "Ricotta"]);
    const proposals = input.conversions.targets.map((target: { ref: string; fingerprint: string; index: number }) => ({ ref: target.ref, fingerprint: target.fingerprint, equivalents: pair(target.index === 0 ? 0.875 : 0.375) }));
    const conversionSuggestions = normalizeEquivalentSuggestions(proposals, input.conversions, input.recipe.ingredients, "deepseek-flash", date);
    await gate; await route.fulfill({ json: { metadata: metadataSchema.strip().parse({ ...input.recipe, title: "Reviewed bake" }), requestId: input.conversions.requestId, conversionSuggestions } });
  });
  await page.getByLabel("Private app code", { exact: true }).fill("1234");
  const requested = page.waitForRequest("**/api/estimate"); await page.getByRole("button", { name: "Re-estimate metadata", exact: true }).click(); await requested;
  await page.getByRole("button", { name: "Move ingredient 1 down", exact: true }).click(); release();
  const accept = page.getByRole("button", { name: "Accept equivalents Cottage cheese", exact: true }); await expect(accept).toBeEnabled();
  const card = page.locator(".suggestion").filter({ has: page.getByRole("heading", { name: "Cottage cheese", exact: true }) });
  await expect(card).toContainText("≈ 1 cup"); await expect(card).toContainText("≈ 7/8 cup");
  await page.getByRole("button", { name: "Accept Title", exact: true }).click();
  await expect(page.getByLabel(/Recipe title/)).toHaveValue("Reviewed bake"); await expect(card).toContainText("≈ 1 cup");
  await page.getByRole("button", { name: "Reject equivalents Ricotta", exact: true }).click(); await accept.click();
  await page.getByRole("button", { name: "Save recipe", exact: true }).click();
  await page.getByRole("button", { name: "Cups / Spoons", exact: true }).click();
  await expect(page.locator(".cooking-ingredients li").first()).toContainText("≈ 1/2 cup Ricotta");
  await expect(page.locator(".cooking-ingredients li").nth(1)).toContainText("≈ 7/8 cup Cottage cheese");
  await expect(page.locator(".cooking-ingredients li").nth(1)).toContainText("Original: 200 g");
  expect(calls).toBe(1); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/saved-equivalents-${test.info().project.name}.png`, fullPage: true });
});

test("quantity-stale and removed proposals cannot replace saved pairs or affect other rows", async ({ page }) => {
  await seed(page); await edit(page);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/estimate", async route => {
    const input = route.request().postDataJSON();
    const proposals = input.conversions.targets.map((target: { ref: string; fingerprint: string }) => ({ ref: target.ref, fingerprint: target.fingerprint, equivalents: pair(0.875) }));
    const conversionSuggestions = normalizeEquivalentSuggestions(proposals, input.conversions, input.recipe.ingredients, "deepseek-flash", date);
    await gate; await route.fulfill({ json: { metadata: metadataSchema.strip().parse(input.recipe), requestId: input.conversions.requestId, conversionSuggestions } });
  });
  await page.getByLabel("Private app code", { exact: true }).fill("1234"); const requested = page.waitForRequest("**/api/estimate");
  await page.getByRole("button", { name: "Re-estimate metadata", exact: true }).click(); await requested;
  await page.getByLabel("Quantity", { exact: true }).first().fill("400"); await page.getByRole("button", { name: "Remove ingredient 2", exact: true }).click(); release();
  await expect(page.getByRole("button", { name: "Accept equivalents Cottage cheese", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Accept equivalents Ricotta", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Reject equivalents Cottage cheese", exact: true }).click(); await page.getByRole("button", { name: "Reject equivalents Ricotta", exact: true }).click();
  await page.getByRole("button", { name: "Save recipe", exact: true }).click(); await page.getByRole("button", { name: "Cups / Spoons", exact: true }).click();
  await expect(page.locator(".cooking-ingredients li")).toHaveCount(1); await expect(page.locator(".cooking-ingredients li")).toContainText("≈ 2 cup Cottage cheese");
  await expect(page.locator(".cooking-ingredients li")).toContainText("Original: 400 g");
});

test("saved pairs reload and rescale from their accepted basis offline with no API calls", async ({ page, context }) => {
  let calls = 0; await page.route("**/api/*", route => { calls++; return route.abort(); });
  await seed(page); await page.getByRole("button", { name: "Cups / Spoons", exact: true }).click();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; }); await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true); await page.reload(); await page.locator(".recipe-card").click();
  await expect(page.getByRole("button", { name: "Cups / Spoons", exact: true })).toHaveAttribute("aria-pressed", "true");
  for (const [quantity, cups] of [["400", "2"], ["100", "1/2"], ["200", "1"]]) {
    await edit(page); await page.getByLabel("Quantity", { exact: true }).first().fill(quantity); await page.getByRole("button", { name: "Save recipe", exact: true }).click();
    await expect(page.locator(".cooking-ingredients li").first()).toContainText(`≈ ${cups} cup Cottage cheese`);
  }
  await edit(page); await page.getByText("Measurement conversion", { exact: true }).first().click();
  await expect(page.getByText(/Accepted basis: 200 g Cottage cheese/)).toBeVisible();
  await page.locator(".ingredient-notes input").first().fill("drained"); await page.getByRole("button", { name: "Save recipe", exact: true }).click();
  await expect(page.locator(".cooking-ingredients li").first()).toContainText("200 g Cottage cheese");
  await expect(page.locator(".cooking-ingredients li").first()).toContainText("Saved estimate needs refreshing");
  expect(calls).toBe(0);
});

test("failed and malformed proposals keep existing equivalents and metadata approval remains usable", async ({ page }) => {
  await seed(page); await edit(page); let calls = 0;
  await page.route("**/api/estimate", async route => {
    calls++; if (calls === 1) { await route.fulfill({ status: 502, json: { error: "AI unavailable. Retry later." } }); return; }
    const input = route.request().postDataJSON(), target = input.conversions.targets[0];
    await route.fulfill({ json: { metadata: metadataSchema.strip().parse({ ...input.recipe, title: "Metadata still works" }), requestId: input.conversions.requestId, conversionSuggestions: [{ ref: target.ref, fingerprint: target.fingerprint, measurements: { invalid: true } }] } });
  });
  await page.getByLabel("Private app code", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "Re-estimate metadata", exact: true }).click(); await expect(page.locator(".metadata-suggestions").getByRole("alert")).toContainText("AI unavailable");
  await page.getByRole("button", { name: "Re-estimate metadata", exact: true }).click(); await page.getByRole("button", { name: "Accept Title", exact: true }).click();
  await expect(page.getByText("No available ingredient proposals. Current saved equivalents are kept.")).toBeVisible();
  await page.getByRole("button", { name: "Save recipe", exact: true }).click(); await page.getByRole("button", { name: "Cups / Spoons", exact: true }).click();
  await expect(page.locator(".cooking-ingredients li").first()).toContainText("≈ 1 cup Cottage cheese");
  await expect(page.locator(".cooking-ingredients li").nth(1)).toContainText("≈ 1/2 cup Ricotta"); expect(calls).toBe(2);
});

test("screenshot equivalents for a noncatalog ingredient are inspectable before saving", async ({ page }) => {
  await page.goto("/"); let calls = 0;
  await page.route("**/api/extract", async route => {
    calls++; const input = route.request().postDataJSON(); expect(input.conversionVersion).toBe(1); expect(input.images).toHaveLength(1);
    await route.fulfill({ json: { recipe: toRecipeContent(recipe), warnings: [] } });
  });
  await page.getByRole("button", { name: "Add your first recipe", exact: true }).click();
  await page.locator('input[type="file"][multiple]').setInputFiles("public/icons/icon-192.png"); await page.getByLabel("Private app code", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "Extract recipe", exact: true }).click();
  await expect(page.getByLabel("Ingredient 1 name")).toHaveValue("Cottage cheese"); await expect(page.locator(".recipe-card")).toHaveCount(0);
  await page.getByText("Measurement conversion", { exact: true }).first().click();
  await expect(page.getByText("Cups / Spoons: ≈ 1 cup (AI estimate)", { exact: true })).toBeVisible();
  await expect(page.getByText(/Accepted basis: 200 g Cottage cheese/)).toBeVisible();
  await page.getByRole("button", { name: "Save recipe", exact: true }).click(); await page.getByRole("button", { name: "Cups / Spoons", exact: true }).click();
  await expect(page.locator(".cooking-ingredients li").first()).toContainText("≈ 1 cup Cottage cheese"); expect(calls).toBe(1);
});
