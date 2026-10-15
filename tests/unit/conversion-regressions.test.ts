import { afterEach, describe, expect, it, vi } from "vitest";
import { ingredientSchema, applyMetadataSuggestion, toRecipeContent } from "../../src/lib/recipe";
import { convertIngredient, parseQuantity, formatFraction, US_CUP_ML } from "../../src/lib/measurements";
import { CATALOG_VERSION } from "../../src/lib/conversion/catalog";
import { localProfile, makeIdentity, persistLocalIdentity, resolveIdentity } from "../../src/lib/conversion/identity";
import { createIdentificationRequest, validateIngredientSuggestions, canApplyIngredient, applyIngredientSuggestion, identificationRequestSchema } from "../../src/lib/conversion/suggestions";
import { exportCollection, importCollection } from "../../src/lib/markdown";
import { DeepSeekExtractor } from "../../src/lib/ai/deepseek";
import { greekRecipe, aiRecipe } from "../fixtures";
const item = (name = "flour", quantity = "120", unit = "g", notes: string | null = null) => ingredientSchema.parse({ name, quantity, unit, notes });
const completion = (body: unknown) => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(body) } }] });
const vocabulary = { categories: [], tags: [] };
const metadata = { title: "Suggested", prepTime: 5, cookTime: 10, servings: 2, cookingTemperatures: [], metadataSources: {}, categoryId: null, tagIds: [] };
afterEach(() => vi.unstubAllGlobals());

describe("reported measurement regressions", () => {
  it("does not decide whether 1,000 means one or one thousand without source context", () => {
    expect(parseQuantity("1,000")).toBeNull(); expect(parseQuantity("1.000")).toBeNull();
    expect(parseQuantity("1,000", "en-US")).toBe(1000); expect(parseQuantity("1,000", "el-GR")).toBe(1);
    expect(parseQuantity("1.000", "el-GR")).toBe(1000); expect(parseQuantity("1.000", "en-US")).toBe(1);
    expect(parseQuantity("1,000.5", "en-US")).toBe(1000.5); expect(parseQuantity("1.000,5", "el-GR")).toBe(1000.5);
    expect(convertIngredient(item("flour", "1,000"), "cups").converted).toBe(false);
  });
  it.each([[".5", 0.5], [",5", 0.5], ["0.026", 0.026], ["1,5", 1.5]])("supports safe decimal %s", (text, value) => expect(parseQuantity(String(text))).toBe(value));
  it.each(["cup", "ml"])("never turns sifted %s into grams without a saved estimate", unit => {
    const ingredient = { ...item("flour", "100", unit, "sifted"), ingredientType: "flour" as const };
    for (const mode of ["metric", "cups"] as const) { const result = convertIngredient(ingredient, mode); expect(result.approximate).toBe(false); expect(["ml", "L", "cup", "tbsp", "tsp"]).toContain(result.unit); }
  });
  it("rejects heaped identity even if legacy AI called it flour", () => {
    expect(convertIngredient({ ...item("heaped flour", "1", "cup"), ingredientType: "flour" }, "metric")).toMatchObject({ converted: false, unit: "cup" });
  });
  it("never silently assumes packed brown sugar from a legacy classification", () => {
    expect(convertIngredient({ ...item("brown sugar", "213"), ingredientType: "brown-sugar" }, "cups").converted).toBe(false);
    expect(convertIngredient(item("brown sugar", "213", "g", "packed"), "cups")).toMatchObject({ quantity: "213", unit: "g" });
  });
  it.each(["loosely-packed", "lightly packed", "not firmly packed", "loose"])("rejects nonstandard packing: %s", notes => {
    const ingredient = item("brown sugar", "213", "g", notes);
    expect(convertIngredient(ingredient, "cups").converted).toBe(false);
    ingredient.identity = makeIdentity(ingredient, "packed-brown-sugar", "user", true);
    expect(convertIngredient(ingredient, "cups").converted).toBe(false);
  });
  it("does not let a contradictory legacy identity turn coconut flour into all-purpose flour", () => {
    const result = convertIngredient({ ...item("coconut flour"), ingredientType: "flour" }, "cups");
    expect(result.quantity).toBe("120"); expect(result.unit).toBe("g");
  });
  it("ignores harmless divided but preserves meaningful forms and Greek aliases", () => {
    expect(localProfile(item("all-purpose flour, divided"))?.id).toBe("all-purpose-flour");
    expect(localProfile(item("Καστανή ζάχαρη", "213", "g", "πατημένη"))?.id).toBe("packed-brown-sugar");
    for (const name of ["sifted flour", "heaped flour", "almond flour", "coconut flour sifted", "cooked rolled oats", "instant oats"]) expect(resolveIdentity(item(name)).profile).toBeNull();
    expect(convertIngredient(item("water", "1", "κ. σ."), "metric")).toMatchObject({ quantity: "14.79", unit: "ml", kind: "direct" });
  });
  it("bounds decimal rounding error and retains impractically tiny measures", () => {
    expect(convertIngredient(item("water", "0.026", "ml"), "cups")).toMatchObject({ quantity: "0.026", unit: "ml", converted: false });
    for (const value of [0.0161, 0.026, 0.07291, 0.12345, 1.23456, 13.701]) expect(Math.abs(parseQuantity(formatFraction(value), "en-US")! - value) / value).toBeLessThanOrEqual(0.01);
  });
});
describe("conversion authority and conventions", () => {
  it("uses exact dimension math independently of ingredient identity and source convention", () => {
    expect(convertIngredient(item("unknown", "2", "kg"), "metric")).toMatchObject({ quantity: "2", unit: "kg", kind: "direct", approximate: false });
    expect(convertIngredient(item("unknown", "1000", "ml"), "metric")).toMatchObject({ quantity: "1", unit: "L", kind: "direct" });
    expect(convertIngredient(item("unknown", "120"), "cups").converted).toBe(false);
    const source = item("juice", "1", "cup"); source.measurementContext = { convention: "metric-250", conventionSource: "user", numberFormat: "auto" };
    expect(convertIngredient(source, "metric")).toMatchObject({ quantity: "250", unit: "ml" });
    const display = convertIngredient(source, "cups");
    expect(display.unit).toBe("cup"); expect(Math.abs(parseQuantity(display.quantity)! * US_CUP_ML - 250) / 250).toBeLessThan(0.01);
    source.unit = "US cup"; expect(Number(convertIngredient(source, "metric").quantity)).toBeCloseTo(US_CUP_ML, 1);
    source.unit = "cup"; source.measurementContext.convention = "unknown";
    expect(convertIngredient(source, "metric").converted).toBe(false);
    expect(convertIngredient(item("juice", "1", "cup"), "metric").convention).toContain("assumed");
  });
  it("uses specific density profiles and never a universal water density", () => {
    expect(convertIngredient(item("flour", "1", "cup"), "metric").quantity).toBe("236.6");
    expect(convertIngredient(item("sugar", "1", "cup"), "metric").quantity).toBe("236.6");
    expect(convertIngredient(item("olive oil", "1", "cup"), "metric").unit).toBe("ml");
    expect(resolveIdentity(item("olive oil")).profile?.id).toBe("olive-oil");
    expect(resolveIdentity(item("vegetable oil")).profile?.id).toBe("vegetable-oil");
    expect(resolveIdentity(item("milk")).profile).toBeNull();
    expect(resolveIdentity(item("flour", "120", "g", "packed")).profile).toBeNull();
    expect(resolveIdentity(item("flour", "120", "g", "coconut flour")).profile).toBeNull();
    expect(resolveIdentity(item("flour", "120", "g", "whole wheat")).profile).toBeNull();
  });
  it("persists user selections, revalidates context, and never overrides incompatible preparation", () => {
    const original = item("my brand", "213");
    const selected = { ...original, identity: makeIdentity(original, "packed-brown-sugar", "user", true) };
    expect(convertIngredient(selected, "cups").quantity).toBe("213");
    expect(createIdentificationRequest([selected]).targets).toEqual([]);
    expect(convertIngredient({ ...selected, quantity: "426" }, "cups").quantity).toBe("426");
    expect(convertIngredient({ ...selected, notes: "loosely packed" }, "cups").converted).toBe(false);
    const incompatible = item("brown sugar", "213", "g", "loosely packed"); incompatible.identity = makeIdentity(incompatible, "packed-brown-sugar", "user", true);
    expect(resolveIdentity(incompatible).profile).toBeNull();
    expect(convertIngredient({ ...selected, conversionMode: "original" }, "cups").converted).toBe(false);
  });
  it("never calls the network or mutates originals during toggling or local identification", () => {
    const network = vi.fn(() => { throw new Error("Offline"); }); vi.stubGlobal("fetch", network);
    const original = item("all-purpose flour, divided", "1 ⅓", "cups", "for baking");
    const before = structuredClone(original);
    for (let n = 0; n < 20; n++) { convertIngredient(original, "metric"); convertIngredient(original, "cups"); persistLocalIdentity(original); }
    expect(original).toEqual(before); expect(network).not.toHaveBeenCalled();
    const saved = { ...greekRecipe, ingredients: [persistLocalIdentity(original)] };
    expect(importCollection(exportCollection([saved]))).toEqual([saved]);
    const restored = importCollection(exportCollection([saved]))[0].ingredients[0];
    expect([restored.name, restored.quantity, restored.unit, restored.notes]).toEqual([before.name, before.quantity, before.unit, before.notes]);
  });
});
describe("correlated ingredient suggestions", () => {
  const ingredient = item("sugar, granulated white", "198");
  const request = createIdentificationRequest([ingredient]);
  const raw = { ref: request.targets[0].ref, fingerprint: request.targets[0].fingerprint, profileId: "granulated-sugar" };
  const suggestion = validateIngredientSuggestions([raw], request, [ingredient])[0];
  const binding = { rowId: "stable-row", submitted: ingredient, suggestion };
  it("returns only locally supported catalog IDs and rejects contradictory or fabricated context", () => {
    expect(suggestion.profileId).toBe("granulated-sugar");
    for (const bad of [{ ...raw, profileId: "all-purpose-flour" }, { ...raw, profileId: "invented" }, { ...raw, fingerprint: "0000000000000000" }, { ...raw, ref: crypto.randomUUID() }, { ...raw, profileId: null }]) expect(validateIngredientSuggestions([bad], request, [ingredient])).toEqual([]);
    expect(validateIngredientSuggestions([raw, raw], request, [ingredient])).toEqual([]);
    expect(validateIngredientSuggestions([raw], { ...request, catalogVersion: "old" }, [ingredient])).toEqual([]);
    expect(() => identificationRequestSchema.parse({ ...request, targets: [...request.targets, ...request.targets] })).toThrow();
    const unknown = item("special powder"); const unknownRequest = createIdentificationRequest([unknown]);
    expect(validateIngredientSuggestions([{ ...unknownRequest.targets[0], profileId: "all-purpose-flour" }], unknownRequest, [unknown])).toEqual([]);
  });
  it("rejects stale names, notes, unit/convention changes, removed rows, new user choices, and catalog changes", () => {
    for (const changed of [{ ...ingredient, name: "coconut flour" }, { ...ingredient, notes: "packed" }, { ...ingredient, unit: "ml" }, { ...ingredient, measurementContext: { ...ingredient.measurementContext, convention: "metric-250" as const } }, { ...ingredient, identity: makeIdentity(ingredient, "granulated-sugar", "user") }, undefined]) expect(canApplyIngredient(binding, changed)).toBe(false);
    expect(canApplyIngredient({ ...binding, suggestion: { ...suggestion, catalogVersion: "old" } }, ingredient)).toBe(false);
  });
  it("follows the stable row after reorder and preserves a concurrently changed quantity", () => {
    const rows = [{ rowId: "other", ingredient: item("chicken") }, { rowId: binding.rowId, ingredient: { ...ingredient, quantity: "396" } }];
    const index = rows.findIndex(row => row.rowId === binding.rowId);
    const accepted = applyIngredientSuggestion(rows[index].ingredient, binding);
    expect(accepted).toMatchObject({ name: ingredient.name, quantity: "396", unit: "g", notes: null, identity: { source: "ai", profileId: "granulated-sugar" } });
    expect(rows[0].ingredient.identity).toBeNull();
  });
  it("accepts metadata and identities independently without changing original ingredient text", () => {
    const content = { ...toRecipeContent(greekRecipe), ingredients: [ingredient] };
    const proposed = { ...content, title: "AI title" };
    const metadataOnly = applyMetadataSuggestion(content, proposed, "title");
    expect(metadataOnly.ingredients).toEqual([ingredient]);
    const identityOnly = { ...content, ingredients: [applyIngredientSuggestion(ingredient, binding)] };
    expect(identityOnly.title).toBe(content.title); expect(identityOnly.ingredients[0].name).toBe(ingredient.name);
    expect(createIdentificationRequest(identityOnly.ingredients).targets).toEqual([]);
    const stale = { ...identityOnly.ingredients[0], name: "special powder" };
    expect(resolveIdentity(stale).profile).toBeNull(); expect(createIdentificationRequest([stale]).targets).toHaveLength(1);
  });
  it("includes identification in the existing metadata call and keeps the bounded format retry", async () => {
    const content = { ...toRecipeContent(greekRecipe), ingredients: [ingredient] };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const payload = JSON.parse(String(init?.body));
      const user = JSON.parse(payload.messages[1].content);
      expect(user.identification).toEqual(request); expect(payload.messages[0].content).toContain(CATALOG_VERSION);
      return completion({ metadata, ingredientSuggestions: [raw] });
    });
    const result = await new DeepSeekExtractor("test", undefined, fetcher).estimate(content, vocabulary, undefined, request);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(result.ingredientSuggestions).toEqual([suggestion]); expect(result.metadata.title).toBe("Suggested");
    fetcher.mockReset().mockResolvedValueOnce(completion({ wrong: true })).mockResolvedValueOnce(completion({ metadata, ingredientSuggestions: [raw] }));
    await new DeepSeekExtractor("test", undefined, fetcher).estimate(content, vocabulary, undefined, request);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("includes identification in screenshot extraction without an additional provider call", async () => {
    const source = { ...toRecipeContent(greekRecipe), ingredients: [ingredient, { ...item("coconut flour"), ingredientType: "flour" as const }] };
    const wire = aiRecipe(source); const ingredients = wire.ingredients as Record<string, unknown>[];
    ingredients[0].profileId = "granulated-sugar"; ingredients[1].profileId = "all-purpose-flour";
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(completion({ recipe: wire, warnings: [] }));
    const result = await new DeepSeekExtractor("test", undefined, fetcher).extract([{ mimeType: "image/png", data: "image" }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.recipe.ingredients[0]).toMatchObject({ name: ingredient.name, quantity: "198", identity: { source: "ai", profileId: "granulated-sugar" } });
    expect(result.recipe.ingredients[1].identity?.profileId).toBe("coconut-flour");
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body)); expect(body.messages[0].content).toContain("profileId"); expect(body.messages[0].content).toContain(CATALOG_VERSION);
  });
});
