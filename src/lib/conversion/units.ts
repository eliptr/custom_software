import type { MeasurementContext } from "./schema";

export const US_CUP_ML = 236.5882365;
export const US_TABLESPOON_ML = US_CUP_ML / 16;
export const US_TEASPOON_ML = US_CUP_ML / 48;
export const CONVENTIONS = {
  us: { label: "US customary", cup: US_CUP_ML, tbsp: US_TABLESPOON_ML, tsp: US_TEASPOON_ML },
  "metric-250": { label: "250 ml cup / 15 ml tablespoon", cup: 250, tbsp: 15, tsp: 5 },
  "metric-240": { label: "240 ml cup / 15 ml tablespoon", cup: 240, tbsp: 15, tsp: 5 },
  australian: { label: "Australian: 250 ml cup / 20 ml tablespoon", cup: 250, tbsp: 20, tsp: 5 },
  unknown: { label: "Unknown cup/spoon convention", cup: null, tbsp: null, tsp: null },
} as const;
export const normalizeText = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/ς/g, "σ").trim().replace(/\s+/g, " ");
const key = (text: string) => normalizeText(text).replace(/[.\s]/g, "");
type UnitDefinition = { kind: "mass" | "volume"; factor: number; convention: string | null };
const definitions = new Map<string, UnitDefinition>();
for (const [aliases, kind, factor] of [
  [["g", "gram", "grams", "gr", "γρ", "γραμμάρια", "γραμμάριο"], "mass", 1],
  [["kg", "kilogram", "kilograms", "κιλό", "κιλά"], "mass", 1000],
  [["ml", "milliliter", "milliliters", "millilitre", "millilitres"], "volume", 1],
  [["l", "liter", "liters", "litre", "litres", "λίτρο", "λίτρα"], "volume", 1000],
  [["lb", "lbs", "pound", "pounds"], "mass", 453.59237],
  [["oz", "ounce", "ounces"], "mass", 28.349523125],
] as const) for (const alias of aliases) definitions.set(key(alias), { kind, factor, convention: null });
const spoons = new Map<string, "cup" | "tbsp" | "tsp">();
for (const [type, aliases] of [
  ["cup", ["cup", "cups", "φλιτζάνι", "φλιτζάνια", "φλ"]],
  ["tbsp", ["tbsp", "tablespoon", "tablespoons", "κσ", "κουταλιά της σούπας", "κουταλιές της σούπας"]],
  ["tsp", ["tsp", "teaspoon", "teaspoons", "κγ", "κουταλάκι του γλυκού", "κουταλάκια του γλυκού"]],
] as const) for (const alias of aliases) spoons.set(key(alias), type);

export function isConventionUnit(raw: string | null): boolean {
  return Boolean(raw && spoons.has(key(raw.trim().replace(/^us\s+/i, ""))));
}
export function resolveUnit(raw: string | null, context: MeasurementContext): UnitDefinition | null {
  if (!raw) return null;
  const direct = definitions.get(key(raw));
  if (direct) return direct;
  const explicitUS = /^us\s+/i.test(raw.trim());
  const spoon = spoons.get(key(raw.trim().replace(/^us\s+/i, "")));
  if (!spoon) return null;
  const convention = CONVENTIONS[explicitUS ? "us" : context.convention];
  const factor = convention[spoon];
  if (factor === null) return null;
  return { kind: "volume", factor, convention: explicitUS ? "Explicit US customary" : `${convention.label}${context.conventionSource === "assumed" || context.conventionSource === "legacy" ? " (assumed)" : ""}` };
}
