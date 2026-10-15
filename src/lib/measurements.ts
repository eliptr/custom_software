import type { Ingredient } from "./recipe";
import { resolveUnit, US_CUP_ML, US_TABLESPOON_ML, US_TEASPOON_ML } from "./conversion/units";
import { chooseCups, cupsFactor, effectiveMeasurements, exactSource } from "./conversion/equivalents";
import { parseQuantity } from "./conversion/quantity";
import { formatFraction, kitchenDecimal } from "./conversion/format";
export { parseQuantity, formatFraction, US_CUP_ML, US_TABLESPOON_ML, US_TEASPOON_ML };
export type MeasurementSystem = "metric" | "cups";
export type DisplayMeasurement = {
  quantity: string | null; unit: string | null; converted: boolean; approximate: boolean; reason: string | null;
  kind: "direct" | "ingredient-estimate" | "original" | "unsupported"; convention: string | null;
};
export function convertIngredient(ingredient: Ingredient, system: MeasurementSystem): DisplayMeasurement {
  const unit = resolveUnit(ingredient.unit, ingredient.measurementContext);
  const original = (reason: string | null, kind: DisplayMeasurement["kind"] = "unsupported"): DisplayMeasurement => ({ quantity: ingredient.quantity, unit: ingredient.unit, converted: false, approximate: false, reason, kind, convention: unit?.convention ?? null });
  if (ingredient.conversionMode === "original") return original("Original measurement selected.", "original");
  const pair = effectiveMeasurements(ingredient), saved = pair?.[system];
  let value: number, targetUnit: string, estimated = false;
  if (saved) { value = saved.amount; targetUnit = saved.unit; estimated = saved.source === "estimated"; }
  else {
    const source = exactSource(ingredient);
    if (!source || system === "cups" && source.kind !== "volume") return original(ingredient.savedMeasurements && !pair ? "Saved estimate needs refreshing after this edit." : "No saved equivalent. Re-estimate to request one.");
    if (system === "metric") {
      const large = source.base >= 1000;
      value = source.base / (large ? 1000 : 1);
      targetUnit = source.kind === "mass" ? large ? "kg" : "g" : large ? "L" : "ml";
    } else { targetUnit = chooseCups(source.base); value = source.base / cupsFactor(targetUnit as "cup" | "tbsp" | "tsp"); }
  }
  const volume = system === "cups" ? value * cupsFactor(targetUnit as "cup" | "tbsp" | "tsp") : null;
  if (volume !== null && volume > 0 && volume < US_TEASPOON_ML / 64) return original("Original measure: too small for a useful kitchen conversion.");
  const quantity = system === "cups" ? formatFraction(value) : kitchenDecimal(value);
  const displayed = parseQuantity(quantity, "en-US");
  if (displayed === null || value > 0 && Math.abs(displayed - value) / value > 0.01) return original("Original measure: cannot round this amount accurately.");
  return { quantity, unit: targetUnit, converted: quantity !== ingredient.quantity || targetUnit !== ingredient.unit,
    approximate: estimated, kind: estimated ? "ingredient-estimate" : "direct", convention: unit?.convention ?? null, reason: saved ? null : "Direct unit conversion.",
  };
}
