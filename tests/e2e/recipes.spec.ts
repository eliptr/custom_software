import { test, expect, type Page } from "@playwright/test";
import { exportCollection } from "../../src/lib/markdown";
import { greekRecipe } from "../fixtures";
import { toRecipeContent } from "../../src/lib/recipe";

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
  await expect(page.getByText("Available offline on this device")).toBeVisible();
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
