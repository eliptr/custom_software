import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { metadataSchema, toRecipeContent } from "../../src/lib/recipe";
import { collectionVocabulary } from "../../src/lib/taxonomy";
import { greekRecipe } from "../fixtures";
import { createIdentificationRequest } from "../../src/lib/conversion/suggestions";
const mocks = vi.hoisted(() => ({ checkRateLimit: vi.fn(), estimate: vi.fn() }));
vi.mock("@vercel/firewall", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("../../src/lib/ai/deepseek", () => ({ DeepSeekExtractor: class { estimate = mocks.estimate; } }));
import { POST } from "../../src/app/api/estimate/route";
const recipe = toRecipeContent(greekRecipe), vocabulary = collectionVocabulary([greekRecipe]);
const suggestions = metadataSchema.strip().parse(recipe);
const upload = (body: unknown = { recipe, vocabulary }, code = "1234") => new Request("https://recipe.test/api/estimate", { method: "POST", headers: { Authorization: `Bearer ${code}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL", "1"); vi.stubEnv("APP_ACCESS_TOKEN", "1234"); vi.stubEnv("APP_ORIGIN", ""); vi.stubEnv("DEEPSEEK_API_KEY", "test");
  vi.clearAllMocks(); mocks.checkRateLimit.mockResolvedValue({ rateLimited: false }); mocks.estimate.mockResolvedValue({ metadata: suggestions, requestId: crypto.randomUUID(), ingredientSuggestions: [] });
});
afterEach(() => vi.unstubAllEnvs());
describe("protected metadata endpoint", () => {
  it("rejects missing/wrong authentication before paid calls", async () => {
    expect((await POST(upload(undefined, "wrong"))).status).toBe(401);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled(); expect(mocks.estimate).not.toHaveBeenCalled();
  });
  it("validates current recipe and vocabulary and requires some cooking evidence", async () => {
    for (const input of [{ recipe: { ...recipe, ingredients: [], instructions: [] }, vocabulary }, { recipe, vocabulary: { categories: [...vocabulary.categories, ...vocabulary.categories], tags: [] } }, { recipe, vocabulary, extra: true }]) expect((await POST(upload(input))).status).toBe(400);
    expect(mocks.estimate).not.toHaveBeenCalled(); expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });
  it("shares the native extraction quota and fails closed", async () => {
    mocks.checkRateLimit.mockResolvedValue({ rateLimited: true });
    const limited = await POST(upload()); expect(limited.status).toBe(429); expect(limited.headers.get("retry-after")).toBe("600");
    mocks.checkRateLimit.mockResolvedValue({ rateLimited: false, error: "not-found" });
    expect((await POST(upload())).status).toBe(503);
    expect(mocks.estimate).not.toHaveBeenCalled();
  });
  it("returns uncached suggestions from the current text and supplied vocabulary", async () => {
    const response = await POST(upload());
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(suggestions);
    expect(mocks.estimate).toHaveBeenCalledWith(recipe, vocabulary, expect.any(AbortSignal), undefined);
    expect(mocks.checkRateLimit.mock.calls[0][0]).toBe("recipe-extraction");
  });
  it("passes correlated ingredient targets in the same request and rejects stale targets before paid work", async () => {
    const identification = createIdentificationRequest(recipe.ingredients);
    const envelope = { metadata: suggestions, requestId: identification.requestId, ingredientSuggestions: [] };
    mocks.estimate.mockResolvedValue(envelope);
    const response = await POST(upload({ recipe, vocabulary, identification }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual(envelope);
    expect(mocks.estimate).toHaveBeenCalledWith(recipe, vocabulary, expect.any(AbortSignal), identification);
    mocks.estimate.mockClear(); mocks.checkRateLimit.mockClear();
    const stale = { ...identification, targets: identification.targets.map(target => ({ ...target, fingerprint: "0000000000000000" })) };
    expect((await POST(upload({ recipe, vocabulary, identification: stale }))).status).toBe(400);
    expect(mocks.estimate).not.toHaveBeenCalled(); expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });
});
