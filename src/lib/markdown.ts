import { recipeSchema, errorMessage, type Recipe } from "./recipe";

export const FORMAT_VERSION = "recipe-tracker/1";
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_COLLECTION_RECIPES = 2000;
const start = "<!-- recipe:start -->";
const end = "<!-- recipe:end -->";
const scalar = (value: unknown) => JSON.stringify(value);

export function exportCollection(recipes: Recipe[]): string {
  if (recipes.length > MAX_COLLECTION_RECIPES) throw new Error("A collection can contain at most 2,000 recipes");
  const checked = recipes.map((recipe) => recipeSchema.parse(recipe));
  if (new Set(checked.map((recipe) => recipe.id)).size !== checked.length) throw new Error("Duplicate recipe IDs");
  const blocks = [...checked].sort((a, b) => a.id.localeCompare(b.id)).map((recipe) => [
    start, `## ${scalar(recipe.title)}`, "",
    `- ID: ${scalar(recipe.id)}`, `- Description: ${scalar(recipe.description)}`,
    `- Preparation minutes: ${scalar(recipe.prepTime)}`, `- Cooking minutes: ${scalar(recipe.cookTime)}`,
    `- Servings: ${scalar(recipe.servings)}`, `- Category: ${scalar(recipe.category)}`,
    `- Tags: ${scalar(recipe.tags)}`, `- Created: ${scalar(recipe.createdAt)}`, `- Modified: ${scalar(recipe.updatedAt)}`,
    "", "### Ingredients", "",
    ...recipe.ingredients.map((item) => `- ${[item.name, item.quantity, item.unit, item.notes].map(scalar).join(" | ")}`),
    "", "### Instructions", "",
    ...recipe.instructions.map((step, index) => `${index + 1}. ${scalar(step)}`), "", end,
  ].join("\n"));
  const result = `# Recipe collection\n\nFormat: ${FORMAT_VERSION}\n\n${blocks.join("\n\n")}\n`;
  if (new TextEncoder().encode(result).length > MAX_IMPORT_BYTES) throw new Error("Collection exceeds the 5 MB backup capacity. Shorten very long recipe notes before adding more recipes.");
  return result;
}

function parseIngredient(line: string): unknown[] {
  let remaining = line.slice(2);
  const values: unknown[] = [];
  for (let i = 0; i < 4; i++) {
    const match = /^("(?:[^"\\]|\\.)*"|null)/.exec(remaining);
    if (!match) throw new Error("Ingredients use four JSON strings/null separated by ' | '");
    values.push(JSON.parse(match[1]));
    remaining = remaining.slice(match[0].length);
    if (i < 3) {
      if (!remaining.startsWith(" | ")) throw new Error("Expected ' | ' between ingredient fields");
      remaining = remaining.slice(3);
    }
  }
  if (remaining) throw new Error("Unexpected extra ingredient fields");
  return values;
}

export function importCollection(markdown: string): Recipe[] {
  if (new TextEncoder().encode(markdown).length > MAX_IMPORT_BYTES) throw new Error("Collection exceeds the 5 MB import limit");
  const lines = markdown.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n");
  let cursor = 0;
  const skip = () => { while (cursor < lines.length && lines[cursor].trim() === "") cursor++; };
  const read = () => { skip(); return lines[cursor++]; };
  if (read() !== "# Recipe collection") throw new Error("Expected '# Recipe collection' heading");
  if (read() !== `Format: ${FORMAT_VERSION}`) throw new Error("Unsupported or missing format version; expected recipe-tracker/1");
  const recipes: Recipe[] = [];
  const ids = new Set<string>();
  while (true) {
    skip();
    if (cursor >= lines.length) break;
    const recipeNumber = recipes.length + 1;
    try {
      if (read() !== start) throw new Error("Expected recipe start boundary");
      const titleLine = read();
      if (!titleLine?.startsWith("## ")) throw new Error("Missing recipe title");
      const content: Record<string, unknown> = { title: JSON.parse(titleLine.slice(3)) };
      const fields = { ID: "id", Description: "description", "Preparation minutes": "prepTime", "Cooking minutes": "cookTime", Servings: "servings", Category: "category", Tags: "tags", Created: "createdAt", Modified: "updatedAt" };
      for (const [label, field] of Object.entries(fields)) {
        const line = read();
        const prefix = `- ${label}: `;
        if (!line?.startsWith(prefix)) throw new Error(`Expected metadata '${label}'`);
        content[field] = JSON.parse(line.slice(prefix.length));
      }
      if (read() !== "### Ingredients") throw new Error("Missing Ingredients section");
      const ingredients: unknown[] = [];
      skip();
      while (lines[cursor]?.startsWith("- ")) {
        const [name, quantity, unit, notes] = parseIngredient(lines[cursor++]);
        ingredients.push({ name, quantity, unit, notes });
        skip();
      }
      if (read() !== "### Instructions") throw new Error("Missing Instructions section");
      const instructions: unknown[] = [];
      skip();
      while (lines[cursor] !== end && cursor < lines.length) {
        const prefix = `${instructions.length + 1}. `;
        if (!lines[cursor].startsWith(prefix)) throw new Error("Instructions must be consecutively numbered from 1");
        instructions.push(JSON.parse(lines[cursor++].slice(prefix.length)));
        skip();
      }
      if (read() !== end) throw new Error("Missing recipe end boundary");
      const recipe = recipeSchema.parse({ ...content, ingredients, instructions });
      if (ids.has(recipe.id)) throw new Error(`Duplicate ID ${recipe.id}`);
      ids.add(recipe.id);
      recipes.push(recipe);
      if (recipes.length > MAX_COLLECTION_RECIPES) throw new Error("A collection can contain at most 2,000 recipes");
    } catch (error) {
      throw new Error(`Recipe ${recipeNumber}, line ${cursor}: ${errorMessage(error)}`, { cause: error });
    }
  }
  return recipes;
}
