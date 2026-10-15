import { z } from "zod";
import { type Recipe } from "./recipe";

const termSchema = z.object({ id: z.string().min(1).max(210), name: z.string().min(1).max(200) }).strict();
export const vocabularySchema = z.object({ categories: z.array(termSchema).max(2000), tags: z.array(termSchema).max(10000) }).strict()
  .refine(value => [value.categories, value.tags].every(terms => new Set(terms.map(term => term.id)).size === terms.length && new Set(terms.map(term => term.name)).size === terms.length), "Duplicate category or tag IDs/names");
export type Vocabulary = z.infer<typeof vocabularySchema>;
export const EMPTY_VOCABULARY: Vocabulary = { categories: [], tags: [] };

// Existing recipe labels are the user's vocabulary. Names remain lossless; IDs are stable across requests/backups.
export function collectionVocabulary(recipes: Recipe[]): Vocabulary {
  const terms = (names: string[], kind: string) => [...new Set(names)].filter(name => name.trim()).sort().map(name => ({ id: `${kind}:${name}`, name }));
  return vocabularySchema.parse({ categories: terms(recipes.flatMap(recipe => recipe.category ? [recipe.category] : []), "category"), tags: terms(recipes.flatMap(recipe => recipe.tags), "tag") });
}
