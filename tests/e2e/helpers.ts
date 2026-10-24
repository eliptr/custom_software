import { expect, type Page } from "@playwright/test";

export async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Add recipe", exact: true }).click();
  await page.getByRole("button", { name: "Settings and backups", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
}
