import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ingredientSchema, makeRevision, toRecipeContent, applyMetadataSuggestion } from "../../src/lib/recipe";
import { normalizeEquivalentPair, equivalentInput, equivalentFingerprint, effectiveMeasurements, cupsFactor, metricFactor } from "../../src/lib/conversion/equivalents";
import { createConversionRequest, normalizeEquivalentSuggestions, validateSavedSuggestions, canApplyEquivalent, applyEquivalentSuggestion, conversionRequestSchema } from "../../src/lib/conversion/equivalent-suggestions";
import { savedMeasurementsSchema, EQUIVALENT_PROMPT_VERSION } from "../../src/lib/conversion/equivalents-schema";
import { convertIngredient } from "../../src/lib/measurements";
import { DeepSeekExtractor } from "../../src/lib/ai/deepseek";
import { AIResponseError } from "../../src/lib/ai/provider";
import { RecipeDatabase, importRecipes, saveRecipe, restoreRevision } from "../../src/lib/db";
import { exportCollection, importCollection } from "../../src/lib/markdown";
import { greekRecipe, journalRecipe, aiRecipe } from "../fixtures";
const date = "2026-10-15T12:00:00Z";
const item = (name = "Cottage cheese", quantity: string | null = "200", unit: string | null = "g", notes: string | null = null) => ingredientSchema.parse({ name, quantity, unit, notes });
const solid = { form: "solid", metric: { amount: 200, unit: "g" }, cups: { amount: 1, unit: "cup" }, assumptions: "Practical estimate for this cottage cheese, spooned into a level cup." };
const liquid = { form: "liquid", metric: { amount: 200, unit: "ml" }, cups: { amount: 99, unit: "tbsp" }, assumptions: "Room temperature." };
const completion = (body: unknown) => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(body) } }] });
const metadata = { title: "Suggested recipe", prepTime: 10, cookTime: 30, servings: 4, cookingTemperatures: [], metadataSources: {}, categoryId: null, tagIds: [] };
const vocabulary = { categories: [], tags: [] };
const withPair = (ingredient = item()) => ({ ...ingredient, savedMeasurements: normalizeEquivalentPair(solid, ingredient, "deepseek-flash", date)! });
const originalFields = (ingredient: ReturnType<typeof item>) => [ingredient.name, ingredient.quantity, ingredient.unit, ingredient.notes];
const databases: RecipeDatabase[] = [];
const database = () => { const db = new RecipeDatabase(`equivalents-${crypto.randomUUID()}`); databases.push(db); return db; };
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(databases.splice(0).map(db => db.delete())); });

describe("saved practical equivalents", () => {
  it("allows ingredients outside the catalog and preserves original strings and provenance", () => {
    const ingredient = item("Τυρί cottage | μάρκα", "200", "γρ.", "με κόκκους");
    const pair = normalizeEquivalentPair(solid, ingredient, "deepseek-flash", date)!;
    expect(pair).toMatchObject({ metric: { amount: 200, unit: "g", source: "exact" }, cups: { amount: 1, unit: "cup", source: "estimated" }, model: "deepseek-flash", promptVersion: EQUIVALENT_PROMPT_VERSION, estimatedAt: date });
    expect(pair.input).toEqual(equivalentInput(ingredient)); expect(pair.inputFingerprint).toBe(equivalentFingerprint(pair.input));
    expect(convertIngredient({ ...ingredient, savedMeasurements: pair }, "cups")).toMatchObject({ quantity: "1", unit: "cup", approximate: true });
    expect(originalFields(ingredient)).toEqual(["Τυρί cottage | μάρκα", "200", "γρ.", "με κόκκους"]);
  });
  it("anchors exact mass/volume and makes liquid output pairs coherent", () => {
    const mass = normalizeEquivalentPair({ ...solid, metric: { amount: 999, unit: "kg" } }, item(), "test", date)!;
    expect(mass.metric).toEqual({ amount: 0.2, unit: "kg", source: "exact" });
    const volume = normalizeEquivalentPair(solid, item("Cottage cheese", "2", "cup"), "test", date)!;
    expect(volume.cups).toEqual({ amount: 2, unit: "cup", source: "exact" }); expect(volume.metric?.source).toBe("estimated");
    for (const ingredient of [item("Milk", "100", "g"), item("Milk", "2", "cup")]) {
      const pair = normalizeEquivalentPair(liquid, ingredient, "test", date)!;
      expect(pair.metric!.amount * metricFactor(pair.metric!.unit)).toBeCloseTo(pair.cups!.amount * cupsFactor(pair.cups!.unit), 10);
      expect(pair.metric?.source).toBe(ingredient.unit === "cup" ? "exact" : "estimated");
    }
    const source = item("Milk", "1", "cup"); source.measurementContext = { convention: "metric-250", conventionSource: "user", numberFormat: "auto" };
    const pair = normalizeEquivalentPair(liquid, source, "test", date)!;
    expect(pair.metric?.amount).toBe(250); expect(pair.cups!.amount * cupsFactor(pair.cups!.unit)).toBeCloseTo(250, 10);
  });
  it.each([null, "", "to taste", "1–2", "1-2", "1,000", "about 2"])("leaves unavailable quantity %s original", quantity => {
    expect(normalizeEquivalentPair(solid, item("Cottage cheese", quantity), "test", date)).toBeNull();
  });
  it.each([NaN, Infinity, -1, 0, "200", 1e12])("rejects invalid amount %s without replacing a saved pair", amount => {
    const current = withPair(); const request = createConversionRequest([current]);
    const raw = { ref: request.targets[0].ref, fingerprint: request.targets[0].fingerprint, equivalents: { ...solid, metric: { amount, unit: "g" } } };
    expect(normalizeEquivalentSuggestions([raw], request, [current], "test", date)).toEqual([]);
    expect(current.savedMeasurements).toEqual(withPair().savedMeasurements);
  });
  it("rejects invalid units, mismatched form, malformed pairs, and empty proposals", () => {
    for (const raw of [null, { ...solid, metric: { amount: 200, unit: "lb" } }, { ...solid, cups: { amount: 1, unit: "ml" } }, { ...solid, form: "liquid" }, { ...solid, extra: "factor" }, { ...solid, metric: null, cups: null }, { ...solid, cups: undefined }]) expect(normalizeEquivalentPair(raw, item(), "test", date)).toBeNull();
    const unknown = item("Cottage cheese", "1", "cup"); unknown.measurementContext.convention = "unknown";
    expect(normalizeEquivalentPair(solid, unknown, "test", date)).toBeNull();
    unknown.unit = "US cup"; expect(normalizeEquivalentPair(solid, unknown, "test", date)).not.toBeNull();
    expect(normalizeEquivalentPair({ ...solid, metric: null }, item("egg", "2", "pieces"), "test", date)).toMatchObject({ metric: null, cups: { source: "estimated" } });
  });
  it("rescales only unambiguous quantity changes from the accepted basis without accumulating rounding", () => {
    const ingredient = withPair(), basis = structuredClone(ingredient.savedMeasurements);
    for (let cycle = 0; cycle < 20; cycle++) for (const quantity of ["400", ".5", "50", "333", "200"]) {
      const changed = { ...ingredient, quantity }; const pair = effectiveMeasurements(changed)!;
      expect(pair.metric!.amount).toBe(200 * Number(quantity) / 200);
      expect(pair.cups!.amount).toBe(Number(quantity) / 200);
      expect(changed.savedMeasurements).toEqual(basis);
    }
    for (const changed of [{ ...ingredient, name: "Ricotta" }, { ...ingredient, notes: "drained" }, { ...ingredient, unit: "kg" }, { ...ingredient, quantity: "1–2" }, { ...ingredient, measurementContext: { ...ingredient.measurementContext, numberFormat: "el-GR" as const } }]) expect(effectiveMeasurements(changed)).toBeNull();
    expect(effectiveMeasurements(ingredient)).toEqual(basis);
    expect(convertIngredient({ ...ingredient, quantity: "400" }, "cups")).toMatchObject({ quantity: "2", unit: "cup" });
    expect(convertIngredient({ ...ingredient, quantity: "400", conversionMode: "original" }, "cups")).toMatchObject({ quantity: "400", unit: "g" });
  });
  it("renders and toggles offline with no network calls, without falling back to catalog densities", () => {
    const network = vi.fn(() => { throw new Error("offline"); }); vi.stubGlobal("fetch", network);
    const ingredient = withPair(), before = structuredClone(ingredient);
    for (let n = 0; n < 50; n++) { convertIngredient(ingredient, "metric"); convertIngredient(ingredient, "cups"); }
    expect(network).not.toHaveBeenCalled(); expect(ingredient).toEqual(before);
    expect(convertIngredient(item("flour", "120"), "cups")).toMatchObject({ quantity: "120", unit: "g" });
    expect(convertIngredient(item("juice", "1", "cup"), "metric")).toMatchObject({ quantity: "236.6", unit: "ml", approximate: false });
    expect(convertIngredient({ ...ingredient, savedMeasurements: { ...ingredient.savedMeasurements, inputFingerprint: "0000000000000000" } }, "cups").converted).toBe(false);
  });
});
describe("review and request correlation", () => {
  function proposal(current = withPair()) {
    const request = createConversionRequest([current]);
    const target = request.targets[0];
    const suggestion = normalizeEquivalentSuggestions([{ ref: target.ref, fingerprint: target.fingerprint, equivalents: { ...solid, cups: { amount: 0.875, unit: "cup" } } }], request, [current], "test", date)[0];
    return { request, binding: { rowId: "stable-row", submitted: current, suggestion } };
  }
  it("submits every ingredient and validates full coverage and duplicate references", () => {
    const ingredients = [withPair(), item("flour"), { ...item("salt", null, null), conversionMode: "original" as const }];
    const request = createConversionRequest(ingredients); expect(request.targets).toHaveLength(3);
    expect(() => conversionRequestSchema.parse({ ...request, targets: [request.targets[0], request.targets[0]] })).toThrow();
    const raw = { ref: request.targets[0].ref, fingerprint: request.targets[0].fingerprint, equivalents: solid };
    for (const proposals of [[raw, raw], [raw, { ref: raw.ref, broken: true }], [{ ...raw, ref: crypto.randomUUID() }], [{ ...raw, fingerprint: "0000000000000000" }]]) expect(normalizeEquivalentSuggestions(proposals, request, ingredients, "test", date)).toEqual([]);
    expect(normalizeEquivalentSuggestions([raw], { ...request, targets: request.targets.slice(1) }, ingredients, "test", date)).toEqual([]);
  });
  it("rejects changed quantity, unit, name, notes, source context, removed rows and concurrent pair changes", () => {
    const current = withPair(), { binding, request } = proposal(current);
    for (const changed of [undefined, { ...current, quantity: "400" }, { ...current, notes: "drained" }, { ...current, name: "Ricotta" }, { ...current, unit: "kg" }, { ...current, measurementContext: { ...current.measurementContext, conventionSource: "user" as const } }, { ...current, savedMeasurements: null }]) {
      expect(canApplyEquivalent(binding, changed)).toBe(false);
      if (changed) expect(applyEquivalentSuggestion(changed, binding)).toBe(changed);
    }
    const bad = { ...binding.suggestion, measurements: { ...binding.suggestion.measurements, input: equivalentInput(item("Other cheese")) } };
    expect(validateSavedSuggestions([bad], request, [current])).toEqual([]);
    const inconsistent = { ...binding, suggestion: { ...binding.suggestion, measurements: { ...binding.suggestion.measurements, metric: { amount: 999, unit: "g" as const, source: "exact" as const } } } };
    expect(canApplyEquivalent(inconsistent, current)).toBe(false);
    expect(effectiveMeasurements({ ...current, savedMeasurements: inconsistent.suggestion.measurements })).toBeNull();
  });
  it("applies pairs independently of metadata and locates the correct reordered row", () => {
    const current = withPair(), { binding } = proposal(current);
    const rows = [{ rowId: "other", ingredient: item("Chicken") }, { rowId: binding.rowId, ingredient: current }];
    const accepted = rows.map(row => row.rowId === binding.rowId ? applyEquivalentSuggestion(row.ingredient, binding) : row.ingredient);
    expect(accepted[0]).toBe(rows[0].ingredient); expect(accepted[1].savedMeasurements?.cups?.amount).toBe(0.875);
    expect(originalFields(accepted[1])).toEqual(originalFields(current)); expect(current.savedMeasurements.cups?.amount).toBe(1);
    const content = { ...toRecipeContent(greekRecipe), ingredients: [current] };
    const metadataOnly = applyMetadataSuggestion(content, { ...content, title: "AI title" }, "title");
    expect(metadataOnly.ingredients).toEqual([current]); expect(content.title).toBe(greekRecipe.title);
  });
  it("isolates malformed/missing per-row results while preserving valid suggestions and existing pairs", () => {
    const ingredients = [withPair(), withPair(item("Ricotta")), withPair(item("Feta"))], request = createConversionRequest(ingredients);
    const rows = request.targets.map(target => ({ ref: target.ref, fingerprint: target.fingerprint, equivalents: solid }));
    const result = normalizeEquivalentSuggestions([rows[0], { ...rows[1], equivalents: { invalid: true } }], request, ingredients, "test", date);
    expect(result).toHaveLength(1); expect(result[0].ref).toBe(request.targets[0].ref);
    expect(ingredients.every(item => item.savedMeasurements.cups?.amount === 1)).toBe(true);
  });
  it("uses the existing metadata request once and keeps one shared bounded format retry", async () => {
    const content = { ...toRecipeContent(greekRecipe), ingredients: [item()] }, request = createConversionRequest(content.ingredients);
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const payload = JSON.parse(String(init?.body)), input = JSON.parse(payload.messages[1].content);
      expect(input.ingredients).toEqual(content.ingredients.map(equivalentInput)); expect(input.conversions).toEqual(request);
      expect(payload.messages[0].content).toContain(EQUIVALENT_PROMPT_VERSION); expect(payload.messages[0].content).not.toContain('"profiles":');
      return completion({ metadata, conversionSuggestions: request.targets.map(target => ({ ref: target.ref, fingerprint: target.fingerprint, equivalents: solid })) });
    });
    const result = await new DeepSeekExtractor("test", undefined, fetcher).estimate(content, vocabulary, undefined, undefined, request);
    expect(result.conversionSuggestions).toHaveLength(1); expect(result.metadata.title).toBe("Suggested recipe"); expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockReset().mockImplementation(async () => completion({ wrong: true }));
    await expect(new DeepSeekExtractor("test", undefined, fetcher).estimate(content, vocabulary, undefined, undefined, request)).rejects.toBeInstanceOf(AIResponseError);
    expect(fetcher).toHaveBeenCalledTimes(2); expect(fetcher.mock.calls[0][1]?.signal).toBe(fetcher.mock.calls[1][1]?.signal);
  });
  it("includes equivalents in screenshot extraction with one request and preserves invalid rows' originals", async () => {
    const content = { ...toRecipeContent(greekRecipe), ingredients: [item(), item("Salt", null, null)] };
    const wire = aiRecipe(content); const ingredients = content.ingredients.map((item, index) => ({ ...equivalentInput(item), equivalents: index === 0 ? solid : { bogus: true } }));
    // Source conventions are client-owned defaults; screenshot wire originals have only text fields.
    const originals = ingredients.map(({ name, quantity, unit, notes, equivalents }) => ({ name, quantity, unit, notes, equivalents }));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(completion({ recipe: { ...wire, ingredients: originals }, warnings: [] }));
    const result = await new DeepSeekExtractor("test", undefined, fetcher).extract([{ mimeType: "image/png", data: "first" }, { mimeType: "image/jpeg", data: "second" }], undefined, vocabulary, 1);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(result.recipe.ingredients).toHaveLength(2);
    expect(result.recipe.ingredients[0].savedMeasurements?.cups?.amount).toBe(1); expect(result.recipe.ingredients[1].savedMeasurements).toBeNull();
    expect(result.recipe.ingredients[1].quantity).toBeNull(); expect(originalFields(result.recipe.ingredients[0])).toEqual(originalFields(content.ingredients[0]));
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).messages[1].content).toHaveLength(3);
  });
});
describe("persistent equivalents and history", () => {
  it("survives save, reopen, revision restore, and repeated single-Markdown imports losslessly", async () => {
    const db = database(), ingredient = withPair(), content = { ...toRecipeContent(journalRecipe), ingredients: [ingredient] };
    const revision = makeRevision(content, "Accepted equivalents", date), recipe = { ...journalRecipe, ...content, revisions: [revision] };
    await saveRecipe(recipe, db); db.close(); await db.open(); expect(await db.recipes.get(recipe.id)).toEqual(recipe);
    const file = exportCollection([recipe]); expect(file).toContain("Format: recipe-tracker/4"); expect(file).toContain('"savedMeasurements"');
    const imported = importCollection(file); expect(imported).toEqual([recipe]); expect(exportCollection(imported)).toBe(file);
    await importRecipes(imported, "merge", db); await importRecipes(imported, "merge", db);
    expect((await db.recipes.get(recipe.id))!.revisions).toHaveLength(1);
    await saveRecipe({ ...recipe, ingredients: [{ ...ingredient, quantity: "400" }] }, db);
    expect(convertIngredient((await db.recipes.get(recipe.id))!.ingredients[0], "cups").quantity).toBe("2");
    await restoreRevision(recipe.id, revision.id, db);
    expect((await db.recipes.get(recipe.id))!.ingredients).toEqual([ingredient]); expect(ingredientSchema.safeParse(ingredient).success).toBe(true);
  });
  it("upgrades an actual v3 database without touching text, dates, profile decisions, notes or snapshots", async () => {
    const db = database(), legacy = new Dexie(db.name); legacy.version(3).stores({ recipes: "id, title, createdAt, updatedAt, category, *tags" });
    const remove = (value: unknown): unknown => Array.isArray(value) ? value.map(remove) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== "savedMeasurements").map(([key, value]) => [key, remove(value)])) : value;
    const old = remove(journalRecipe); await legacy.table("recipes").put(old); legacy.close(); await db.open();
    const migrated = (await db.recipes.get(journalRecipe.id))!;
    expect(db.verno).toBe(4); expect(migrated).toEqual(journalRecipe); expect(migrated.ingredients.every(item => item.savedMeasurements === null)).toBe(true);
    const oldFile = exportCollection([journalRecipe]).replace("Format: recipe-tracker/4", "Format: recipe-tracker/3").replace(/^```json\n([\s\S]*?)\n```/gm, (_block, json) => '```json\n' + JSON.stringify(remove(JSON.parse(json)), null, 2) + '\n```');
    expect(importCollection(oldFile)).toEqual([journalRecipe]);
    expect(importCollection(exportCollection(importCollection(oldFile)))).toEqual([journalRecipe]);
    expect(savedMeasurementsSchema.safeParse({ ...withPair().savedMeasurements, cups: { amount: -1, unit: "cup", source: "estimated" } }).success).toBe(false);
  });
});
