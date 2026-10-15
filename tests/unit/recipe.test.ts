import { describe, expect, it } from "vitest";
import { recipeSchema, searchText } from "../../src/lib/recipe";
import { greekRecipe } from "../fixtures";
describe("recipe schema", () => {
  it("preserves Greek, fractions, and missing quantities", () => {
    expect(recipeSchema.parse(greekRecipe)).toEqual(greekRecipe);
    expect(recipeSchema.parse(greekRecipe).ingredients[1].quantity).toBeNull();
  });
  it("rejects invalid IDs, blank titles, unknown fields, and negative metadata", () => {
    for (const patch of [{ id: "bad" }, { title: " " }, { cookTime: -1 }, { secret: "x" }, { updatedAt: "2025-01-01T00:00:00Z" }]) expect(recipeSchema.safeParse({ ...greekRecipe, ...patch }).success).toBe(false);
  });
  it("searches accent-insensitively in Greek and English", () => {
    expect(searchText("Λεμόνι")).toBe(searchText("λεμονι"));
    expect(searchText("αλεύρις")).toBe(searchText("αλευρισ"));
  });
});
