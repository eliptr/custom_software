import { z } from "zod";
import { metadataSchema, type Ingredient } from "../recipe";
import { CATALOG_VERSION } from "./catalog";
import { contextFingerprint, identityContext, makeIdentity, resolveIdentity, sameContext, supportedAIProfile } from "./identity";
const targetSchema = z.object({ ref: z.uuid(), index: z.number().int().min(0).max(199), fingerprint: z.string().regex(/^[a-f0-9]{16}$/) }).strict();
export const identificationRequestSchema = z.object({ requestId: z.uuid(), catalogVersion: z.string().max(100), targets: z.array(targetSchema).max(200) }).strict().refine(value => new Set(value.targets.map(target => target.ref)).size === value.targets.length && new Set(value.targets.map(target => target.index)).size === value.targets.length, "Duplicate ingredient targets");
export type IdentificationRequest = z.infer<typeof identificationRequestSchema>;
export const aiIngredientSuggestionSchema = z.object({ ref: z.uuid(), fingerprint: z.string().regex(/^[a-f0-9]{16}$/), profileId: z.string().max(100).nullable() }).strict();
export const ingredientSuggestionSchema = aiIngredientSuggestionSchema.extend({ profileId: z.string().min(1).max(100), catalogVersion: z.string().max(100) });
export type IngredientSuggestion = z.infer<typeof ingredientSuggestionSchema>;
export const estimateResponseSchema = z.object({ metadata: metadataSchema, requestId: z.uuid(), ingredientSuggestions: z.array(ingredientSuggestionSchema).max(200) }).strict();
export type EstimateResponse = z.infer<typeof estimateResponseSchema>;
export const needsIdentification = (item: Ingredient) => item.conversionMode !== "original" && item.identity?.source !== "user" && !resolveIdentity(item).profile;
export function createIdentificationRequest(ingredients: Ingredient[]): IdentificationRequest {
  return { requestId: crypto.randomUUID(), catalogVersion: CATALOG_VERSION, targets: ingredients.flatMap((item, index) => needsIdentification(item) ? [{ ref: crypto.randomUUID(), index, fingerprint: contextFingerprint(identityContext(item)) }] : []) };
}
export function validIdentificationRequest(request: IdentificationRequest, ingredients: Ingredient[]): boolean {
  return request.catalogVersion === CATALOG_VERSION && request.targets.every(target => ingredients[target.index] && needsIdentification(ingredients[target.index]) && target.fingerprint === contextFingerprint(identityContext(ingredients[target.index])));
}
export function validateIngredientSuggestions(raw: z.infer<typeof aiIngredientSuggestionSchema>[], request: IdentificationRequest, ingredients: Ingredient[]): IngredientSuggestion[] {
  if (!validIdentificationRequest(request, ingredients)) return [];
  return raw.flatMap(suggestion => {
    if (raw.filter(other => other.ref === suggestion.ref).length !== 1) return [];
    const target = request.targets.find(target => target.ref === suggestion.ref);
    const item = target && ingredients[target.index];
    return target && item && suggestion.fingerprint === target.fingerprint && suggestion.profileId && supportedAIProfile(item, suggestion.profileId) ? [{ ...suggestion, profileId: suggestion.profileId, catalogVersion: CATALOG_VERSION }] : [];
  });
}
export type IngredientBinding = { rowId: string; submitted: Ingredient; suggestion: IngredientSuggestion };
export function canApplyIngredient(binding: IngredientBinding, current: Ingredient | undefined): boolean {
  return Boolean(current && current.conversionMode !== "original" && current.identity?.source !== "user" && sameContext(identityContext(binding.submitted), identityContext(current)) && JSON.stringify(binding.submitted.identity) === JSON.stringify(current.identity) && binding.suggestion.catalogVersion === CATALOG_VERSION && binding.suggestion.fingerprint === contextFingerprint(identityContext(current)) && supportedAIProfile(current, binding.suggestion.profileId));
}
export function applyIngredientSuggestion(current: Ingredient, binding: IngredientBinding): Ingredient {
  return canApplyIngredient(binding, current) ? { ...current, identity: makeIdentity(current, binding.suggestion.profileId, "ai") } : current;
}
