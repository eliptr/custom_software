import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RecipeDatabase, importRecipes, saveRecipe, deleteRecipe, previewImport } from "../../src/lib/db";
import { greekRecipe } from "../fixtures";
let database: RecipeDatabase;
beforeEach(() => { database = new RecipeDatabase(`test-${crypto.randomUUID()}`); });
afterEach(async () => { await database.delete(); });
describe("persistent collection", () => {
  it("creates, reads after reopening, updates, and deletes", async () => {
    await saveRecipe(greekRecipe, database);
    database.close();
    await database.open();
    expect(await database.recipes.get(greekRecipe.id)).toEqual(greekRecipe);
    await saveRecipe({ ...greekRecipe, title: "Edited" }, database);
    expect((await database.recipes.get(greekRecipe.id))?.title).toBe("Edited");
    await deleteRecipe(greekRecipe.id, database);
    expect(await database.recipes.count()).toBe(0);
  });
  it("merges by UUID without duplication and replaces atomically", async () => {
    const another = { ...greekRecipe, id: crypto.randomUUID(), title: "Second" };
    await saveRecipe(another, database);
    await importRecipes([greekRecipe], "merge", database);
    await importRecipes([{ ...greekRecipe, title: "Updated" }], "merge", database);
    expect(await database.recipes.count()).toBe(2);
    expect(previewImport([greekRecipe], [greekRecipe, another]).map((item) => item.action)).toEqual(["update", "add"]);
    await importRecipes([greekRecipe], "replace", database);
    expect(await database.recipes.toArray()).toEqual([greekRecipe]);
  });
  it("rejects invalid and duplicate imports before deleting existing data", async () => {
    await saveRecipe(greekRecipe, database);
    await expect(importRecipes([{ ...greekRecipe, title: "" }], "replace", database)).rejects.toThrow();
    await expect(importRecipes([greekRecipe, greekRecipe], "replace", database)).rejects.toThrow();
    expect(await database.recipes.toArray()).toEqual([greekRecipe]);
  });
  it("keeps every saved collection within restorable backup limits", async () => {
    const large = Array.from({ length: 2000 }, () => ({ ...greekRecipe, id: crypto.randomUUID() }));
    await database.recipes.bulkPut(large);
    await expect(importRecipes([greekRecipe], "merge", database)).rejects.toThrow("2,000 recipes");
    await expect(saveRecipe(greekRecipe, database)).rejects.toThrow("2,000 recipes");
    expect(await database.recipes.count()).toBe(2000);
  });
});
