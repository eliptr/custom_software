import "fake-indexeddb/auto";
import Dexie from "dexie";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RecipeDatabase, importRecipes, saveRecipe, deleteRecipe, previewImport, saveCookingNote, deleteCookingNote, restoreRevision } from "../../src/lib/db";
import { makeRevision, toRecipeContent } from "../../src/lib/recipe";
import { exportCollection, importCollection } from "../../src/lib/markdown";
import { greekRecipe, journalRecipe } from "../fixtures";
import { migrateRecipe } from "../../src/lib/conversion/migrate";
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
  it("migrates a real v1 database while preserving text, original measurements, dates, and labels", async () => {
    const legacy = new Dexie(database.name);
    legacy.version(1).stores({ recipes: "id, title, createdAt, updatedAt, category, *tags" });
    const old: Record<string, unknown> = structuredClone(greekRecipe);
    for (const field of ["cookingTemperatures", "metadataSources", "cookingNotes", "revisions"]) delete old[field];
    old.ingredients = greekRecipe.ingredients.map(ingredient => ({ name: ingredient.name, quantity: ingredient.quantity, unit: ingredient.unit, notes: ingredient.notes }));
    await legacy.table("recipes").put(old); legacy.close();
    await database.open();
    expect(database.verno).toBe(4);
    expect(await database.recipes.get(greekRecipe.id)).toEqual(migrateRecipe(old));
    database.close(); await database.open();
    expect(await database.recipes.get(greekRecipe.id)).toEqual(migrateRecipe(old));
  });
  it("creates, edits, reopens, and deletes notes without making revisions", async () => {
    await saveRecipe(greekRecipe, database);
    const note = journalRecipe.cookingNotes[0];
    await saveCookingNote(greekRecipe.id, note, database);
    await saveCookingNote(greekRecipe.id, { ...note, body: "Changed substitution", rating: 5 }, database);
    database.close(); await database.open();
    let current = (await database.recipes.get(greekRecipe.id))!;
    expect(current.cookingNotes).toHaveLength(1); expect(current.cookingNotes[0].rating).toBe(5);
    expect(current.revisions).toEqual([]);
    await deleteCookingNote(greekRecipe.id, note.id, database);
    current = (await database.recipes.get(greekRecipe.id))!;
    expect(current.cookingNotes).toEqual([]); expect(current.revisions).toEqual([]);
  });
  it("stores independent explicit snapshots and restores while retaining notes and all history", async () => {
    const content = structuredClone(toRecipeContent(greekRecipe));
    const revision = makeRevision(content, "Original");
    content.ingredients[0].quantity = "999";
    expect(revision.snapshot.ingredients[0].quantity).toBe("1 ½");
    await saveRecipe({ ...journalRecipe, title: "Current edited title", revisions: [revision] }, database);
    await restoreRevision(journalRecipe.id, revision.id, database);
    const result = (await database.recipes.get(journalRecipe.id))!;
    expect(result.title).toBe(greekRecipe.title); expect(result.cookingNotes).toEqual(journalRecipe.cookingNotes);
    expect(result.revisions[0]).toEqual(revision); expect(result.revisions).toHaveLength(2);
    expect(result.revisions[1].snapshot.title).toBe("Current edited title");
    await restoreRevision(journalRecipe.id, revision.id, database);
    expect((await database.recipes.get(journalRecipe.id))?.revisions).toHaveLength(3);
  });
  it("repeated imports deduplicate journals/history; legacy merges retain them and replace restores exactly", async () => {
    const imported = importCollection(exportCollection([journalRecipe]));
    await importRecipes(imported, "merge", database); await importRecipes(imported, "merge", database);
    const [legacy] = importCollection(readFileSync("tests/fixtures/v1-collection.md", "utf8"));
    await importRecipes([legacy], "merge", database);
    let current = (await database.recipes.get(journalRecipe.id))!;
    expect(current.cookingNotes).toEqual(journalRecipe.cookingNotes); expect(current.revisions).toEqual(journalRecipe.revisions);
    await importRecipes([legacy], "replace", database);
    current = (await database.recipes.get(journalRecipe.id))!;
    expect(current.cookingNotes).toEqual([]); expect(current.revisions).toEqual([]);
  });
  it("rejects conflicting revision IDs atomically and retains existing records", async () => {
    await saveRecipe(journalRecipe, database);
    const incoming = structuredClone(journalRecipe); incoming.revisions[0].snapshot.title = "Conflicting";
    await expect(importRecipes([incoming], "merge", database)).rejects.toThrow("conflicting snapshots");
    expect(await database.recipes.get(journalRecipe.id)).toEqual(journalRecipe);
  });
});
