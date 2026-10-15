import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { exportCollection, importCollection } from "../../src/lib/markdown";
import { greekRecipe, journalRecipe } from "../fixtures";
describe("single Markdown collection", () => {
  it("round trips every field including Unicode, pipes, quotes, newlines, and null", () => {
    expect(importCollection(exportCollection([greekRecipe]))).toEqual([greekRecipe]);
  });
  it("round trips temperatures, provenance, ingredient type, cooking notes, and revision snapshots losslessly", () => {
    const recipe = structuredClone(journalRecipe);
    recipe.ingredients[0].ingredientType = "flour";
    recipe.revisions[0].snapshot.ingredients[0].ingredientType = "flour";
    const file = exportCollection([recipe]);
    expect(file).toContain("Format: recipe-tracker/3");
    expect(file).toContain("### Cooking notes"); expect(file).toContain("### Revisions");
    expect(importCollection(file)).toEqual([recipe]);
    expect(exportCollection(importCollection(file))).toBe(file);
  });
  it("imports actual version 1 collections with non-destructive new-field defaults", () => {
    const [recipe] = importCollection(readFileSync("tests/fixtures/v1-collection.md", "utf8"));
    expect(recipe.title).toBe("Παλιά συνταγή 🍋");
    expect(recipe.ingredients[0]).toMatchObject({ quantity: "1 ½", ingredientType: null });
    expect(recipe.cookingTemperatures).toEqual([]); expect(recipe.cookingNotes).toEqual([]); expect(recipe.revisions).toEqual([]);
    expect(recipe.metadataSources).toEqual({});
    expect(importCollection(exportCollection([recipe]))).toEqual([recipe]);
  });
  it("rejects duplicate note/revision IDs and malformed history without partial imports", () => {
    for (const recipe of [{ ...journalRecipe, cookingNotes: [...journalRecipe.cookingNotes, ...journalRecipe.cookingNotes] }, { ...journalRecipe, revisions: [...journalRecipe.revisions, ...journalRecipe.revisions] }]) expect(() => exportCollection([recipe])).toThrow("Duplicate");
    const file = exportCollection([journalRecipe]);
    expect(() => importCollection(file.replace('"rating":4', '"rating":6'))).toThrow();
    expect(() => importCollection(file.replace("\n```json\n", "\n```yaml\n"))).toThrow();
  });
  it("is canonical and supports empty and multiple collections", () => {
    const another = { ...greekRecipe, id: "00000000-0000-4000-8000-000000000001", title: "English" };
    const file = exportCollection([greekRecipe, another]);
    expect(file).toBe(exportCollection([another, greekRecipe]));
    expect(exportCollection(importCollection(file))).toBe(file);
    expect(importCollection(exportCollection([]))).toEqual([]);
  });
  it("reads BOM and Windows line endings", () => {
    expect(importCollection("\uFEFF" + exportCollection([greekRecipe]).replace(/\n/g, "\r\n"))).toEqual([greekRecipe]);
  });
  it("supports human edits", () => {
    const edited = exportCollection([greekRecipe]).replace('"1 ½"', '"2"');
    expect(importCollection(edited)[0].ingredients[0].quantity).toBe("2");
  });
  it("rejects malformed, truncated, unsupported, trailing, and duplicate records", () => {
    const file = exportCollection([greekRecipe]);
    for (const bad of ["# random", file.replace("recipe-tracker/3", "recipe-tracker/99"), file.replace("<!-- recipe:end -->", ""), file.replace("2. ", "3. "), file + "garbage", file + file.slice(file.indexOf("<!-- recipe:start -->"))]) expect(() => importCollection(bad)).toThrow();
  });
});
