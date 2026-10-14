import Dexie, { type Table } from "dexie";
import { recipeSchema, type Recipe } from "./recipe";
import { exportCollection } from "./markdown";

export class RecipeDatabase extends Dexie {
  recipes!: Table<Recipe, string>;
  constructor(name = "recipe-tracker") {
    super(name);
    this.version(1).stores({ recipes: "id, title, createdAt, updatedAt, category, *tags" });
  }
}
export const db = new RecipeDatabase();

export async function saveRecipe(recipe: Recipe, database = db): Promise<void> {
  const validated = recipeSchema.parse(recipe);
  await database.transaction("rw", database.recipes, async () => {
    const current = await database.recipes.toArray();
    exportCollection([...current.filter((item) => item.id !== validated.id), validated]);
    await database.recipes.put(validated);
  });
}
export async function deleteRecipe(id: string, database = db): Promise<void> {
  await database.recipes.delete(id);
}

export function previewImport(existing: Recipe[], incoming: Recipe[]) {
  const known = new Map(existing.map((recipe) => [recipe.id, recipe]));
  return incoming.map((recipe) => ({ recipe, action: known.has(recipe.id) ? "update" as const : "add" as const }));
}

// Validate before opening a single atomic transaction. Repeated imports upsert by stable UUID.
export async function importRecipes(recipes: Recipe[], mode: "merge" | "replace", database = db): Promise<void> {
  const validated = recipes.map((recipe) => recipeSchema.parse(recipe));
  if (new Set(validated.map((recipe) => recipe.id)).size !== validated.length) throw new Error("Duplicate recipe IDs in import");
  await database.transaction("rw", database.recipes, async () => {
    const current = mode === "merge" ? await database.recipes.toArray() : [];
    const merged = new Map([...current, ...validated].map((recipe) => [recipe.id, recipe]));
    exportCollection([...merged.values()]);
    if (mode === "replace") await database.recipes.clear();
    await database.recipes.bulkPut(validated);
  });
}
