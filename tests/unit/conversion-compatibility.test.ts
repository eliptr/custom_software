import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { RecipeDatabase, importRecipes, restoreRevision, saveRecipe } from "../../src/lib/db";
import { exportCollection, importCollection } from "../../src/lib/markdown";
import { migrateRecipe } from "../../src/lib/conversion/migrate";
import { makeIdentity } from "../../src/lib/conversion/identity";
import { ingredientSchema, makeRevision, toRecipeContent } from "../../src/lib/recipe";
import { convertIngredient } from "../../src/lib/measurements";
import { journalRecipe } from "../fixtures";
const databases: RecipeDatabase[] = [];
const database = () => { const db = new RecipeDatabase(`conversion-${crypto.randomUUID()}`); databases.push(db); return db; };
afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.delete())); });
const originals = (ingredients: { name: string; quantity: string | null; unit: string | null; notes: string | null }[]) => ingredients.map(({ name, quantity, unit, notes }) => ({ name, quantity, unit, notes }));
function oldContent(content: ReturnType<typeof toRecipeContent>) {
  return { ...content, ingredients: content.ingredients.map(({ name, quantity, unit, notes, ingredientType }) => ({ name, quantity, unit, notes, ingredientType })) };
}
const old = { ...journalRecipe, ...oldContent(toRecipeContent(journalRecipe)), revisions: journalRecipe.revisions.map(revision => ({ ...revision, snapshot: oldContent(revision.snapshot) })) };
function version2Backup() {
  const lines = ["# Recipe collection", "", "Format: recipe-tracker/2", "", "<!-- recipe:start -->", `## ${JSON.stringify(old.title)}`];
  for (const [label, value] of Object.entries({ ID: old.id, Description: old.description, "Preparation minutes": old.prepTime, "Cooking minutes": old.cookTime, Servings: old.servings, Category: old.category, Tags: old.tags, Created: old.createdAt, Modified: old.updatedAt, "Cooking temperatures": old.cookingTemperatures, "Metadata sources": old.metadataSources })) lines.push(`- ${label}: ${JSON.stringify(value)}`);
  lines.push("", "### Ingredients", ...old.ingredients.map(item => `- ${[item.name, item.quantity, item.unit, item.notes, item.ingredientType].map(value => JSON.stringify(value)).join(" | ")}`), "", "### Instructions", ...old.instructions.map((step, i) => `${i + 1}. ${JSON.stringify(step)}`), "", "### Cooking notes", ...old.cookingNotes.map(note => `- ${JSON.stringify(note)}`), "", "### Revisions", "```json", JSON.stringify(old.revisions, null, 2), "```", "", "<!-- recipe:end -->");
  return lines.join("\n") + "\n";
}
describe("database and backup compatibility", () => {
  it("migrates a real v2 database and every historical snapshot without changing original content", async () => {
    const db = database(), legacy = new Dexie(db.name);
    legacy.version(2).stores({ recipes: "id, title, createdAt, updatedAt, category, *tags" });
    old.ingredients[0].ingredientType = "flour";
    await legacy.table("recipes").put(old); legacy.close(); await db.open();
    const saved = (await db.recipes.get(old.id))!;
    expect(db.verno).toBe(5); expect(saved).toEqual(migrateRecipe(old));
    expect(originals(saved.ingredients)).toEqual(originals(old.ingredients));
    expect(saved.ingredients[0].identity?.source).toBe("legacy");
    expect(saved.ingredients[0].measurementContext.conventionSource).toBe("legacy");
    expect(originals(saved.revisions[0].snapshot.ingredients)).toEqual(originals(old.revisions[0].snapshot.ingredients));
    await importRecipes(importCollection(version2Backup()), "merge", db);
    await importRecipes(importCollection(version2Backup()), "merge", db);
    const merged = (await db.recipes.get(old.id))!;
    expect(merged.revisions).toEqual(saved.revisions); expect(merged.cookingNotes).toEqual(saved.cookingNotes);
    await restoreRevision(old.id, saved.revisions[0].id, db);
    expect(originals((await db.recipes.get(old.id))!.ingredients)).toEqual(originals(old.revisions[0].snapshot.ingredients));
  });
  it("imports version 2, then exports version 3 losslessly with stable revision and note identities", () => {
    const imported = importCollection(version2Backup());
    expect(originals(imported[0].ingredients)).toEqual(originals(old.ingredients));
    expect(importCollection(exportCollection(imported))).toEqual(imported);
    expect(importCollection(version2Backup())).toEqual(imported);
  });
  it("keeps authoritative strings through editing, toggles, saves, revisions, reopening and restore", async () => {
    const db = database();
    const ingredient = ingredientSchema.parse({ name: "Brown sugar", quantity: "1,000", unit: "g", notes: "packed" });
    ingredient.measurementContext.numberFormat = "en-US";
    ingredient.identity = makeIdentity(ingredient, "packed-brown-sugar", "user", true);
    const content = { ...toRecipeContent(journalRecipe), ingredients: [ingredient] };
    const revision = makeRevision(content, "Original measures");
    for (let n = 0; n < 10; n++) { convertIngredient(ingredient, "cups"); convertIngredient(ingredient, "metric"); }
    const saved = { ...journalRecipe, ...content, revisions: [revision] };
    await saveRecipe(saved, db); db.close(); await db.open();
    expect(await db.recipes.get(saved.id)).toEqual(saved);
    const imported = importCollection(exportCollection([saved]));
    await importRecipes(imported, "merge", db); await importRecipes(imported, "merge", db);
    expect(await db.recipes.get(saved.id)).toEqual(saved);
    await saveRecipe({ ...saved, ingredients: [{ ...ingredient, quantity: "250" }] }, db);
    await restoreRevision(saved.id, revision.id, db);
    expect((await db.recipes.get(saved.id))!.ingredients).toEqual([ingredient]);
  });
  it("rejects malformed conversion contexts without accepting a partial backup", () => {
    const file = exportCollection([journalRecipe]);
    expect(() => importCollection(file.replace('"conversionMode": "auto"', '"conversionMode": "invent"'))).toThrow();
    expect(() => importCollection(file.replace("### Ingredient conversion context", "### Other"))).toThrow();
  });
});
