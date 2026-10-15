import type { Ingredient } from "../recipe";
import { canonicalJSON } from "../serialization";
import { equivalentPairSchema, savedMeasurementsSchema, EQUIVALENT_PROMPT_VERSION, type EquivalentInput, type SavedMeasurements } from "./equivalents-schema";
import { parseQuantity } from "./quantity";
import { resolveUnit, isConventionUnit, US_CUP_ML, US_TABLESPOON_ML, US_TEASPOON_ML } from "./units";

export const metricFactor = (unit: string) => unit === "kg" || unit === "L" ? 1000 : 1;
export const cupsFactor = (unit: "cup" | "tbsp" | "tsp") => ({ cup: US_CUP_ML, tbsp: US_TABLESPOON_ML, tsp: US_TEASPOON_ML })[unit];
export function equivalentInput(item: Ingredient): EquivalentInput {
  return { name: item.name, quantity: item.quantity, unit: item.unit, notes: item.notes, measurementContext: { ...item.measurementContext } };
}
export function equivalentFingerprint(input: EquivalentInput): string {
  let a = 2166136261, b = 5381;
  for (const char of canonicalJSON(input)) { a = Math.imul(a ^ char.charCodeAt(0), 16777619); b = Math.imul(b, 33) ^ char.charCodeAt(0); }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}
export const sameEquivalentInput = (a: EquivalentInput, b: EquivalentInput) => canonicalJSON(a) === canonicalJSON(b);
export function chooseCups(volume: number): "cup" | "tbsp" | "tsp" {
  return volume >= US_CUP_ML / 4 ? "cup" : volume >= US_TABLESPOON_ML ? "tbsp" : "tsp";
}
export function exactSource(item: Ingredient) {
  const amount = parseQuantity(item.quantity, item.measurementContext.numberFormat), unit = resolveUnit(item.unit, item.measurementContext);
  if (amount === null || !unit) return null;
  // A heaped spoon/cup is not a standardized volume. ml/L and weighed amounts remain exact.
  if (isConventionUnit(item.unit) && /heaped|heaping|γεματ|φουσκωτ/u.test((item.name + " " + item.notes).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase())) return null;
  return { kind: unit.kind, base: amount * unit.factor };
}

export function normalizeEquivalentPair(raw: unknown, ingredient: Ingredient, model: string, now = new Date().toISOString()): SavedMeasurements | null {
  const parsed = equivalentPairSchema.safeParse(raw);
  const quantity = parseQuantity(ingredient.quantity, ingredient.measurementContext.numberFormat);
  if (!parsed.success || quantity === null || quantity <= 0 || isConventionUnit(ingredient.unit) && !resolveUnit(ingredient.unit, ingredient.measurementContext)) return null;
  const proposed = parsed.data;
  if (!proposed.metric && !proposed.cups) return null;
  if (proposed.metric && (proposed.form === "solid" ? !["g", "kg"].includes(proposed.metric.unit) : !["ml", "L"].includes(proposed.metric.unit))) return null;
  let metric: SavedMeasurements["metric"] = proposed.metric ? { ...proposed.metric, source: "estimated" } : null;
  let cups: SavedMeasurements["cups"] = proposed.cups ? { ...proposed.cups, source: "estimated" } : null;
  const original = exactSource(ingredient);
  if (proposed.form === "solid") {
    if (original?.kind === "mass") {
      const unit = metric?.unit === "kg" ? "kg" : "g";
      metric = { amount: original.base / metricFactor(unit), unit, source: "exact" };
    }
    if (original?.kind === "volume") {
      const unit = cups?.unit ?? chooseCups(original.base);
      cups = { amount: original.base / cupsFactor(unit), unit, source: "exact" };
    }
  } else {
    // Both output systems measure volume for liquids: derive both from a single anchor.
    const volume = original?.kind === "volume" ? original.base : metric ? metric.amount * metricFactor(metric.unit) : cups ? cups.amount * cupsFactor(cups.unit) : null;
    if (volume !== null) {
      const metricUnit = metric?.unit === "L" ? "L" : "ml", cupsUnit = cups?.unit ?? chooseCups(volume);
      const source = original?.kind === "volume" ? "exact" : "estimated";
      metric = { amount: volume / metricFactor(metricUnit), unit: metricUnit, source };
      cups = { amount: volume / cupsFactor(cupsUnit), unit: cupsUnit, source };
    }
  }
  if (!metric && !cups) return null;
  const input = equivalentInput(ingredient);
  const result = savedMeasurementsSchema.safeParse({ form: proposed.form, metric, cups, assumptions: proposed.assumptions, input, inputFingerprint: equivalentFingerprint(input), model, promptVersion: EQUIVALENT_PROMPT_VERSION, estimatedAt: now });
  return result.success ? result.data : null;
}

// The accepted pair and input remain an immutable basis. Each display derives a fresh ratio.
export function effectiveMeasurements(ingredient: Ingredient): SavedMeasurements | null {
  const parsed = savedMeasurementsSchema.safeParse(ingredient.savedMeasurements);
  if (!parsed.success) return null;
  const saved = parsed.data, current = equivalentInput(ingredient);
  if (saved.promptVersion !== EQUIVALENT_PROMPT_VERSION || saved.inputFingerprint !== equivalentFingerprint(saved.input) || !sameEquivalentInput({ ...saved.input, quantity: current.quantity }, current)) return null;
  const canonical = normalizeEquivalentPair({ form: saved.form, metric: saved.metric ? { amount: saved.metric.amount, unit: saved.metric.unit } : null, cups: saved.cups ? { amount: saved.cups.amount, unit: saved.cups.unit } : null, assumptions: saved.assumptions }, { ...ingredient, ...saved.input }, saved.model, saved.estimatedAt);
  if (!canonical || canonicalJSON(canonical) !== canonicalJSON(saved)) return null;
  const basis = parseQuantity(saved.input.quantity, saved.input.measurementContext.numberFormat), quantity = parseQuantity(current.quantity, current.measurementContext.numberFormat);
  if (basis === null || basis <= 0 || quantity === null || quantity <= 0) return null;
  const ratio = quantity / basis;
  const result = savedMeasurementsSchema.safeParse({ ...saved, metric: saved.metric ? { ...saved.metric, amount: saved.metric.amount * ratio } : null, cups: saved.cups ? { ...saved.cups, amount: saved.cups.amount * ratio } : null });
  return result.success ? result.data : null;
}
