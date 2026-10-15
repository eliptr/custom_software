import { z } from "zod";
import { METADATA_FIELDS, extractionSchema, metadataSchema, temperatureSchema, type Metadata } from "../recipe";
import { type Vocabulary } from "../taxonomy";

const selection = { categoryId: z.string().max(210).nullable(), tagIds: z.array(z.string().max(210)).max(50) };
const aiSource = z.enum(["extracted", "estimated", "unknown"]);
const aiFields = { ...selection, metadataSources: z.partialRecord(z.enum(METADATA_FIELDS), aiSource).default({}), cookingTemperatures: z.array(temperatureSchema.extend({ source: aiSource.default("unknown") })).max(10).default([]) };
export const aiMetadataSchema = metadataSchema.omit({ category: true, tags: true }).extend(aiFields).strict();
export const aiExtractionSchema = extractionSchema.extend({ recipe: extractionSchema.shape.recipe.omit({ category: true, tags: true }).extend(aiFields).strict() });
export function resolveChoices(categoryId: string | null, tagIds: string[], vocabulary: Vocabulary) {
  const category = vocabulary.categories.find(term => term.id === categoryId)?.name ?? null;
  const tags = [...new Set(tagIds.flatMap(id => { const term = vocabulary.tags.find(term => term.id === id); return term ? [term.name] : []; }))];
  const warnings = [
    ...(categoryId && !category ? [{ field: "category", message: "The AI suggested an unknown category. It was left empty." }] : []),
    ...(tagIds.some(id => !vocabulary.tags.some(term => term.id === id)) ? [{ field: "tags", message: "Unknown AI tag IDs were ignored. No new tags were created." }] : []),
  ];
  return { category, tags, warnings };
}
export function withConservativeSources(metadata: Metadata): Metadata {
  const metadataSources = { ...metadata.metadataSources };
  for (const field of METADATA_FIELDS) {
    const value = metadata[field];
    if (value === null || value === "" || Array.isArray(value) && !value.length) delete metadataSources[field];
    else if (metadataSources[field] === undefined || metadataSources[field] === "unknown") metadataSources[field] = "estimated";
  }
  return { ...metadata, metadataSources, cookingTemperatures: metadata.cookingTemperatures.map(temperature => ({ ...temperature, source: temperature.source === "unknown" ? "estimated" : temperature.source })) };
}
export function normalizeMetadataSuggestions(raw: unknown, vocabulary: Vocabulary): Metadata {
  const { categoryId, tagIds, ...values } = aiMetadataSchema.parse(raw);
  const choices = resolveChoices(categoryId, tagIds, vocabulary);
  return withConservativeSources(metadataSchema.parse({ ...values, category: choices.category, tags: choices.tags }));
}
