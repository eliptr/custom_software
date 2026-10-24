import { readFile } from "node:fs/promises";
import { test, expect, type Page, type Route } from "@playwright/test";
import { exportCollection } from "../../src/lib/markdown";
import { normalizeEquivalentPair } from "../../src/lib/conversion/equivalents";
import { greekRecipe } from "../fixtures";
import { toRecipeContent } from "../../src/lib/recipe";
import { openSettings } from "./helpers";

async function openLists(page: Page) { await page.getByRole("button", { name: "Lists", exact: true }).click(); await expect(page.getByLabel("Shopping list", { exact: true })).toHaveValue("supermarket"); }
async function addItem(page: Page, name: string, amount = "") {
  const form = page.getByRole("form", { name: "Add shopping item" });
  await form.getByLabel("Item", { exact: true }).fill(name); await form.getByLabel(/Amount \/ note/).fill(amount);
  await form.getByRole("button", { name: "Add item", exact: true }).click();
  await expect(page.locator(".shopping-items li").filter({ hasText: name })).toBeVisible();
}
async function seedRecipes(page: Page, recipes = [greekRecipe]) {
  await page.getByLabel("Import Markdown collection").setInputFiles({ name: "recipes.md", mimeType: "text/markdown", buffer: Buffer.from(exportCollection(recipes)) });
  await page.getByRole("button", { name: "Merge recipes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function dismissToast(page: Page) {
  const dismiss = page.getByRole("button", { name: "Dismiss notification" });
  if (await dismiss.isVisible()) await dismiss.click();
}

test("Lists replaces Settings and the Add/Settings handoff preserves screenshots and app code", async ({ page }) => {
  await page.goto("/"); await openLists(page);
  await expect(page.getByRole("button", { name: "Settings and backups" })).toHaveCount(0);
  await page.getByRole("button", { name: "Add recipe", exact: true }).click();
  await page.locator('input[type="file"][multiple]').setInputFiles("public/icons/icon-192.png");
  await page.getByLabel("Private app code", { exact: true }).fill("test-session-code");
  await page.getByRole("button", { name: "Settings and backups", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  await page.getByRole("button", { name: "Back to Add recipe" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByLabel("Private app code", { exact: true })).toHaveValue("test-session-code");
  await expect(page.locator(".file-list")).toContainText("icon-192.png");
  await page.screenshot({ path: `test-results/shopping-lists/${test.info().project.name}-add-panel.png`, fullPage: true });
  let pending: Route | undefined;
  await page.route("**/api/extract", route => { pending = route; });
  await page.getByRole("button", { name: "Extract recipe", exact: true }).click();
  await expect(page.getByRole("button", { name: "Settings and backups", exact: true })).toBeDisabled();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await pending!.fulfill({ json: { recipe: toRecipeContent(greekRecipe), warnings: [] } });
  await expect(page.getByLabel(/Recipe title/)).toHaveValue(greekRecipe.title);
  await expect(page.locator(".mobile-nav")).toHaveCount(0);
});

test("manual items, custom lists, edits, bought state, and confirmed deletion persist", async ({ page }) => {
  await page.goto("/"); await openLists(page);
  await expect(page.getByRole("button", { name: "Rename list", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete list", exact: true })).toHaveCount(0);
  await addItem(page, "Milk", "2 cartons");
  await page.getByRole("button", { name: "Edit Milk", exact: true }).click();
  await page.getByLabel("Item name", { exact: true }).fill("Oat milk");
  await page.getByRole("dialog").getByLabel("Amount / note", { exact: true }).fill("1 carton");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Bought Oat milk", exact: true }).check();
  await expect(page.getByRole("region", { name: "Bought items", exact: true })).toContainText("Oat milk");
  await page.reload(); await openLists(page);
  await expect(page.getByRole("checkbox", { name: "Bought Oat milk", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Clear bought", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Bought Oat milk", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Clear bought", exact: true }).click();
  await page.getByRole("button", { name: "Clear bought items", exact: true }).click();
  await expect(page.locator(".shopping-items li")).toHaveCount(0);
  await page.getByRole("button", { name: "Create list", exact: true }).click();
  await page.getByLabel("List name", { exact: true }).fill("Hardware");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await addItem(page, "Screws", "12 pieces");
  await page.getByRole("button", { name: "Rename list", exact: true }).click();
  await page.getByLabel("List name", { exact: true }).fill("Repairs");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "All recipes", exact: true }).click(); await openLists(page);
  await expect(page.locator(".shopping-items li")).toHaveCount(0);
  await page.getByLabel("Shopping list", { exact: true }).selectOption({ label: "Repairs" });
  await expect(page.locator(".shopping-items li")).toContainText("Screws");
  await page.getByRole("button", { name: "Delete list", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".shopping-items li")).toContainText("Screws");
  await page.getByRole("button", { name: "Delete list", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete list", exact: true }).click();
  await expect(page.getByLabel("Shopping list", { exact: true })).toHaveValue("supermarket");
  await expect(page.getByLabel("Shopping list", { exact: true }).locator("option")).toHaveCount(1);
});

test("recipe buttons copy displayed estimates, retain separate recipe amounts, and keep cooking independent", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url()); });
  const first = structuredClone(greekRecipe);
  first.ingredients[0].savedMeasurements = normalizeEquivalentPair({ form: "solid", metric: { amount: 180, unit: "g" }, cups: { amount: 1.5, unit: "cup" }, assumptions: "Level cups." }, first.ingredients[0], "test", "2026-10-15T12:00:00Z");
  const second = { ...structuredClone(greekRecipe), id: crypto.randomUUID(), title: "Second recipe" };
  second.ingredients[0] = { ...second.ingredients[0], name: "αλευρι", quantity: "1", unit: "cup" };
  await page.goto("/"); await seedRecipes(page, [first, second]);
  await page.locator(".recipe-card").filter({ hasText: first.title }).click();
  const ingredient = page.locator(".cooking-ingredients li").first();
  await expect(ingredient).toContainText("≈ 180 g");
  await ingredient.getByRole("button", { name: "Add Αλεύρι to Supermarket", exact: true }).click();
  await expect(ingredient.getByRole("button", { name: "Added Αλεύρι to Supermarket", exact: true })).toBeDisabled();
  await expect(ingredient.getByRole("checkbox")).not.toBeChecked();
  await ingredient.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Cups / Spoons", exact: true }).click();
  await expect(ingredient.getByRole("button", { name: "Added Αλεύρι to Supermarket", exact: true })).toBeDisabled();
  await expect(ingredient.getByRole("checkbox")).toBeChecked();
  await page.locator(".cooking-ingredients li").nth(1).getByRole("button").click();
  await page.getByRole("button", { name: "All recipes", exact: true }).click();
  await page.locator(".recipe-card").filter({ hasText: second.title }).click();
  await page.getByRole("button", { name: "Add αλευρι to Supermarket", exact: true }).click();
  await expect(page.getByRole("button", { name: "Added αλευρι to Supermarket", exact: true })).toBeDisabled();
  await openLists(page);
  const flour = page.locator(".shopping-items li").filter({ hasText: "Αλεύρι" });
  await expect(flour).toHaveCount(1); await expect(flour.locator(".shopping-source")).toHaveCount(2);
  await expect(flour).toContainText("≈ 180 g"); await expect(flour).toContainText("1 cup");
  await expect(page.getByRole("checkbox", { name: "Bought Αλεύρι", exact: true })).not.toBeChecked();
  await expect(page.locator(".shopping-items li").filter({ hasText: "Αλάτι" })).toContainText("No amount specified");
  await dismissToast(page);
  await page.screenshot({ path: `test-results/shopping-lists/${test.info().project.name}-multiple-amounts.png`, fullPage: true });
  await flour.getByRole("checkbox").check();
  await page.getByRole("button", { name: "All recipes", exact: true }).click();
  await page.locator(".recipe-card").filter({ hasText: first.title }).click();
  await page.getByRole("button", { name: "Add Αλεύρι to Supermarket", exact: true }).click();
  await expect(page.getByRole("button", { name: "Added Αλεύρι to Supermarket", exact: true })).toBeDisabled();
  await openLists(page);
  await expect(flour.locator(".shopping-source")).toHaveCount(1); await expect(flour).toContainText("1 1/2 cup");
  expect(apiRequests).toEqual([]);
});

test("shopping-list backup round trip, cancellation, invalid input, and recipe independence", async ({ page }) => {
  await page.goto("/"); await seedRecipes(page); await openLists(page); await addItem(page, "Milk", "2 cartons");
  await openSettings(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export shopping lists", exact: true }).click();
  const download = await downloadPromise; expect(download.suggestedFilename()).toBe("shopping-lists.json");
  const bytes = await readFile((await download.path())!);
  const file = { name: "shopping-lists.json", mimeType: "application/json", buffer: bytes };
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Remove Milk", exact: true }).click();
  await expect(page.locator(".shopping-items li")).toHaveCount(0);
  await openSettings(page);
  await page.getByLabel("Shopping-list backup file").setInputFiles(file);
  await expect(page.getByRole("region", { name: "Review shopping-list restore" })).toContainText("1 lists · 1 items");
  await page.getByRole("button", { name: "Cancel restore", exact: true }).click();
  await page.getByLabel("Shopping-list backup file").setInputFiles({ ...file, buffer: Buffer.from('{"format":"wrong"}') });
  await expect(page.locator('.toast[role="alert"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Replace shopping lists", exact: true })).toHaveCount(0);
  await page.getByLabel("Shopping-list backup file").setInputFiles(file);
  await page.getByRole("button", { name: "Replace shopping lists", exact: true }).click();
  await expect(page.getByRole("region", { name: "Review shopping-list restore" })).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator(".shopping-items li")).toContainText("Milk");
  await page.getByRole("button", { name: "All recipes", exact: true }).click(); await expect(page.locator(".recipe-card")).toHaveCount(1);
});

test("shopping lists remain editable across offline reloads", async ({ page, context }) => {
  await page.goto("/"); await openLists(page); await addItem(page, "Milk", "2 cartons");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true); await page.reload(); await openLists(page);
  await expect(page.locator(".shopping-items li")).toContainText("Milk");
  await addItem(page, "Eggs", "6"); await page.getByRole("checkbox", { name: "Bought Milk", exact: true }).check();
  await expect(page.getByRole("region", { name: "Bought items", exact: true })).toContainText("Milk");
  await page.reload(); await openLists(page);
  await expect(page.getByRole("checkbox", { name: "Bought Milk", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Bought Eggs", exact: true })).not.toBeChecked();
});

test("list layouts stay compact with long Greek names and multiple amounts in both themes", async ({ page }) => {
  await page.goto("/"); await seedRecipes(page); await openLists(page); await dismissToast(page);
  const screenshot = async (state: string) => { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: `test-results/shopping-lists/${test.info().project.name}-${state}.png`, fullPage: true }); };
  await screenshot("empty");
  await addItem(page, "Εξαιρετικό παρθένο ελαιόλαδο από την Καλαμάτα για σαλάτες και μαγείρεμα", "1 μπουκάλι · Προτίμηση σε ελληνικό προϊόν");
  await addItem(page, "Χαρτί κουζίνας", "2 συσκευασίες");
  await page.getByRole("checkbox", { name: "Bought Χαρτί κουζίνας", exact: true }).check();
  await page.getByRole("button", { name: "All recipes", exact: true }).click();
  await page.locator(".recipe-card").click(); await page.locator(".ingredient-shopping").first().click();
  await expect(page.getByRole("button", { name: "Added Αλεύρι to Supermarket", exact: true })).toBeDisabled();
  await expect(page.locator(".toast")).toBeVisible();
  await dismissToast(page);
  await page.screenshot({ path: `test-results/shopping-lists/${test.info().project.name}-ingredients.png`, fullPage: true });
  await openLists(page); await screenshot("light");
  await openSettings(page); await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog" }).click(); await screenshot("dark");
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("failed storage writes keep ingredient buttons available and revert shopping checkboxes", async ({ page }) => {
  await page.goto("/"); await seedRecipes(page); await openLists(page); await addItem(page, "Milk", "2 cartons");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(this: IDBObjectStore, ...args: Parameters<IDBObjectStore["put"]>) {
      if (this.name === "shoppingItems") throw new DOMException("Storage is full", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "All recipes", exact: true }).click(); await page.locator(".recipe-card").click();
  await page.getByRole("button", { name: "Add Αλεύρι to Supermarket", exact: true }).click();
  await expect(page.locator('.toast[role="alert"]')).toContainText("Storage is full");
  await expect(page.getByRole("button", { name: "Add Αλεύρι to Supermarket", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Added Αλεύρι to Supermarket", exact: true })).toHaveCount(0);
  await expect(page.locator(".cooking-ingredients li").first().getByRole("checkbox")).not.toBeChecked();
  await dismissToast(page); await openLists(page);
  await page.getByRole("checkbox", { name: "Bought Milk", exact: true }).click();
  await expect(page.locator('.toast[role="alert"]')).toContainText("Storage is full");
  await expect(page.getByRole("checkbox", { name: "Bought Milk", exact: true })).not.toBeChecked();
  await expect(page.locator(".shopping-items li")).toHaveCount(1);
});
