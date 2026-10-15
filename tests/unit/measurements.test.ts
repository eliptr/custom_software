import { describe, expect, it } from "vitest";
import { ingredientSchema } from "../../src/lib/recipe";
import { convertIngredient, formatFraction, parseQuantity, US_CUP_ML, US_TABLESPOON_ML, US_TEASPOON_ML } from "../../src/lib/measurements";
import { MEASUREMENT_PREFERENCE_KEY, readMeasurementPreference, writeMeasurementPreference } from "../../src/lib/preferences";
import { makeIdentity } from "../../src/lib/conversion/identity";
const ingredient = (name: string, quantity: string | null, unit: string | null, notes: string | null = null) => ingredientSchema.parse({ name, quantity, unit, notes });
describe("local measurement conversions", () => {
  it.each([["1 ½", 1.5], ["1½", 1.5], ["½", 0.5], ["1 1/3", 4 / 3], ["1-1/2", 1.5], ["1,5", 1.5], ["2/3", 2 / 3], ["⅛", 0.125]])("parses %s", (input, expected) => expect(parseQuantity(String(input))).toBeCloseTo(Number(expected)));
  it.each([null, "", "1–2", "1-2", "a splash", "to taste", "1/0", "-1", "about 2", "1 cup"])('preserves ambiguous quantity %s', value => {
    const original = ingredient("flour", value, "cup");
    expect(convertIngredient(original, "metric")).toMatchObject({ quantity: value, unit: "cup", converted: false, reason: expect.any(String) });
  });
  it("uses US volume relationships and converts liquids without assuming a mass density", () => {
    expect(US_TABLESPOON_ML * 16).toBeCloseTo(US_CUP_ML, 10);
    expect(US_TEASPOON_ML * 48).toBeCloseTo(US_CUP_ML, 10);
    expect(convertIngredient(ingredient("orange juice", "1", "cup"), "metric")).toMatchObject({ quantity: "236.6", unit: "ml" });
    expect(convertIngredient(ingredient("water", "1", "L"), "metric")).toMatchObject({ quantity: "1", unit: "L" });
    expect(convertIngredient(ingredient("water", String(US_CUP_ML / 2), "ml"), "cups")).toMatchObject({ quantity: "1/2", unit: "cup" });
    expect(convertIngredient(ingredient("water", String(US_TABLESPOON_ML * 1.5), "ml"), "cups")).toMatchObject({ quantity: "1 1/2", unit: "tbsp" });
    expect(convertIngredient(ingredient("water", String(US_TEASPOON_ML / 4), "ml"), "cups")).toMatchObject({ quantity: "1/4", unit: "tsp" });
  });
  it("uses only exact dimension math until saved equivalents exist, including catalog ingredients", () => {
    expect(convertIngredient(ingredient("All-purpose flour", "1", "cup"), "metric")).toMatchObject({ quantity: "236.6", unit: "ml", approximate: false });
    expect(convertIngredient(ingredient("sugar", "1", "cup"), "metric")).toMatchObject({ quantity: "236.6", unit: "ml" });
    expect(convertIngredient(ingredient("ΑΛΕΎΡΙ", "120", "γρ."), "cups")).toMatchObject({ quantity: "120", unit: "γρ." });
    expect(convertIngredient(ingredient("coconut flour", "128", "g"), "cups")).toMatchObject({ quantity: "128", unit: "g" });
    expect(convertIngredient(ingredient("brown sugar", "213", "g"), "cups").converted).toBe(false);
  });
  it("uses direct mass conversion and a selected canonical type for manual recipes", () => {
    expect(convertIngredient(ingredient("chicken", "1.5", "kg"), "metric")).toMatchObject({ quantity: "1.5", unit: "kg" });
    expect(convertIngredient(ingredient("chicken", "1500", "g"), "metric")).toMatchObject({ quantity: "1.5", unit: "kg" });
    const manual = ingredient("my flour brand", "240", "g");
    expect(convertIngredient({ ...manual, identity: makeIdentity(manual, "all-purpose-flour", "user", true) }, "cups")).toMatchObject({ quantity: "240", unit: "g" });
  });
  it("keeps unknown density, packing, and unsupported measures unchanged", () => {
    for (const item of [ingredient("chicken", "200", "g"), ingredient("flour", "1", "pinch"), ingredient("flour", "120", "g", "heaped")]) {
      const output = convertIngredient(item, item.unit === "g" ? "cups" : "metric");
      expect(output).toMatchObject({ quantity: item.quantity, unit: item.unit, converted: false, reason: expect.any(String) });
    }
  });
  it.each([[0.5, "1/2"], [1.5, "1 1/2"], [1 / 3, "1/3"], [0.125, "1/8"], [2, "2"], [1.23, "1.23"]])("formats practical fractions for %s", (value, expected) => expect(formatFraction(Number(value))).toBe(expected));
  it("never changes original quantities or units when toggling repeatedly", () => {
    const item = ingredient("flour", "1 ⅓", "cups");
    const before = structuredClone(item);
    for (let i = 0; i < 20; i++) { convertIngredient(item, "metric"); convertIngredient(item, "cups"); }
    expect(item).toEqual(before);
  });
});
describe("measurement preference", () => {
  it("persists a versioned preference and reads it in a new view", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    expect(readMeasurementPreference(storage)).toBe("metric");
    expect(writeMeasurementPreference("cups", storage)).toBe(true);
    expect(data.get(MEASUREMENT_PREFERENCE_KEY)).toBe("cups");
    expect(readMeasurementPreference(storage)).toBe("cups");
    data.set(MEASUREMENT_PREFERENCE_KEY, "corrupt");
    expect(readMeasurementPreference(storage)).toBe("metric");
  });
  it("handles blocked storage without breaking conversions", () => {
    expect(readMeasurementPreference({ getItem: () => { throw new Error("blocked"); } })).toBe("metric");
    expect(writeMeasurementPreference("cups", { setItem: () => { throw new Error("blocked"); } })).toBe(false);
  });
});
