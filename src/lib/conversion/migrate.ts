import { ingredientSchema, recipeSchema } from "../recipe";
import { LEGACY_PROFILE_IDS } from "./catalog";
import { identityContext } from "./identity";

function migrateIngredient(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const input = raw as Record<string, unknown>;
  const item = ingredientSchema.parse({ ...input, ...(!("measurementContext" in input) ? { measurementContext: { convention: "us", conventionSource: "legacy", numberFormat: "auto" } } : {}) });
  if (!("identity" in input) && item.ingredientType) item.identity = { profileId: LEGACY_PROFILE_IDS[item.ingredientType], source: "legacy", catalogVersion: "legacy/2", context: identityContext(item), assumptionsConfirmed: false };
  return item;
}
export function migrateRecipe(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return recipeSchema.parse(raw);
  const input = raw as Record<string, unknown>;
  const content = (value: Record<string, unknown>) => ({ ...value, ingredients: Array.isArray(value.ingredients) ? value.ingredients.map(migrateIngredient) : value.ingredients });
  return recipeSchema.parse({ ...content(input), revisions: Array.isArray(input.revisions) ? input.revisions.map(rawRevision => {
    if (!rawRevision || typeof rawRevision !== "object" || Array.isArray(rawRevision)) return rawRevision;
    const revision = rawRevision as Record<string, unknown>;
    return { ...revision, snapshot: revision.snapshot && typeof revision.snapshot === "object" && !Array.isArray(revision.snapshot) ? content(revision.snapshot as Record<string, unknown>) : revision.snapshot };
  }) : input.revisions });
}
