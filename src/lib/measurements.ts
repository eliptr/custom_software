import { type Ingredient, searchText } from "./recipe";
import { type INGREDIENT_TYPES } from "./ingredient-types";

export type MeasurementSystem = "metric" | "cups";
type IngredientType = typeof INGREDIENT_TYPES[number];
export const US_CUP_ML = 236.5882365;
export const US_TABLESPOON_ML = US_CUP_ML / 16;
export const US_TEASPOON_ML = US_CUP_ML / 48;
// Approximate level US-cup weights. Sources and packing assumptions: docs/MEASUREMENTS.md.
export const INGREDIENT_CONVERSIONS: Record<IngredientType, { gramsPerCup: number; liquid: boolean; aliases: string[] }> = {
  flour: { gramsPerCup: 120, liquid: false, aliases: ["flour", "all-purpose flour", "all purpose flour", "plain flour", "αλεύρι", "αλεύρι για όλες τις χρήσεις"] },
  sugar: { gramsPerCup: 198, liquid: false, aliases: ["sugar", "white sugar", "granulated sugar", "granulated white sugar", "ζάχαρη", "λευκή ζάχαρη"] },
  "brown-sugar": { gramsPerCup: 213, liquid: false, aliases: ["packed brown sugar", "brown sugar, packed", "καστανή ζάχαρη πατημένη"] },
  "powdered-sugar": { gramsPerCup: 113, liquid: false, aliases: ["powdered sugar", "confectioners sugar", "icing sugar", "ζάχαρη άχνη", "άχνη ζάχαρη"] },
  butter: { gramsPerCup: 226, liquid: false, aliases: ["butter", "unsalted butter", "salted butter", "βούτυρο"] },
  honey: { gramsPerCup: 336, liquid: true, aliases: ["honey", "μέλι"] },
  cocoa: { gramsPerCup: 84, liquid: false, aliases: ["cocoa powder", "unsweetened cocoa powder", "κακάο", "κακάο σκόνη"] },
  oats: { gramsPerCup: 89, liquid: false, aliases: ["rolled oats", "old-fashioned oats", "νιφάδες βρώμης"] },
  water: { gramsPerCup: US_CUP_ML, liquid: true, aliases: ["water", "νερό"] },
  milk: { gramsPerCup: 1.03 * US_CUP_ML, liquid: true, aliases: ["milk", "whole milk", "γάλα", "πλήρες γάλα"] },
  oil: { gramsPerCup: 198, liquid: true, aliases: ["vegetable oil", "olive oil", "canola oil", "sunflower oil", "ελαιόλαδο", "ηλιέλαιο", "φυτικό λάδι"] },
};
const normalized = (value: string) => searchText(value).trim().replace(/\s+/g, " ");
const aliasTypes = new Map(Object.entries(INGREDIENT_CONVERSIONS).flatMap(([type, rule]) => rule.aliases.map(alias => [normalized(alias), type as IngredientType] as const)));
export function ingredientType(ingredient: Ingredient): IngredientType | null {
  return ingredient.ingredientType ?? aliasTypes.get(normalized(ingredient.name)) ?? null;
}
const fractions: Record<string, string> = { "¼": "1/4", "½": "1/2", "¾": "3/4", "⅐": "1/7", "⅑": "1/9", "⅒": "1/10", "⅓": "1/3", "⅔": "2/3", "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5", "⅙": "1/6", "⅚": "5/6", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8" };
export function parseQuantity(value: string | null): number | null {
  if (!value) return null;
  const text = value.trim().replace(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, char => " " + fractions[char]).replace(/\u2044/g, "/").trim().replace(/^(\d+)-(\d+\/\d+)$/, "$1 $2");
  let result: number;
  if (/^\d+(?:[.,]\d+)?$/.test(text)) result = Number(text.replace(",", "."));
  else {
    const match = /^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/.exec(text);
    if (!match || Number(match[3]) === 0) return null;
    result = Number(match[1] || 0) + Number(match[2]) / Number(match[3]);
  }
  return Number.isFinite(result) && result <= 1e9 ? result : null;
}
type Unit = { kind: "mass" | "volume"; factor: number; system: MeasurementSystem };
const units = new Map<string, Unit>();
for (const [aliases, kind, factor, system] of [
  [["g", "gram", "grams", "gr", "γρ", "γραμμάριο", "γραμμάρια"], "mass", 1, "metric"],
  [["kg", "kilogram", "kilograms", "κιλό", "κιλά"], "mass", 1000, "metric"],
  [["ml", "milliliter", "milliliters", "millilitre", "millilitres"], "volume", 1, "metric"],
  [["l", "liter", "liters", "litre", "litres", "λίτρο", "λίτρα"], "volume", 1000, "metric"],
  [["cup", "cups", "us cup", "us cups", "φλιτζάνι", "φλιτζάνια", "φλ"], "volume", US_CUP_ML, "cups"],
  [["tbsp", "tablespoon", "tablespoons", "κσ", "κουταλιά της σούπας", "κουταλιές της σούπας"], "volume", US_TABLESPOON_ML, "cups"],
  [["tsp", "teaspoon", "teaspoons", "κγ", "κουταλάκι του γλυκού", "κουταλάκια του γλυκού"], "volume", US_TEASPOON_ML, "cups"],
  [["lb", "lbs", "pound", "pounds"], "mass", 453.59237, "metric"],
  [["oz", "ounce", "ounces"], "mass", 28.349523125, "metric"],
] as const) for (const alias of aliases) units.set(normalized(alias).replaceAll(".", ""), { kind, factor, system });

export function formatFraction(value: number): string {
  // Use familiar fractions only when within 1% of the actual result; otherwise keep a decimal.
  for (const denominator of [1, 2, 3, 4, 8, 16]) {
    const numerator = Math.round(value * denominator);
    if (Math.abs(numerator / denominator - value) <= Math.max(1e-8, value * 0.01)) {
      const whole = Math.floor(numerator / denominator), rest = numerator % denominator;
      return rest === 0 ? String(whole) : `${whole ? whole + " " : ""}${rest}/${denominator}`;
    }
  }
  return Number(value.toFixed(2)).toString();
}
const rounded = (value: number) => Number(value.toPrecision(3)).toString();
export type DisplayMeasurement = { quantity: string | null; unit: string | null; converted: boolean; approximate: boolean; reason: string | null };
export function convertIngredient(ingredient: Ingredient, system: MeasurementSystem): DisplayMeasurement {
  const original = (reason: string | null): DisplayMeasurement => ({ quantity: ingredient.quantity, unit: ingredient.unit, converted: false, approximate: false, reason });
  const amount = parseQuantity(ingredient.quantity);
  const unit = ingredient.unit ? units.get(normalized(ingredient.unit).replaceAll(".", "")) : undefined;
  if (amount === null || !unit) return original("Original measure: missing, ambiguous, or unsupported quantity/unit.");
  if (/(heaped|heaping|sifted|loosely packed|κοσκινισ|γεματ|φουσκωτ)/.test(normalized(ingredient.notes || "")) && unit.system !== system) return original("Original measure: packing or preparation makes conversion uncertain.");
  const ruleType = ingredientType(ingredient);
  const rule = ruleType ? INGREDIENT_CONVERSIONS[ruleType] : null;
  const base = amount * unit.factor;
  if (system === "metric") {
    const useMass = unit.kind === "mass" || Boolean(rule && !rule.liquid);
    const value = unit.kind === "volume" && useMass && rule ? base * rule.gramsPerCup / US_CUP_ML : base;
    const large = value >= 1000;
    const targetUnit = useMass ? large ? "kg" : "g" : large ? "L" : "ml";
    const quantity = rounded(large ? value / 1000 : value);
    return { quantity, unit: targetUnit, converted: quantity !== ingredient.quantity || targetUnit !== ingredient.unit, approximate: unit.kind === "volume" && useMass || Math.abs(Number(quantity) * (large ? 1000 : 1) - value) > 1e-8, reason: unit.kind === "volume" && useMass ? "Approximate ingredient-specific cup weight; use a scale for precision." : null };
  }
  if (unit.kind === "mass" && !rule) return original("Original measure: no reliable weight-to-volume rule for this ingredient.");
  if (unit.system === "cups") return original(null);
  const volume = unit.kind === "mass" && rule ? base / rule.gramsPerCup * US_CUP_ML : base;
  const [value, targetUnit] = volume >= US_CUP_ML / 4 ? [volume / US_CUP_ML, "cup"] : volume >= US_TABLESPOON_ML ? [volume / US_TABLESPOON_ML, "tbsp"] : [volume / US_TEASPOON_ML, "tsp"];
  const quantity = formatFraction(value);
  if (value > 0 && Number(quantity) === 0) return original("Original measure: too small for a useful kitchen conversion.");
  return { quantity, unit: targetUnit, converted: true, approximate: unit.kind === "mass" || Math.abs((parseQuantity(quantity) ?? 0) - value) > 1e-8, reason: unit.kind === "mass" ? "Approximate ingredient-specific cup weight; use a scale for precision." : null };
}
