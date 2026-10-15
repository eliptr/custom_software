import { afterEach, describe, expect, it, vi } from "vitest";
import { AIResponseError, normalizeExtraction, parseAIResponse } from "../../src/lib/ai/provider";
import { DeepSeekExtractor } from "../../src/lib/ai/deepseek";
import { greekRecipe, ingredientsOnlyRecipe, aiRecipe } from "../fixtures";
import { toRecipeContent } from "../../src/lib/recipe";
import { persistLocalIdentity } from "../../src/lib/conversion/identity";
const content = toRecipeContent(greekRecipe);
const completion = (content: string | null) => Response.json({ choices: [{ finish_reason: "stop", message: { content } }] });
const images = [{ mimeType: "image/png", data: "first" }, { mimeType: "image/jpeg", data: "second" }] as const;
afterEach(() => vi.restoreAllMocks());
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
    expect(() => parseAIResponse("bad JSON")).toThrow("malformed JSON");
    expect(() => parseAIResponse(JSON.stringify({ recipe: { ...content, cookTime: -1 } }))).toThrow("does not match the recipe format");
    expect(() => normalizeExtraction({ recipe: { ...content, cookTime: -1 } })).toThrow();
  });
  it("accepts ingredients-only screenshots with empty steps and unknown times and quantities", () => {
    const result = parseAIResponse(JSON.stringify({ recipe: ingredientsOnlyRecipe }));
    expect(result.recipe).toEqual(ingredientsOnlyRecipe);
    expect(result.warnings).toContainEqual({ field: "instructions", message: expect.stringContaining("add steps later") });
    expect(result.warnings.some((warning) => warning.field === "ingredients.3.quantity")).toBe(true);
    // The breading and slurry amounts are distinct, supported entries; neither is discarded.
    expect(result.recipe.ingredients.filter((ingredient) => ingredient.name === "Cornstarch")).toHaveLength(2);
  });
  it.each([
    ["malformed JSON", "not JSON"],
    ["wrong field types", JSON.stringify({ recipe: { ...aiRecipe(content), cookTime: "35 minutes" } })],
    ["plain-string warnings", JSON.stringify({ recipe: aiRecipe(content), warnings: ["Check salt"] })],
    ["empty output", null],
  ])("retries %s once using the same screenshots and overall time budget", async (_label, invalid) => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(completion(invalid))
      .mockResolvedValueOnce(completion(JSON.stringify({ recipe: aiRecipe(ingredientsOnlyRecipe), warnings: [] })));
    const provider = new DeepSeekExtractor("test-key", undefined, fetcher);
    const result = await provider.extract([...images]);
    expect(result.recipe).toEqual({ ...ingredientsOnlyRecipe, ingredients: ingredientsOnlyRecipe.ingredients.map(persistLocalIdentity) });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(timeout).toHaveBeenCalledExactlyOnceWith(80000);
    const [first, retry] = fetcher.mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(retry.messages[1]).toEqual(first.messages[1]);
    expect(retry.messages[0].content).toContain("Your previous response");
    expect(fetcher.mock.calls[1][1]?.signal).toBe(fetcher.mock.calls[0][1]?.signal);
  });
  it.each(["not JSON", JSON.stringify({ recipe: aiRecipe(content), warnings: ["Check salt"] })])("stops after two invalid outputs and reports a format error", async (invalid) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => completion(invalid));
    await expect(new DeepSeekExtractor("test-key", undefined, fetcher).extract([...images])).rejects.toBeInstanceOf(AIResponseError);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not retry service errors, truncated output, or invalid response envelopes", async () => {
    for (const response of [
      new Response("", { status: 401 }), new Response("", { status: 429 }), new Response("", { status: 503 }),
      Response.json({ choices: [{ finish_reason: "length", message: { content: "{}" } }] }),
      Response.json({ unexpected: "response" }), new Response("not JSON"),
    ]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(new DeepSeekExtractor("test-key", undefined, fetcher).extract([...images])).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it.each(["caller", "timeout"])("honors %s cancellation before starting a format retry", async (source) => {
    const controller = new AbortController();
    if (source === "timeout") vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      controller.abort(new DOMException("Cancelled", source === "timeout" ? "TimeoutError" : "AbortError"));
      return completion("invalid JSON");
    });
    await expect(new DeepSeekExtractor("test-key", undefined, fetcher).extract([...images], source === "caller" ? controller.signal : undefined)).rejects.toHaveProperty("name", source === "timeout" ? "TimeoutError" : "AbortError");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("sends all screenshots together in one vision request", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ recipe: aiRecipe(content), warnings: [] }) } }] }));
    const provider = new DeepSeekExtractor("test-key", "deepseek-flash", fetcher);
    await provider.extract([{ mimeType: "image/png", data: "first" }, { mimeType: "image/jpeg", data: "second" }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.model).toBe("deepseek-flash");
    expect(body.messages[1].content.filter((block: { type: string }) => block.type === "image_url")).toHaveLength(2);
  });
});
