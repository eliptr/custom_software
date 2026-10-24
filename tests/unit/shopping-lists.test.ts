import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RecipeDatabase, deleteRecipe, importRecipes, saveRecipe } from "../../src/lib/db";
import { addIngredientToSupermarket, addManualShoppingItem, clearBoughtShoppingItems, createShoppingList, deleteShoppingItem, deleteShoppingList, ensureSupermarketList, renameShoppingList, restoreShoppingLists, setShoppingItemBought, shoppingListsBackup, updateShoppingItem } from "../../src/lib/shopping-db";
import { exportShoppingLists, ingredientSourceKey, importShoppingLists, MAX_SHOPPING_BACKUP_BYTES, shoppingNameKey, SUPERMARKET_ID } from "../../src/lib/shopping-lists";
import { convertIngredient, type DisplayMeasurement } from "../../src/lib/measurements";
import { greekRecipe, journalRecipe } from "../fixtures";

let database: RecipeDatabase;
const metric: DisplayMeasurement = { quantity: "180", unit: "g", approximate: true, converted: true, reason: null, kind: "ingredient-estimate", convention: "us" };
const cups: DisplayMeasurement = { ...metric, quantity: "1 ½", unit: "cup" };
const allItems = () => database.shoppingItems.toArray();
beforeEach(() => { database = new RecipeDatabase(`shopping-test-${crypto.randomUUID()}`); });
afterEach(async () => { await database.delete(); });

describe("shopping-list persistence", () => {
  it("populates one permanent list and initializes idempotently under concurrent calls", async () => {
    await Promise.all([ensureSupermarketList(database), ensureSupermarketList(database)]);
    expect(await database.shoppingLists.count()).toBe(1);
    expect((await database.shoppingLists.get(SUPERMARKET_ID))?.name).toBe("Supermarket");
    await expect(renameShoppingList(SUPERMARKET_ID, "Other", database)).rejects.toThrow();
    await expect(deleteShoppingList(SUPERMARKET_ID, database)).rejects.toThrow();
  });
  it("upgrades v4 without changing recipes, historical snapshots, or indexes", async () => {
    const legacy = new Dexie(database.name);
    legacy.version(4).stores({ recipes: "id, title, createdAt, updatedAt, category, *tags" });
    await legacy.table("recipes").put(journalRecipe); legacy.close();
    await database.open();
    expect(database.verno).toBe(5);
    expect(await database.recipes.get(journalRecipe.id)).toEqual(journalRecipe);
    expect(database.recipes.schema.indexes.map(index => index.name)).toEqual(["title", "createdAt", "updatedAt", "category", "tags"]);
    expect(await database.shoppingLists.count()).toBe(1);
  });
  it("creates, renames, reopens, and deletes custom lists together with their items", async () => {
    const id = await createShoppingList("Hardware", database);
    await addManualShoppingItem(id, "Screws", "12 pieces", database);
    await renameShoppingList(id, "Repairs", database);
    database.close(); await database.open();
    expect((await database.shoppingLists.get(id))?.name).toBe("Repairs");
    expect((await allItems())[0].amount).toBe("12 pieces");
    await deleteShoppingList(id, database);
    expect(await allItems()).toEqual([]);
    expect(await database.shoppingLists.count()).toBe(1);
  });
  it("rejects blank/duplicate list names atomically", async () => {
    await ensureSupermarketList(database);
    await expect(createShoppingList(" ", database)).rejects.toThrow();
    await expect(createShoppingList(" supermarket ", database)).rejects.toThrow("unique");
    expect(await database.shoppingLists.count()).toBe(1);
  });
  it("normalizes Greek accents, final sigma and whitespace without changing saved names", async () => {
    expect(shoppingNameKey("  ΑΛΕΎΡΙ \n ολικής  ")).toBe(shoppingNameKey("αλευρι ολικησ"));
    await addManualShoppingItem(SUPERMARKET_ID, "Αλεύρι", "one bag", database);
    await addManualShoppingItem(SUPERMARKET_ID, "  αλευρι  ", "two bags", database);
    const [item] = await allItems();
    expect(await database.shoppingItems.count()).toBe(1); expect(item.name).toBe("Αλεύρι"); expect(item.amount).toBe("two bags");
    await expect(addManualShoppingItem(SUPERMARKET_ID, " ", "", database)).rejects.toThrow();
  });
  it("retains each recipe's displayed amount without summing, with idempotent concurrent additions", async () => {
    const second = { ...greekRecipe, id: crypto.randomUUID(), title: "Second recipe" };
    await Promise.all([addIngredientToSupermarket(greekRecipe, 0, metric, database), addIngredientToSupermarket(greekRecipe, 0, metric, database)]);
    await addIngredientToSupermarket(greekRecipe, 0, cups, database);
    await addIngredientToSupermarket(second, 0, cups, database);
    const [item] = await allItems();
    expect(await database.shoppingItems.count()).toBe(1); expect(item.sources).toHaveLength(2);
    expect(item.sources.map(source => [source.quantity, source.unit, source.approximate])).toEqual([["180", "g", true], ["1 ½", "cup", true]]);
  });
  it("distinguishes identical occurrences and preserves source identity across reordering and display changes", async () => {
    const recipe = { ...greekRecipe, ingredients: [greekRecipe.ingredients[0], greekRecipe.ingredients[0]] };
    expect(ingredientSourceKey(recipe, 0)).not.toBe(ingredientSourceKey(recipe, 1));
    const reordered = { ...greekRecipe, ingredients: [...greekRecipe.ingredients].reverse() };
    expect(ingredientSourceKey(greekRecipe, 0)).toBe(ingredientSourceKey(reordered, 1));
    await addIngredientToSupermarket(recipe, 0, metric, database); await addIngredientToSupermarket(recipe, 1, cups, database);
    expect((await allItems())[0].sources).toHaveLength(2);
  });
  it("allows ingredients without amounts and keeps recipe snapshots after edit/deletion", async () => {
    await saveRecipe(greekRecipe, database);
    await addIngredientToSupermarket(greekRecipe, 1, convertIngredient(greekRecipe.ingredients[1], "metric"), database);
    const snapshot = await allItems();
    expect(snapshot[0].sources[0].quantity).toBeNull();
    await saveRecipe({ ...greekRecipe, title: "Changed" }, database); await deleteRecipe(greekRecipe.id, database);
    expect(await allItems()).toEqual(snapshot);
  });
  it("supports editing, bought state, deletion, and stable insertion order", async () => {
    await addManualShoppingItem(SUPERMARKET_ID, "Milk", "2 cartons", database);
    await addManualShoppingItem(SUPERMARKET_ID, "Bread", "", database);
    const items = await database.shoppingItems.toArray(); const milk = items.find(item => item.name === "Milk")!;
    await updateShoppingItem(milk.id, { name: "Oat milk", amount: "1 carton" }, database);
    await setShoppingItemBought(milk.id, true, database);
    database.close(); await database.open();
    expect((await database.shoppingItems.get(milk.id))?.bought).toBe(true);
    expect((await database.shoppingItems.toArray()).sort((a, b) => a.order - b.order).map(item => item.name)).toEqual(["Oat milk", "Bread"]);
    await deleteShoppingItem(milk.id, database); expect(await database.shoppingItems.count()).toBe(1);
  });
  it("rejects an edit colliding with another row without losing either item", async () => {
    await addManualShoppingItem(SUPERMARKET_ID, "Milk", "1", database); await addManualShoppingItem(SUPERMARKET_ID, "Bread", "2", database);
    const before = await allItems();
    await expect(updateShoppingItem(before[0].id, { name: before[1].name, amount: "3" }, database)).rejects.toThrow("already");
    expect(await allItems()).toEqual(before);
  });
  it("reactivates a bought item with only the new source and clears bought only in the selected list", async () => {
    await addIngredientToSupermarket(greekRecipe, 0, metric, database);
    const [item] = await allItems(); await setShoppingItemBought(item.id, true, database);
    await addIngredientToSupermarket({ ...greekRecipe, id: crypto.randomUUID() }, 0, cups, database);
    const updated = (await allItems())[0];
    expect(updated.bought).toBe(false); expect(updated.sources).toHaveLength(1); expect(updated.sources[0].unit).toBe("cup");
    const custom = await createShoppingList("Other", database); await addManualShoppingItem(custom, "Milk", "", database);
    const other = (await allItems()).find(value => value.listId === custom)!;
    await setShoppingItemBought(item.id, true, database); await setShoppingItemBought(other.id, true, database);
    await clearBoughtShoppingItems(SUPERMARKET_ID, database);
    expect((await allItems()).map(value => value.id)).toEqual([other.id]);
  });
  it("a manual re-add of a bought recipe item starts a fresh manual entry", async () => {
    await addIngredientToSupermarket(greekRecipe, 0, metric, database);
    const [item] = await allItems(); await setShoppingItemBought(item.id, true, database);
    await addManualShoppingItem(SUPERMARKET_ID, item.name, "one bag", database);
    expect((await allItems())[0]).toMatchObject({ bought: false, amount: "one bag", sources: [] });
  });
  it("round-trips separate backups and replaces lists without touching recipes", async () => {
    await saveRecipe(journalRecipe, database); await addIngredientToSupermarket(greekRecipe, 0, metric, database);
    const id = await createShoppingList("Weekend", database); await addManualShoppingItem(id, "Coffee", "Beans", database);
    const json = await shoppingListsBackup(database); const backup = importShoppingLists(json);
    await deleteShoppingList(id, database); await restoreShoppingLists(backup, database);
    expect(importShoppingLists(await shoppingListsBackup(database))).toEqual(backup);
    await restoreShoppingLists(backup, database); expect(await database.shoppingLists.count()).toBe(2);
    await importRecipes([greekRecipe], "replace", database);
    expect(importShoppingLists(await shoppingListsBackup(database))).toEqual(backup);
  });
  it("rejects malformed backups, missing/default/duplicate lists, dangling items and oversized files before mutation", async () => {
    await addManualShoppingItem(SUPERMARKET_ID, "Milk", "", database);
    const before = importShoppingLists(await shoppingListsBackup(database));
    const invalid = [
      { ...before, format: "other" }, { ...before, lists: [] }, { ...before, lists: [...before.lists, before.lists[0]] },
      { ...before, lists: [{ ...before.lists[0], name: "Other" }] },
      { ...before, items: [{ ...before.items[0], listId: crypto.randomUUID() }] },
      { ...before, items: [...before.items, before.items[0]] },
      { ...before, items: [{ ...before.items[0], normalizedName: "wrong" }] },
    ];
    for (const backup of invalid) {
      expect(() => importShoppingLists(JSON.stringify(backup))).toThrow();
      await expect(restoreShoppingLists(backup as typeof before, database)).rejects.toThrow();
    }
    expect(() => importShoppingLists("{" )).toThrow();
    expect(() => importShoppingLists(" ".repeat(MAX_SHOPPING_BACKUP_BYTES + 1))).toThrow("5 MB");
    expect(importShoppingLists(await shoppingListsBackup(database))).toEqual(before);
  });
  it("rejects oversized exports", async () => {
    await addManualShoppingItem(SUPERMARKET_ID, "Milk", "", database);
    const backup = importShoppingLists(await shoppingListsBackup(database));
    const items = Array.from({ length: 6000 }, (_, index) => ({ ...backup.items[0], id: crypto.randomUUID(), name: `Item ${index}`, normalizedName: `item ${index}`, amount: "x".repeat(1000), order: index }));
    expect(() => exportShoppingLists(backup.lists, items)).toThrow("5 MB");
  });
  it("rolls back a restore completely when an item write fails after clearing tables", async () => {
    await addManualShoppingItem(SUPERMARKET_ID, "Milk", "", database);
    const before = importShoppingLists(await shoppingListsBackup(database));
    const incoming = { ...before, items: [{ ...before.items[0], name: "Bread", normalizedName: "bread" }] };
    const fail = () => { throw new Error("Storage write failed"); };
    database.shoppingItems.hook("creating", fail);
    try { await expect(restoreShoppingLists(incoming, database)).rejects.toThrow("Storage write failed"); }
    finally { database.shoppingItems.hook("creating").unsubscribe(fail); }
    expect(importShoppingLists(await shoppingListsBackup(database))).toEqual(before);
  });
});
