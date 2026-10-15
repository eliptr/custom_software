import { extractionSchema, ingredientSchema, recipeContentSchema, type Extraction, type RecipeContent } from "../recipe";
import { type EstimateResponse, type IdentificationRequest } from "../conversion/suggestions";
import { localProfile, supportedAIProfile, makeIdentity } from "../conversion/identity";
import { type Vocabulary } from "../taxonomy";
import { aiExtractionSchema, resolveChoices, withConservativeSources } from "./metadata";
import { tolerantEquivalentExtractionSchema } from "./metadata";
import { normalizeEquivalentPair } from "../conversion/equivalents";
import { type ConversionRequest, type EquivalentEstimateResponse } from "../conversion/equivalent-suggestions";
export type Screenshot = { mimeType: "image/jpeg" | "image/png" | "image/webp"; data: string };
export interface RecipeExtractor {
  extract(images: Screenshot[], signal?: AbortSignal, vocabulary?: Vocabulary, conversionVersion?: 1): Promise<Extraction>;
  estimate(content: RecipeContent, vocabulary: Vocabulary, signal?: AbortSignal, identification?: IdentificationRequest): Promise<EstimateResponse>;
  estimate(content: RecipeContent, vocabulary: Vocabulary, signal: AbortSignal | undefined, identification: IdentificationRequest | undefined, conversions: ConversionRequest): Promise<EquivalentEstimateResponse>;
}

export class AIResponseError extends Error {
  constructor(readonly reason: "json" | "schema") {
    super(reason === "json"
      ? "The AI returned malformed JSON. Please retry extraction."
      : "The AI returned data that does not match the recipe format. Please retry extraction.");
    this.name = "AIResponseError";
  }
}

const optionalFields = ["description", "prepTime", "cookTime", "servings", "category"] as const;
const comparable = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

export function normalizeExtraction(raw: unknown): Extraction {
  if (!raw || typeof raw !== "object" || !("recipe" in raw)) throw new Error("AI response is missing the recipe object");
  const envelope = raw as Record<string, unknown>;
  if (!envelope.recipe || typeof envelope.recipe !== "object" || Array.isArray(envelope.recipe)) throw new Error("AI recipe must be an object");
  const recipe = { ...envelope.recipe } as Record<string, unknown>;
  for (const field of optionalFields) recipe[field] ??= null;
  recipe.title ??= "";
  recipe.tags ??= [];
  recipe.ingredients ??= [];
  recipe.instructions ??= [];
  if (Array.isArray(recipe.ingredients)) recipe.ingredients = recipe.ingredients.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    const ingredient = { ...entry } as Record<string, unknown>;
    for (const key of ["quantity", "unit", "notes"]) ingredient[key] ??= null;
    if (typeof ingredient.quantity === "number" && Number.isFinite(ingredient.quantity)) ingredient.quantity = String(ingredient.quantity);
    if (ingredient.quantity === "") ingredient.quantity = null;
    return ingredient;
  });
  const result = extractionSchema.parse({ ...envelope, recipe, warnings: envelope.warnings ?? [] });
  const ingredientKeys = new Set<string>();
  result.recipe.ingredients = result.recipe.ingredients.filter((item) => {
    const key = JSON.stringify([comparable(item.name), item.quantity, item.unit, item.notes]);
    if (ingredientKeys.has(key)) return false;
    ingredientKeys.add(key);
    return true;
  });
  const stepKeys = new Set<string>();
  result.recipe.instructions = result.recipe.instructions.filter((step) => {
    const key = comparable(step);
    if (stepKeys.has(key)) return false;
    stepKeys.add(key);
    return true;
  });
  if (!result.recipe.title.trim()) result.warnings.push({ field: "title", message: "No title was readable. Please enter one." });
  if (!result.recipe.instructions.length) result.warnings.push({ field: "instructions", message: "No cooking instructions were found in the screenshots. You can save the ingredients now and add steps later." });
  if (!result.recipe.ingredients.length) result.warnings.push({ field: "ingredients", message: "No ingredients were readable." });
  result.recipe.ingredients.forEach((item, index, items) => {
    if (item.quantity === null) result.warnings.push({ field: `ingredients.${index}.quantity`, message: `${item.name}: quantity was not provided. Leave it blank or check the source.` });
    if (items.some((other, otherIndex) => otherIndex !== index && comparable(other.name) === comparable(item.name))) result.warnings.push({ field: `ingredients.${index}`, message: `${item.name}: multiple entries differ. Check whether to combine them.` });
  });
  result.warnings = [...new Map(result.warnings.map((warning) => [JSON.stringify(warning), warning])).values()].slice(0, 300);
  return extractionSchema.parse(result);
}

export function parseStructuredResponse<T>(content: string, normalize: (raw: unknown) => T): T {
  const json = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let raw: unknown;
  try { raw = JSON.parse(json); }
  catch { throw new AIResponseError("json"); }
  try { return normalize(raw); }
  catch { throw new AIResponseError("schema"); }
}
export function parseAIResponse(content: string, vocabulary?: Vocabulary): Extraction {
  return parseStructuredResponse(content, raw => {
    if (!vocabulary) return normalizeExtraction(raw);
    const parsed = aiExtractionSchema.parse(raw);
    const { categoryId, tagIds, ...values } = parsed.recipe;
    const { warnings, ...choices } = resolveChoices(categoryId, tagIds, vocabulary);
    const ingredients = values.ingredients.map(({ profileId, ...original }) => {
      const ingredient = ingredientSchema.parse(original);
      const local = localProfile(ingredient);
      const profile = local ?? (profileId ? supportedAIProfile(ingredient, profileId) : null);
      return profile ? { ...ingredient, identity: makeIdentity(ingredient, profile.id, local ? "local" : "ai") } : ingredient;
    });
    const recipe = recipeContentSchema.parse({ ...values, ...choices, ingredients });
    const metadata = withConservativeSources(recipe);
    recipe.metadataSources = metadata.metadataSources;
    recipe.cookingTemperatures = metadata.cookingTemperatures;
    return normalizeExtraction({ recipe, warnings: [...parsed.warnings, ...warnings] });
  });
}

export function parseEquivalentExtraction(content: string, vocabulary: Vocabulary, model: string): Extraction {
  return parseStructuredResponse(content, raw => {
    const parsed = tolerantEquivalentExtractionSchema.parse(raw);
    const { categoryId, tagIds, ...values } = parsed.recipe;
    const { warnings, ...choices } = resolveChoices(categoryId, tagIds, vocabulary);
    const ingredients = values.ingredients.map(({ equivalents, ...original }, index) => {
      const item = ingredientSchema.parse(original);
      const savedMeasurements = normalizeEquivalentPair(equivalents, item, model);
      if (equivalents != null && !savedMeasurements) warnings.push({ field: `ingredients.${index}.savedMeasurements`, message: `${item.name}: equivalents were unavailable or invalid. Original measurements are kept.` });
      return { ...item, savedMeasurements };
    });
    const recipe = recipeContentSchema.parse({ ...values, ...choices, ingredients });
    const metadata = withConservativeSources(recipe);
    return normalizeExtraction({ recipe: { ...recipe, metadataSources: metadata.metadataSources, cookingTemperatures: metadata.cookingTemperatures }, warnings: [...parsed.warnings, ...warnings] });
  });
}
