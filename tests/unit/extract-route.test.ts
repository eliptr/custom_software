import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toRecipeContent } from "../../src/lib/recipe";
import { greekRecipe } from "../fixtures";

const mocks = vi.hoisted(() => ({ checkRateLimit: vi.fn(), extract: vi.fn() }));
vi.mock("@vercel/firewall", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("../../src/lib/ai/deepseek", () => ({ DeepSeekExtractor: class { extract = mocks.extract; } }));
import { POST } from "../../src/app/api/extract/route";

describe("extraction route protects paid provider calls", () => {
  const code = "1234";
  const images = [{ mimeType: "image/png", data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64") }];
  function upload(authorization = `Bearer ${code}`) {
    return new Request("https://recipe.test/api/extract", {
      method: "POST", headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ images }),
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
    expect(await response.json()).toEqual({ recipe: toRecipeContent(greekRecipe), warnings: [] });
    expect(mocks.extract).toHaveBeenCalledWith(images, expect.any(AbortSignal));
    expect(mocks.checkRateLimit.mock.invocationCallOrder[0]).toBeLessThan(mocks.extract.mock.invocationCallOrder[0]);
  });
});
