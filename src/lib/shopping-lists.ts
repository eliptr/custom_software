import { z } from "zod";
import { searchText, type Ingredient, type Recipe } from "./recipe";
import { canonicalJSON } from "./serialization";
import type { DisplayMeasurement } from "./measurements";

export const SUPERMARKET_ID = "supermarket";
export const MAX_SHOPPING_BACKUP_BYTES = 5 * 1024 * 1024;
export const shoppingNameKey = (name: string) => searchText(name).trim().replace(/\s+/g, " ");
const name = z.string().trim().min(1, "Enter a name").max(300);
const listId = z.union([z.literal(SUPERMARKET_ID), z.uuid()]);
const date = z.iso.datetime({ offset: true });

export const shoppingListSchema = z.object({ id: listId, name, createdAt: date, updatedAt: date }).strict()
  .refine(list => list.id !== SUPERMARKET_ID || list.name === "Supermarket", "The main list must be named Supermarket")
  .refine(list => Date.parse(list.updatedAt) >= Date.parse(list.createdAt), "Invalid list dates");
export const shoppingSourceSchema = z.object({
  key: z.string().min(1).max(20000), recipeId: z.uuid(), recipeTitle: name,
  quantity: z.string().max(100).nullable(), unit: z.string().max(100).nullable(), approximate: z.boolean(),
}).strict();
export const shoppingItemSchema = z.object({
  id: z.uuid(), listId, name, normalizedName: z.string().min(1).max(300),
  amount: z.string().max(1000), bought: z.boolean(), order: z.number().int().min(0), sources: z.array(shoppingSourceSchema).max(2000),
  createdAt: date, updatedAt: date,
}).strict().refine(item => item.normalizedName === shoppingNameKey(item.name), "Invalid item name key")
  .refine(item => Date.parse(item.updatedAt) >= Date.parse(item.createdAt), "Invalid item dates")
  .refine(item => new Set(item.sources.map(source => source.key)).size === item.sources.length, "Duplicate ingredient sources");

export const shoppingBackupSchema = z.object({
  format: z.literal("recipe-tracker/shopping-lists/1"),
  lists: z.array(shoppingListSchema).min(1).max(200), items: z.array(shoppingItemSchema).max(10000),
}).strict().superRefine((backup, context) => {
  const ids = new Set(backup.lists.map(list => list.id));
  if (ids.size !== backup.lists.length || !ids.has(SUPERMARKET_ID)) context.addIssue({ code: "custom", message: "A backup must have unique lists and exactly one Supermarket list" });
  if (new Set(backup.lists.map(list => shoppingNameKey(list.name))).size !== backup.lists.length) context.addIssue({ code: "custom", message: "List names must be unique" });
  if (new Set(backup.items.map(item => item.id)).size !== backup.items.length) context.addIssue({ code: "custom", message: "Duplicate item IDs" });
  if (new Set(backup.items.map(item => canonicalJSON([item.listId, item.normalizedName]))).size !== backup.items.length) context.addIssue({ code: "custom", message: "Duplicate items in a list" });
  if (backup.items.some(item => !ids.has(item.listId))) context.addIssue({ code: "custom", message: "An item refers to a missing list" });
});
export type ShoppingList = z.infer<typeof shoppingListSchema>;
export type ShoppingItem = z.infer<typeof shoppingItemSchema>;
export type ShoppingSource = z.infer<typeof shoppingSourceSchema>;
export type ShoppingBackup = z.infer<typeof shoppingBackupSchema>;

export function supermarketList(now = new Date().toISOString()): ShoppingList {
  return { id: SUPERMARKET_ID, name: "Supermarket", createdAt: now, updatedAt: now };
}
function ingredientContent(item: Ingredient) {
  return canonicalJSON({ name: item.name, quantity: item.quantity, unit: item.unit, notes: item.notes });
}
export function ingredientSourceKey(recipe: Recipe, index: number): string {
  const item = recipe.ingredients[index];
  if (!item) throw new Error("Ingredient no longer exists");
  const content = ingredientContent(item);
  const occurrence = recipe.ingredients.slice(0, index).filter(previous => ingredientContent(previous) === content).length;
  return canonicalJSON([recipe.id, content, occurrence]);
}
export function ingredientSource(recipe: Recipe, index: number, measurement: DisplayMeasurement): ShoppingSource {
  return shoppingSourceSchema.parse({ key: ingredientSourceKey(recipe, index), recipeId: recipe.id, recipeTitle: recipe.title,
    quantity: measurement.quantity, unit: measurement.unit, approximate: measurement.approximate });
}
export function shoppingSourceAmount(source: ShoppingSource): string {
  return `${source.approximate ? "≈ " : ""}${[source.quantity, source.unit].filter(Boolean).join(" ")}`.trim();
}
export function exportShoppingLists(lists: ShoppingList[], items: ShoppingItem[]): string {
  const data = shoppingBackupSchema.parse({ format: "recipe-tracker/shopping-lists/1", lists, items });
  const json = JSON.stringify(data, null, 2);
  if (new TextEncoder().encode(json).length > MAX_SHOPPING_BACKUP_BYTES) throw new Error("Shopping lists exceed the 5 MB backup limit");
  return json;
}
export function importShoppingLists(json: string): ShoppingBackup {
  if (new TextEncoder().encode(json).length > MAX_SHOPPING_BACKUP_BYTES) throw new Error("Shopping lists exceed the 5 MB backup limit");
  return shoppingBackupSchema.parse(JSON.parse(json));
}
