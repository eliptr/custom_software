import { describe, expect, it, vi } from "vitest";
import { normalizeExtraction, parseAIResponse } from "../../src/lib/ai/provider";
import { DeepSeekExtractor } from "../../src/lib/ai/deepseek";
import { greekRecipe } from "../fixtures";
import { toRecipeContent } from "../../src/lib/recipe";
const content = toRecipeContent(greekRecipe);
describe("AI extraction", () => {
  it("normalizes omitted fields and numeric quantities without inventing missing amounts", () => {
    const result = normalizeExtraction({ recipe: { title: "Test", ingredients: [{ name: "Αλάτι" }, { name: "Flour", quantity: 200 }], instructions: [] } });
    expect(result.recipe.ingredients[0].quantity).toBeNull();
    expect(result.recipe.ingredients[1].quantity).toBe("200");
    expect(result.warnings.some((warning) => warning.field === "ingredients.0.quantity")).toBe(true);
  });
  it("merges exact overlapping entries and flags conflicting ingredient amounts", () => {
    const ingredient = content.ingredients[0];
    const result = normalizeExtraction({ recipe: { ...content, ingredients: [ingredient, ingredient, { ...ingredient, quantity: "2" }], instructions: ["Mix.", "Mix.", "Bake 35 minutes."] }, warnings: [] });
    expect(result.recipe.ingredients).toHaveLength(2);
    expect(result.recipe.instructions).toEqual(["Mix.", "Bake 35 minutes."]);
    expect(result.warnings.some((warning) => warning.message.includes("multiple entries"))).toBe(true);
  });
  it("handles fenced JSON and rejects malformed or invalid responses", () => {
    expect(parseAIResponse("```json\n" + JSON.stringify({ recipe: content, warnings: [] }) + "\n```").recipe.title).toBe(content.title);
    expect(() => parseAIResponse("bad JSON")).toThrow("invalid recipe");
    expect(() => normalizeExtraction({ recipe: { ...content, cookTime: -1 } })).toThrow();
  });
  it("sends all screenshots together in one vision request", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ recipe: content, warnings: [] }) } }] }));
    const provider = new DeepSeekExtractor("test-key", "deepseek-flash", fetcher);
    await provider.extract([{ mimeType: "image/png", data: "first" }, { mimeType: "image/jpeg", data: "second" }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.model).toBe("deepseek-flash");
    expect(body.messages[1].content.filter((block: { type: string }) => block.type === "image_url")).toHaveLength(2);
  });
  it("reports API errors and incomplete output", async () => {
    for (const response of [new Response("", { status: 429 }), Response.json({ choices: [{ finish_reason: "length", message: { content: "{}" } }] })]) {
      const provider = new DeepSeekExtractor("test", undefined, vi.fn<typeof fetch>().mockResolvedValue(response));
      await expect(provider.extract([])).rejects.toThrow();
    }
  });
});
