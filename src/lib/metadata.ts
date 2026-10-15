import { type RecipeContent } from "./recipe";
export const METADATA_LABELS = { title: "Title", prepTime: "Preparation time", cookTime: "Cooking time", cookingTemperatures: "Cooking temperatures", servings: "Servings", category: "Category", tags: "Tags" };
export function temperatureText(temperature: RecipeContent["cookingTemperatures"][number]): string {
  return `${temperature.source === "estimated" ? "≈ " : ""}${temperature.celsius}°C ${temperature.method}`;
}
export function cardMetadata(recipe: RecipeContent): { kind: "time" | "temperature" | "servings"; text: string }[] {
  return [
    ...(recipe.cookTime !== null ? [{ kind: "time" as const, text: `${recipe.metadataSources.cookTime === "estimated" ? "≈ " : ""}${recipe.cookTime} min cook` }] : []),
    ...recipe.cookingTemperatures.map(value => ({ kind: "temperature" as const, text: temperatureText(value) })),
    ...(recipe.servings !== null ? [{ kind: "servings" as const, text: `${recipe.metadataSources.servings === "estimated" ? "≈ " : ""}Serves ${recipe.servings}` }] : []),
  ];
}
