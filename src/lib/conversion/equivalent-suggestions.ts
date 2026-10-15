import { z } from "zod";
import { metadataSchema, type Ingredient } from "../recipe";
import { equivalentPairSchema, savedMeasurementsSchema } from "./equivalents-schema";
import { equivalentFingerprint, equivalentInput, normalizeEquivalentPair, sameEquivalentInput } from "./equivalents";
import { canonicalJSON } from "../serialization";

const fingerprint = z.string().regex(/^[a-f0-9]{16}$/);
const targetSchema = z.object({ ref: z.uuid(), index: z.number().int().min(0).max(199), fingerprint }).strict();
export const conversionRequestSchema = z.object({ requestId: z.uuid(), targets: z.array(targetSchema).max(200) }).strict().refine(request => new Set(request.targets.map(target => target.ref)).size === request.targets.length && new Set(request.targets.map(target => target.index)).size === request.targets.length, "Duplicate conversion targets");
export type ConversionRequest = z.infer<typeof conversionRequestSchema>;
export const aiEquivalentSuggestionSchema = z.object({ ref: z.uuid(), fingerprint, equivalents: equivalentPairSchema.nullable() }).strict();
export const equivalentSuggestionSchema = z.object({ ref: z.uuid(), fingerprint, measurements: savedMeasurementsSchema }).strict();
export type EquivalentSuggestion = z.infer<typeof equivalentSuggestionSchema>;
export const equivalentEstimateResponseSchema = z.object({ metadata: metadataSchema, requestId: z.uuid(), conversionSuggestions: z.array(z.unknown()).max(200) }).strict();
export type EquivalentEstimateResponse = { metadata: z.infer<typeof metadataSchema>; requestId: string; conversionSuggestions: EquivalentSuggestion[] };

export function createConversionRequest(ingredients: Ingredient[]): ConversionRequest {
  return { requestId: crypto.randomUUID(), targets: ingredients.map((item, index) => ({ ref: crypto.randomUUID(), index, fingerprint: equivalentFingerprint(equivalentInput(item)) })) };
}
export function validConversionRequest(request: ConversionRequest, ingredients: Ingredient[]): boolean {
  return request.targets.length === ingredients.length && new Set(request.targets.map(target => target.ref)).size === ingredients.length && new Set(request.targets.map(target => target.index)).size === ingredients.length && request.targets.every(target => ingredients[target.index] && target.fingerprint === equivalentFingerprint(equivalentInput(ingredients[target.index])));
}
export function normalizeEquivalentSuggestions(raw: unknown[], request: ConversionRequest, ingredients: Ingredient[], model: string, now?: string): EquivalentSuggestion[] {
  if (!validConversionRequest(request, ingredients)) return [];
  const parsed = raw.map(value => aiEquivalentSuggestionSchema.safeParse(value));
  // Count raw references too: one malformed duplicate must not authorize its valid twin.
  const refs = raw.map(value => value && typeof value === "object" && "ref" in value ? value.ref : null);
  return parsed.flatMap(result => {
    if (!result.success) return [];
    const value = result.data, target = request.targets.find(target => target.ref === value.ref);
    if (!target || refs.filter(ref => ref === value.ref).length !== 1 || value.fingerprint !== target.fingerprint) return [];
    const measurements = normalizeEquivalentPair(value.equivalents, ingredients[target.index], model, now);
    return measurements ? [{ ref: value.ref, fingerprint: value.fingerprint, measurements }] : [];
  });
}
export function validateSavedSuggestions(raw: unknown[], request: ConversionRequest, ingredients: Ingredient[]): EquivalentSuggestion[] {
  const parsed = raw.map(value => equivalentSuggestionSchema.safeParse(value));
  const refs = raw.map(value => value && typeof value === "object" && "ref" in value ? value.ref : null);
  return parsed.flatMap(result => {
    if (!result.success) return [];
    const value = result.data, target = request.targets.find(target => target.ref === value.ref), item = target && ingredients[target.index];
    if (!validConversionRequest(request, ingredients) || !target || !item || refs.filter(ref => ref === value.ref).length !== 1 || value.fingerprint !== target.fingerprint || !sameEquivalentInput(value.measurements.input, equivalentInput(item)) || value.measurements.inputFingerprint !== target.fingerprint) return [];
    const { form, metric, cups, assumptions, model, estimatedAt, promptVersion } = value.measurements;
    const checked = normalizeEquivalentPair({ form, metric: metric ? { amount: metric.amount, unit: metric.unit } : null, cups: cups ? { amount: cups.amount, unit: cups.unit } : null, assumptions }, item, model, estimatedAt);
    return checked && checked.promptVersion === promptVersion ? [{ ...value, measurements: checked }] : [];
  });
}
export type EquivalentBinding = { rowId: string; submitted: Ingredient; suggestion: EquivalentSuggestion };
export function canApplyEquivalent(binding: EquivalentBinding, current: Ingredient | undefined): boolean {
  if (!current || !sameEquivalentInput(equivalentInput(binding.submitted), equivalentInput(current)) || canonicalJSON(binding.submitted.savedMeasurements) !== canonicalJSON(current.savedMeasurements) || binding.submitted.conversionMode !== current.conversionMode || binding.suggestion.fingerprint !== equivalentFingerprint(equivalentInput(current))) return false;
  const checked = validateSavedSuggestions([binding.suggestion], { requestId: binding.suggestion.ref, targets: [{ ref: binding.suggestion.ref, index: 0, fingerprint: binding.suggestion.fingerprint }] }, [current]);
  return checked.length === 1 && canonicalJSON(checked[0].measurements) === canonicalJSON(binding.suggestion.measurements);
}
export function applyEquivalentSuggestion(current: Ingredient, binding: EquivalentBinding): Ingredient {
  return canApplyEquivalent(binding, current) ? { ...current, savedMeasurements: binding.suggestion.measurements } : current;
}
