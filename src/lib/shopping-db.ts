import { db, type RecipeDatabase } from "./db";
import type { Recipe } from "./recipe";
import type { DisplayMeasurement } from "./measurements";
import { exportShoppingLists, ingredientSource, shoppingBackupSchema, shoppingItemSchema, shoppingListSchema, shoppingNameKey, supermarketList, SUPERMARKET_ID, type ShoppingBackup, type ShoppingItem, type ShoppingSource } from "./shopping-lists";

// Keep every successful write within the same validated, restorable backup format.
async function write<T>(database: RecipeDatabase, operation: () => Promise<T>): Promise<T> {
  return database.transaction("rw", database.shoppingLists, database.shoppingItems, async () => {
    const result = await operation();
    const [lists, items] = await Promise.all([database.shoppingLists.toArray(), database.shoppingItems.toArray()]);
    exportShoppingLists(lists, items);
    return result;
  });
}
export async function ensureSupermarketList(database = db): Promise<void> {
  await database.transaction("rw", database.shoppingLists, async () => {
    if (!(await database.shoppingLists.get(SUPERMARKET_ID))) await database.shoppingLists.add(supermarketList());
  });
}
export async function createShoppingList(name: string, database = db): Promise<string> {
  const now = new Date().toISOString();
  const list = shoppingListSchema.parse({ id: crypto.randomUUID(), name, createdAt: now, updatedAt: now });
  return write(database, async () => { await database.shoppingLists.add(list); return list.id; });
}
export async function renameShoppingList(id: string, name: string, database = db): Promise<void> {
  if (id === SUPERMARKET_ID) throw new Error("Supermarket cannot be renamed");
  await write(database, async () => {
    const list = await database.shoppingLists.get(id);
    if (!list) throw new Error("List no longer exists");
    await database.shoppingLists.put(shoppingListSchema.parse({ ...list, name, updatedAt: timestamp(list.updatedAt) }));
  });
}
export async function deleteShoppingList(id: string, database = db): Promise<void> {
  if (id === SUPERMARKET_ID) throw new Error("Supermarket cannot be deleted");
  await write(database, async () => {
    await database.shoppingItems.where("listId").equals(id).delete();
    await database.shoppingLists.delete(id);
  });
}
function timestamp(previous: string) { return new Date(Math.max(Date.now(), Date.parse(previous))).toISOString(); }
async function addItem(listId: string, name: string, amount: string, source: ShoppingSource | undefined, database: RecipeDatabase): Promise<void> {
  await write(database, async () => {
    if (!(await database.shoppingLists.get(listId))) throw new Error("List no longer exists");
    const normalizedName = shoppingNameKey(name);
    const existing = await database.shoppingItems.where("[listId+normalizedName]").equals([listId, normalizedName]).first();
    const now = new Date().toISOString();
    const active = existing && !existing.bought ? existing : undefined;
    const sources = active?.sources || [];
    const order = active?.order ?? (await database.shoppingItems.where("listId").equals(listId).toArray()).reduce((maximum, item) => Math.max(maximum, item.order + 1), 0);
    const next = shoppingItemSchema.parse({
      id: existing?.id || crypto.randomUUID(), listId, name: active?.name || name, normalizedName,
      amount: source ? active?.amount || "" : amount.trim(), bought: false,
      order,
      sources: source && !sources.some(value => value.key === source.key) ? [...sources, source] : sources,
      createdAt: active?.createdAt || now, updatedAt: existing ? timestamp(existing.updatedAt) : now,
    });
    await database.shoppingItems.put(next);
  });
}
export async function addManualShoppingItem(listId: string, name: string, amount: string, database = db): Promise<void> {
  await addItem(listId, name.trim(), amount, undefined, database);
}
export async function addIngredientToSupermarket(recipe: Recipe, index: number, measurement: DisplayMeasurement, database = db): Promise<void> {
  const source = ingredientSource(recipe, index, measurement);
  await ensureSupermarketList(database);
  await addItem(SUPERMARKET_ID, recipe.ingredients[index].name.trim(), "", source, database);
}
export async function updateShoppingItem(id: string, values: Pick<ShoppingItem, "name" | "amount">, database = db): Promise<void> {
  await write(database, async () => {
    const item = await database.shoppingItems.get(id);
    if (!item) throw new Error("Item no longer exists");
    const next = shoppingItemSchema.parse({ ...item, ...values, normalizedName: shoppingNameKey(values.name), updatedAt: timestamp(item.updatedAt) });
    // An explicit rename to an existing product is rejected rather than losing either row's notes.
    const other = await database.shoppingItems.where("[listId+normalizedName]").equals([item.listId, next.normalizedName]).first();
    if (other && other.id !== id) throw new Error("An item with this name is already in this list");
    await database.shoppingItems.put(next);
  });
}
export async function setShoppingItemBought(id: string, bought: boolean, database = db): Promise<void> {
  await write(database, async () => {
    const item = await database.shoppingItems.get(id);
    if (!item) throw new Error("Item no longer exists");
    await database.shoppingItems.put({ ...item, bought, updatedAt: timestamp(item.updatedAt) });
  });
}
export async function deleteShoppingItem(id: string, database = db): Promise<void> {
  await write(database, async () => { await database.shoppingItems.delete(id); });
}
export async function clearBoughtShoppingItems(listId: string, database = db): Promise<void> {
  await write(database, async () => { await database.shoppingItems.where("listId").equals(listId).filter(item => item.bought).delete(); });
}
export async function shoppingListsBackup(database = db): Promise<string> {
  await ensureSupermarketList(database);
  return database.transaction("r", database.shoppingLists, database.shoppingItems, async () =>
    exportShoppingLists(await database.shoppingLists.toArray(), await database.shoppingItems.toArray()));
}
export async function restoreShoppingLists(backup: ShoppingBackup, database = db): Promise<void> {
  const validated = shoppingBackupSchema.parse(backup);
  exportShoppingLists(validated.lists, validated.items);
  await write(database, async () => {
    await database.shoppingItems.clear(); await database.shoppingLists.clear();
    await database.shoppingLists.bulkAdd(validated.lists); await database.shoppingItems.bulkAdd(validated.items);
  });
}
