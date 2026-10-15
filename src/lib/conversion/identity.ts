import type { Ingredient } from "../recipe";
import { CATALOG_VERSION, INGREDIENT_PROFILES, getProfile, type IngredientProfile } from "./catalog";
import type { IdentityContext, IngredientIdentity } from "./schema";
import { normalizeText } from "./units";
export function identityContext(ingredient: Ingredient): IdentityContext {
  return { name: ingredient.name, notes: ingredient.notes, unit: ingredient.unit, convention: ingredient.measurementContext.convention, numberFormat: ingredient.measurementContext.numberFormat };
}
export const sameContext = (a: IdentityContext, b: IdentityContext) => JSON.stringify(a) === JSON.stringify(b);
export function contextFingerprint(context: IdentityContext): string {
  // Correlation only. Acceptance also compares exact context and the editor row identity.
  let a = 2166136261, b = 5381;
  for (const char of JSON.stringify(context)) { a = Math.imul(a ^ char.charCodeAt(0), 16777619); b = Math.imul(b, 33) ^ char.charCodeAt(0); }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}
const harmless = (name: string) => normalizeText(name).replace(/(?:,?\s+)(?:divided|for serving|σε δοσεισ)\s*$/u, "").trim();
const packed = (text: string) => /\b(?:firmly\s+)?packed\b|πατημεν|συμπιεσμεν/u.test(text) && !/loosely packed|unpacked|not packed|ασυμπιεστ/u.test(text);
function bareName(name: string): string {
  return harmless(name).replace(/^(?:firmly )?packed\s+|,?\s+(?:firmly )?packed$/g, "").replace(/\s+πατημενη$/u, "").trim();
}
export function uncertainPreparation(ingredient: Ingredient): boolean {
  const text = normalizeText(ingredient.name + " " + (ingredient.notes || ""));
  return /\b(?:heaped|heaping|sifted|melted|whipped|chopped|ground|cooked|toasted|compressed)\b|loosely packed|not packed|unpacked|κοσκινισ|γεματ|φουσκωτ|λιωμεν/u.test(text.replace(/\bunsifted\b|un-sifted/g, ""));
}
export function preparationCompatible(ingredient: Ingredient, profile: IngredientProfile, confirmed = false): boolean {
  const text = normalizeText(ingredient.name + " " + (ingredient.notes || ""));
  if (uncertainPreparation(ingredient)) return false;
  if (!profile.requiresPacked && packed(text)) return false;
  return !profile.requiresPacked || packed(text) || confirmed;
}
export function localProfile(ingredient: Ingredient): IngredientProfile | null {
  const name = bareName(ingredient.name);
  return INGREDIENT_PROFILES.find(profile => profile.aliases.some(alias => normalizeText(alias) === name) && notesSupportProfile(ingredient, profile) && preparationCompatible(ingredient, profile)) ?? null;
}
function notesSupportProfile(ingredient: Ingredient, profile: IngredientProfile): boolean {
  const notes = normalizeText(ingredient.notes || "");
  // Recognized identity/form qualifiers in notes are as significant as those in the name.
  const exclusions: [RegExp, string[]][] = [
    [/coconut|καρυδ/u, ["coconut-flour"]], [/almond|αμυγδαλ/u, []],
    [/whole wheat|wholemeal|rye|gluten.free|self.raising|self.rising|ολικησ|σικαλη/u, []],
    [/brown sugar|καστανη ζαχαρη/u, ["packed-brown-sugar"]],
    [/powdered sugar|icing sugar|confectioner|ζαχαρη αχνη/u, ["unsifted-powdered-sugar"]],
    [/instant|steel.cut|στιγμιαι/u, []],
    [/skim|non.dairy|condensed|evaporated|dried milk|milk powder/u, []],
  ];
  return exclusions.every(([pattern, ids]) => !pattern.test(notes) || ids.includes(profile.id));
}
export function hasIncompatiblePreparation(ingredient: Ingredient): boolean {
  return uncertainPreparation(ingredient) || INGREDIENT_PROFILES.some(profile => profile.aliases.some(alias => normalizeText(alias) === bareName(ingredient.name)) && !preparationCompatible(ingredient, profile, ingredient.identity?.source === "user" && ingredient.identity.assumptionsConfirmed));
}
// AI can reorder known words, but cannot supply missing packing or discard unknown qualifiers.
export function supportedAIProfile(ingredient: Ingredient, id: string): IngredientProfile | null {
  const profile = getProfile(id);
  if (!profile || !notesSupportProfile(ingredient, profile) || !preparationCompatible(ingredient, profile)) return null;
  const local = localProfile(ingredient);
  if (local) return local.id === id ? profile : null;
  const tokens = (text: string) => bareName(text).replace(/[,\-']/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
  return profile.aliases.some(alias => tokens(alias) === tokens(ingredient.name)) ? profile : null;
}
export function makeIdentity(ingredient: Ingredient, profileId: string, source: IngredientIdentity["source"], assumptionsConfirmed = false): IngredientIdentity {
  return { profileId, source, catalogVersion: CATALOG_VERSION, context: identityContext(ingredient), assumptionsConfirmed };
}
export function resolveIdentity(ingredient: Ingredient): { profile: IngredientProfile | null; source: IngredientIdentity["source"] | null; reason: string | null } {
  const decision = ingredient.identity;
  if (decision?.source === "user") {
    const profile = getProfile(decision.profileId);
    if (!profile || decision.catalogVersion !== CATALOG_VERSION || !sameContext(decision.context, identityContext(ingredient))) return { profile: null, source: "user", reason: "Confirm your profile again after changing its identifying context." };
    return preparationCompatible(ingredient, profile, decision.assumptionsConfirmed) ? { profile, source: "user", reason: null } : { profile: null, source: "user", reason: "Preparation conflicts with the selected profile." };
  }
  const local = localProfile(ingredient);
  if (local) return { profile: local, source: "local", reason: null };
  if (decision && decision.source !== "legacy" && decision.catalogVersion === CATALOG_VERSION && sameContext(decision.context, identityContext(ingredient))) {
    const verified = supportedAIProfile(ingredient, decision.profileId);
    if (verified) return { profile: verified, source: decision.source, reason: null };
  }
  return { profile: null, source: null, reason: "No verified profile with compatible preparation. Choose a profile or keep the original." };
}
export function persistLocalIdentity(ingredient: Ingredient): Ingredient {
  if (ingredient.conversionMode === "original" || ingredient.identity?.source === "user") return ingredient;
  const resolved = resolveIdentity(ingredient);
  return resolved.profile && resolved.source === "local" ? { ...ingredient, identity: makeIdentity(ingredient, resolved.profile.id, "local") } : ingredient;
}
