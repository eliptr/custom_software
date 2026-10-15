import { describe, expect, it, vi } from "vitest";
import { applyMetadataSuggestion, metadataSchema, toRecipeContent } from "../../src/lib/recipe";
import { cardMetadata } from "../../src/lib/metadata";
import { collectionVocabulary } from "../../src/lib/taxonomy";
import { normalizeMetadataSuggestions } from "../../src/lib/ai/metadata";
import { DeepSeekExtractor } from "../../src/lib/ai/deepseek";
import { parseAIResponse } from "../../src/lib/ai/provider";
import { aiRecipe, greekRecipe } from "../fixtures";
const content = toRecipeContent(greekRecipe);
const vocabulary = collectionVocabulary([greekRecipe]);
const raw = { title: "Cake", prepTime: 15, cookTime: 35, servings: 4, cookingTemperatures: [{ celsius: 180, method: "oven", source: "extracted" }], metadataSources: { title: "estimated", cookTime: "extracted", prepTime: "estimated" }, categoryId: vocabulary.categories[0].id, tagIds: [vocabulary.tags[0].id] };
describe("metadata enrichment", () => {
  it("shows cooking time only, includes method/servings, and omits absent values", () => {
    expect(cardMetadata({ ...content, prepTime: 10, cookTime: 35, cookingTemperatures: [{ celsius: 180, method: "oven", source: "estimated" }] })).toEqual([
      { kind: "time", text: "35 min cook" }, { kind: "temperature", text: "≈ 180°C oven" }, { kind: "servings", text: "Serves 4" },
    ]);
    expect(cardMetadata({ ...content, cookTime: null, servings: null })).toEqual([]);
    expect(cardMetadata({ ...content, cookTime: 0 })[0].text).toBe("0 min cook");
  });
  it("resolves only supplied IDs, never creates category/tag names, and marks estimates", () => {
    const result = normalizeMetadataSuggestions(raw, vocabulary);
    expect(result.category).toBe(greekRecipe.category);
    expect(result.tags).toEqual([vocabulary.tags[0].name]);
    expect(result.metadataSources.prepTime).toBe("estimated");
    expect(result.cookingTemperatures[0].source).toBe("extracted");
    const unknown = normalizeMetadataSuggestions({ ...raw, categoryId: "made-up", tagIds: ["made-up", vocabulary.tags[0].id, vocabulary.tags[0].id] }, vocabulary);
    expect(unknown.category).toBeNull(); expect(unknown.tags).toEqual([vocabulary.tags[0].name]);
    expect(normalizeMetadataSuggestions(raw, { categories: [], tags: [] })).toMatchObject({ category: null, tags: [] });
  });
  it("validates screenshot classification too and rejects invented legacy labels", () => {
    const result = parseAIResponse(JSON.stringify({ recipe: { ...aiRecipe(content), categoryId: "unknown", tagIds: [vocabulary.tags[0].id, "new tag"] }, warnings: [] }), vocabulary);
    expect(result.recipe.category).toBeNull(); expect(result.recipe.tags).toEqual([vocabulary.tags[0].name]);
    expect(result.warnings.some(warning => warning.field === "category")).toBe(true);
    expect(() => parseAIResponse(JSON.stringify({ recipe: content, warnings: [] }), vocabulary)).toThrow();
  });
  it("applies only explicitly accepted fields and preserves edits made after the request", () => {
    const current = { ...content, title: "My edited title", prepTime: 27 };
    const before = structuredClone(current);
    const suggested = normalizeMetadataSuggestions(raw, vocabulary);
    const result = applyMetadataSuggestion(current, suggested, "cookTime");
    expect(result.title).toBe("My edited title"); expect(result.prepTime).toBe(27);
    expect(result.ingredients).toEqual(current.ingredients); expect(result.instructions).toEqual(current.instructions);
    expect(result.cookTime).toBe(35); expect(current).toEqual(before);
  });
  it("never allows an AI suggestion to claim user provenance and marks unclassified suggestions as estimates", () => {
    expect(() => normalizeMetadataSuggestions({ ...raw, metadataSources: { title: "user" } }, vocabulary)).toThrow();
    const result = normalizeMetadataSuggestions({ ...raw, metadataSources: {}, cookingTemperatures: [{ celsius: 175, method: "frying oil" }] }, vocabulary);
    expect(result.metadataSources.title).toBe("estimated"); expect(result.cookingTemperatures[0].source).toBe("estimated");
  });
  it("requests metadata from current text with dynamic vocabulary and no screenshots", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(raw) } }] }));
    const result = await new DeepSeekExtractor("test", undefined, fetcher).estimate(content, vocabulary);
    expect(metadataSchema.safeParse(result).success).toBe(true);
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.messages[0].content).toContain(vocabulary.categories[0].id);
    expect(JSON.parse(body.messages[1].content).ingredients).toEqual(content.ingredients);
    expect(body.messages[1].content).not.toContain("image_url");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
