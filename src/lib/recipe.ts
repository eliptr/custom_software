import { z } from "zod";

const text = (max: number) => z.string().max(max);
const nullableText = (max: number) => text(max).nullable();
const minutes = z.number().int().min(0).max(10080).nullable();

export const ingredientSchema = z.object({
  name: text(300).refine((value) => value.trim().length > 0, "Ingredient name is required"),
  quantity: nullableText(100),
  unit: nullableText(100),
  notes: nullableText(1000),
}).strict();

// Shared by the provider, editor, IndexedDB, and Markdown format. A draft may lack a title.
export const recipeContentSchema = z.object({
  title: text(300),
  description: nullableText(3000),
  ingredients: z.array(ingredientSchema).max(200),
  instructions: z.array(text(3000).refine((value) => value.trim().length > 0, "Steps cannot be blank")).max(200),
  prepTime: minutes,
  cookTime: minutes,
  servings: z.number().min(0.1).max(1000).nullable(),
  category: nullableText(200),
  tags: z.array(text(100).min(1)).max(50),
}).strict();

export const recipeSchema = recipeContentSchema.extend({
  id: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
}).refine((value) => value.title.trim().length > 0, { path: ["title"], message: "Give your recipe a title" })
  .refine((value) => Date.parse(value.updatedAt) >= Date.parse(value.createdAt), { path: ["updatedAt"], message: "Modified date cannot precede creation" });

export const warningSchema = z.object({ field: text(200), message: text(1000) }).strict();
export const extractionSchema = z.object({
  recipe: recipeContentSchema,
  warnings: z.array(warningSchema).max(300),
}).strict();
export type Ingredient = z.infer<typeof ingredientSchema>;
export type RecipeContent = z.infer<typeof recipeContentSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type Extraction = z.infer<typeof extractionSchema>;

export function emptyRecipe(): RecipeContent {
  return { title: "", description: null, ingredients: [], instructions: [], prepTime: null, cookTime: null, servings: null, category: null, tags: [] };
}

export function createRecipe(content: RecipeContent, now = new Date().toISOString()): Recipe {
  return recipeSchema.parse({ ...content, id: crypto.randomUUID(), createdAt: now, updatedAt: now });
}
export function toRecipeContent(recipe: Recipe): RecipeContent {
  return { title: recipe.title, description: recipe.description, ingredients: recipe.ingredients, instructions: recipe.instructions, prepTime: recipe.prepTime, cookTime: recipe.cookTime, servings: recipe.servings, category: recipe.category, tags: recipe.tags };
}

export function searchText(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/ς/g, "σ");
}

export function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues.map((issue) => `${issue.path.join(".") || "Recipe"}: ${issue.message}`).join("; ");
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
