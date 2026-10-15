import { z } from "zod";
import { INGREDIENT_TYPES } from "./ingredient-types";
import { ingredientIdentitySchema, measurementContextSchema } from "./conversion/schema";

const text = (max: number) => z.string().max(max);
const nullableText = (max: number) => text(max).nullable();
const minutes = z.number().int().min(0).max(10080).nullable();

export const ingredientSchema = z.object({
  name: text(300).refine((value) => value.trim().length > 0, "Ingredient name is required"),
  quantity: nullableText(100),
  unit: nullableText(100),
  notes: nullableText(1000),
  ingredientType: z.enum(INGREDIENT_TYPES).nullable().default(null),
  measurementContext: measurementContextSchema,
  identity: ingredientIdentitySchema,
  conversionMode: z.enum(["auto", "original"]).default("auto"),
}).strict();

export const METADATA_FIELDS = ["title", "prepTime", "cookTime", "cookingTemperatures", "servings", "category", "tags"] as const;
export type MetadataField = typeof METADATA_FIELDS[number];
export const sourceSchema = z.enum(["extracted", "estimated", "user", "unknown"]);
export const temperatureSchema = z.object({ celsius: z.number().min(0).max(500), method: text(100).min(1), source: sourceSchema.default("unknown") }).strict();
export const metadataSourcesSchema = z.partialRecord(z.enum(METADATA_FIELDS), sourceSchema).default({});

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
  cookingTemperatures: z.array(temperatureSchema).max(10).default([]),
  metadataSources: metadataSourcesSchema,
}).strict();

export const metadataSchema = recipeContentSchema.pick({ title: true, prepTime: true, cookTime: true, cookingTemperatures: true, servings: true, category: true, tags: true, metadataSources: true });
export type Metadata = z.infer<typeof metadataSchema>;
export const cookingNoteSchema = z.object({
  id: z.uuid(), cookedOn: z.iso.date(), body: text(5000), rating: z.number().int().min(1).max(5).nullable(),
  createdAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }),
}).strict().refine(note => Boolean(note.body.trim()) || note.rating !== null, "Write a note or choose a rating")
  .refine(note => Date.parse(note.updatedAt) >= Date.parse(note.createdAt), "Note modified date cannot precede creation");
export const revisionSchema = z.object({ id: z.uuid(), createdAt: z.iso.datetime({ offset: true }), description: nullableText(1000), snapshot: recipeContentSchema }).strict();
export type CookingNote = z.infer<typeof cookingNoteSchema>;
export type Revision = z.infer<typeof revisionSchema>;

export const recipeSchema = recipeContentSchema.extend({
  id: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  cookingNotes: z.array(cookingNoteSchema).max(500).default([]),
  revisions: z.array(revisionSchema).max(100).default([]),
}).refine((value) => value.title.trim().length > 0, { path: ["title"], message: "Give your recipe a title" })
  .refine((value) => Date.parse(value.updatedAt) >= Date.parse(value.createdAt), { path: ["updatedAt"], message: "Modified date cannot precede creation" })
  .refine(value => new Set(value.cookingNotes.map(note => note.id)).size === value.cookingNotes.length, { path: ["cookingNotes"], message: "Duplicate cooking note IDs" })
  .refine(value => new Set(value.revisions.map(revision => revision.id)).size === value.revisions.length, { path: ["revisions"], message: "Duplicate revision IDs" });

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
  return recipeContentSchema.parse({ title: "", description: null, ingredients: [], instructions: [], prepTime: null, cookTime: null, servings: null, category: null, tags: [] });
}

export function createRecipe(content: RecipeContent, now = new Date().toISOString()): Recipe {
  return recipeSchema.parse({ ...content, id: crypto.randomUUID(), createdAt: now, updatedAt: now });
}
export function toRecipeContent(recipe: Recipe): RecipeContent {
  return recipeContentSchema.strip().parse(recipe);
}

export function makeRevision(content: RecipeContent, description: string | null = null, now = new Date().toISOString()): Revision {
  return revisionSchema.parse({ id: crypto.randomUUID(), createdAt: now, description, snapshot: structuredClone(recipeContentSchema.parse(content)) });
}

// Only a deliberate per-field acceptance changes the draft; ingredients and steps are never suggestions.
export function applyMetadataSuggestion(content: RecipeContent, suggested: Metadata, field: MetadataField): RecipeContent {
  return recipeContentSchema.parse({ ...content, [field]: suggested[field], metadataSources: { ...content.metadataSources, [field]: suggested.metadataSources[field] || "unknown" } });
}

export function searchText(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/ς/g, "σ");
}

export function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues.map((issue) => `${issue.path.join(".") || "Recipe"}: ${issue.message}`).join("; ");
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
