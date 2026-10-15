import Dexie, { type Table } from "dexie";
import { cookingNoteSchema, makeRevision, recipeSchema, toRecipeContent, type CookingNote, type Recipe } from "./recipe";
import { exportCollection } from "./markdown";
import { canonicalJSON } from "./serialization";

export class RecipeDatabase extends Dexie {
  recipes!: Table<Recipe, string>;
  constructor(name = "recipe-tracker") {
    super(name);
    this.version(1).stores({ recipes: "id, title, createdAt, updatedAt, category, *tags" });
    this.version(2).stores({ recipes: "id, title, createdAt, updatedAt, category, *tags" }).upgrade(async transaction => {
      await transaction.table("recipes").toCollection().modify(recipe => Object.assign(recipe, recipeSchema.parse(recipe)));
    });
  }
}
export const db = new RecipeDatabase();

export async function saveRecipe(recipe: Recipe, database = db): Promise<void> {
  const validated = recipeSchema.parse(recipe);
  await database.transaction("rw", database.recipes, async () => {
    const current = await database.recipes.toArray();
    const existing = current.find(item => item.id === validated.id);
    const next = existing ? { ...validated, cookingNotes: unionById(existing.cookingNotes, validated.cookingNotes), revisions: mergeRevisions(existing.revisions, validated.revisions) } : validated;
    exportCollection([...current.filter(item => item.id !== next.id), next]);
    await database.recipes.put(recipeSchema.parse(next));
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
    const merged = new Map(current.map(recipe => [recipe.id, recipe]));
    for (const recipe of validated) {
      const existing = merged.get(recipe.id);
      merged.set(recipe.id, existing ? { ...recipe, cookingNotes: unionById(existing.cookingNotes, recipe.cookingNotes), revisions: mergeRevisions(existing.revisions, recipe.revisions) } : recipe);
    }
    exportCollection([...merged.values()]);
    if (mode === "replace") await database.recipes.clear();
    await database.recipes.bulkPut([...merged.values()]);
  });
}

function unionById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  return [...new Map([...existing, ...incoming].map(value => [value.id, value])).values()];
}
function mergeRevisions(existing: Recipe["revisions"], incoming: Recipe["revisions"]) {
  for (const revision of incoming) {
    const previous = existing.find(item => item.id === revision.id);
    if (previous && canonicalJSON(previous) !== canonicalJSON(revision)) throw new Error("A revision ID has conflicting snapshots. Import was not applied.");
  }
  return unionById(existing, incoming);
}
async function mutateRecipe(id: string, mutate: (recipe: Recipe) => Recipe, database: RecipeDatabase) {
  await database.transaction("rw", database.recipes, async () => {
    const recipe = await database.recipes.get(id);
    if (!recipe) throw new Error("Recipe no longer exists");
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(recipe.updatedAt))).toISOString();
    const next = recipeSchema.parse({ ...mutate(recipe), updatedAt });
    exportCollection([...(await database.recipes.toArray()).filter(item => item.id !== id), next]);
    await database.recipes.put(next);
  });
}
export async function saveCookingNote(id: string, note: CookingNote, database = db): Promise<void> {
  const checked = cookingNoteSchema.parse(note);
  await mutateRecipe(id, recipe => ({ ...recipe, cookingNotes: unionById(recipe.cookingNotes, [checked]) }), database);
}
export async function deleteCookingNote(id: string, noteId: string, database = db): Promise<void> {
  await mutateRecipe(id, recipe => ({ ...recipe, cookingNotes: recipe.cookingNotes.filter(note => note.id !== noteId) }), database);
}
export async function restoreRevision(id: string, revisionId: string, database = db): Promise<void> {
  await mutateRecipe(id, recipe => {
    const revision = recipe.revisions.find(item => item.id === revisionId);
    if (!revision) throw new Error("Revision no longer exists");
    const backup = makeRevision(toRecipeContent(recipe), "Before restoring an older revision");
    return { ...recipe, ...structuredClone(revision.snapshot), revisions: [...recipe.revisions, backup] };
  }, database);
}
