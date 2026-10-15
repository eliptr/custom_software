import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toRecipeContent } from "../../src/lib/recipe";
import { greekRecipe } from "../fixtures";
import { normalizeEquivalentPair } from "../../src/lib/conversion/equivalents";

const mocks = vi.hoisted(() => ({ checkRateLimit: vi.fn(), extract: vi.fn() }));
vi.mock("@vercel/firewall", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("../../src/lib/ai/deepseek", () => ({ DeepSeekExtractor: class { extract = mocks.extract; } }));
import { POST } from "../../src/app/api/extract/route";

describe("extraction route protects paid provider calls", () => {
  const code = "1234";
  const images = [{ mimeType: "image/png", data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64") }];
  function upload(authorization = `Bearer ${code}`, modern: false | 1 | 3 = 3) {
    return new Request("https://recipe.test/api/extract", {
      method: "POST", headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ images, ...(modern ? { conversionVersion: modern } : {}) }),
    });
  }
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("APP_ACCESS_TOKEN", code);
    vi.stubEnv("APP_ORIGIN", "");
    vi.stubEnv("DEEPSEEK_API_KEY", "dummy-test-key");
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue({ rateLimited: false });
    mocks.extract.mockResolvedValue({ recipe: toRecipeContent(greekRecipe), warnings: [] });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("does not contact either service without the private code", async () => {
    const response = await POST(upload("Bearer wrong"));
    expect(response.status).toBe(401);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.extract).not.toHaveBeenCalled();
  });
  it("does not spend provider credit when the Vercel rule is missing", async () => {
    mocks.checkRateLimit.mockResolvedValue({ rateLimited: false, error: "not-found" });
    const response = await POST(upload());
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.extract).not.toHaveBeenCalled();
  });
  it("returns retry guidance without contacting DeepSeek when the quota is full", async () => {
    mocks.checkRateLimit.mockResolvedValue({ rateLimited: true });
    const response = await POST(upload());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("600");
    expect(mocks.extract).not.toHaveBeenCalled();
  });
  it("extracts only after an authorized upload passes the Vercel check", async () => {
    const response = await POST(upload());
    expect(response.status).toBe(200);
    const expected = toRecipeContent(greekRecipe);
    const ingredients = expected.ingredients.map(item => { const copy: Record<string, unknown> = { ...item }; delete copy.savedMeasurements; return copy; });
    expect(await response.json()).toEqual({ recipe: { ...expected, ingredients }, warnings: [] });
    expect(mocks.extract).toHaveBeenCalledWith(images, expect.any(AbortSignal), { categories: [], tags: [] });
    expect(mocks.checkRateLimit.mock.invocationCallOrder[0]).toBeLessThan(mocks.extract.mock.invocationCallOrder[0]);
  });
  it("retains the ingredient response shape for an older installed client", async () => {
    const response = await POST(upload(`Bearer ${code}`, false));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.recipe.ingredients[0]).toEqual({ name: greekRecipe.ingredients[0].name, quantity: "1 ½", unit: "φλιτζάνι", notes: "κοσκινισμένο", ingredientType: null });
    expect(mocks.extract).toHaveBeenCalledTimes(1);
  });
  it("includes saved equivalents only for clients requesting conversionVersion 1", async () => {
    const recipe = toRecipeContent(greekRecipe);
    recipe.ingredients[0].savedMeasurements = normalizeEquivalentPair({ form: "solid", metric: { amount: 200, unit: "g" }, cups: { amount: 1.5, unit: "cup" }, assumptions: "Sifted flour estimate" }, recipe.ingredients[0], "deepseek-flash");
    mocks.extract.mockResolvedValue({ recipe, warnings: [] });
    const response = await POST(upload(`Bearer ${code}`, 1));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ recipe, warnings: [] });
    expect(mocks.extract).toHaveBeenCalledExactlyOnceWith(images, expect.any(AbortSignal), { categories: [], tags: [] }, 1);
  });
});
