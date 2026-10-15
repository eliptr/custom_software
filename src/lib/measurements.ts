import type { Ingredient } from "./recipe";
import { hasIncompatiblePreparation, resolveIdentity } from "./conversion/identity";
import { resolveUnit, US_CUP_ML, US_TABLESPOON_ML, US_TEASPOON_ML } from "./conversion/units";
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
  const amount = parseQuantity(ingredient.quantity, ingredient.measurementContext.numberFormat);
  if (amount === null || !unit) return original("Original measure: ambiguous or unsupported quantity, unit, or source convention.");
  if (unit.kind === "volume" && hasIncompatiblePreparation(ingredient)) return original("Original measure: packing or preparation makes the reference measure uncertain.");
  const resolved = resolveIdentity(ingredient), profile = resolved.profile;
  let value = amount * unit.factor, targetUnit: string, cross = false;
  if (system === "metric") {
    if (unit.kind === "volume" && profile && !profile.liquid) { value *= profile.referenceMassGrams / profile.referenceVolumeMl; cross = true; }
    const mass = unit.kind === "mass" || cross;
    targetUnit = mass ? value >= 1000 ? "kg" : "g" : value >= 1000 ? "L" : "ml";
    if (value >= 1000) value /= 1000;
  } else {
    if (unit.kind === "mass") {
      if (!profile) return original(resolved.reason);
      value *= profile.referenceVolumeMl / profile.referenceMassGrams; cross = true;
    }
    if (value > 0 && value < US_TEASPOON_ML / 64) return original("Original measure: too small for a useful kitchen conversion.");
    if (value >= US_CUP_ML / 4) { value /= US_CUP_ML; targetUnit = "cup"; }
    else if (value >= US_TABLESPOON_ML) { value /= US_TABLESPOON_ML; targetUnit = "tbsp"; }
    else { value /= US_TEASPOON_ML; targetUnit = "tsp"; }
  }
  const quantity = system === "cups" ? formatFraction(value) : kitchenDecimal(value);
  const displayed = parseQuantity(quantity, "en-US");
  if (displayed === null || value > 0 && Math.abs(displayed - value) / value > 0.01) return original("Original measure: cannot round this amount accurately.");
  return { quantity, unit: targetUnit, converted: quantity !== ingredient.quantity || targetUnit !== ingredient.unit,
    approximate: cross, kind: cross ? "ingredient-estimate" : "direct", convention: unit.convention,
    reason: cross ? `Ingredient-based approximation: ${profile!.label}. ${profile!.assumptions}` : `Direct unit conversion${system === "cups" ? "; display uses US cups/spoons" : ""}.${unit.kind === "volume" && !profile ? " Weight estimate unavailable: " + resolved.reason : ""}`,
  };
}
