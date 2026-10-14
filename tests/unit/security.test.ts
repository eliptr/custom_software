import { describe, expect, it, vi } from "vitest";
import { authorize, consumeRateLimit, readLimitedJson, validateImages } from "../../src/lib/server/security";
describe("extraction access and limits", () => {
  const token = "test-token-" + "a".repeat(32);
  it("rejects unconfigured, unauthorized, and cross-origin requests", () => {
    const request = new Request("https://recipe.test/api/extract", { headers: { Authorization: `Bearer ${token}` } });
    expect(authorize(request, token)).toBe(token);
    expect(() => authorize(request, undefined)).toThrow();
    expect(() => authorize(request, token + "wrong")).toThrow();
    expect(() => authorize(new Request(request, { headers: { Origin: "https://other.test", Authorization: `Bearer ${token}` } }), token)).toThrow();
  });
  it("rejects declared and actual oversized bodies and invalid JSON", async () => {
    await expect(readLimitedJson(new Request("https://recipe.test", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": "4000001" }, body: "{}" }))).rejects.toMatchObject({ status: 413 });
    await expect(readLimitedJson(new Request("https://recipe.test", { method: "POST", headers: { "Content-Type": "application/json" }, body: " ".repeat(4_000_001) }))).rejects.toMatchObject({ status: 413 });
    await expect(readLimitedJson(new Request("https://recipe.test", { method: "POST", headers: { "Content-Type": "application/json" }, body: "broken" }))).rejects.toThrow("valid JSON");
  });
  it("checks MIME signatures, image count, and duplicates", () => {
    const image = { mimeType: "image/png", data: Buffer.from([137,80,78,71,13,10,26,10]).toString("base64") };
    expect(validateImages({ images: [image, image] })).toHaveLength(1);
    expect(() => validateImages({ images: [] })).toThrow();
    expect(() => validateImages({ images: [{ ...image, mimeType: "image/jpeg" }] })).toThrow();
  });
  it("limits local requests and fails closed in production", async () => {
    const key = crypto.randomUUID();
    for (let i = 0; i < 10; i++) await consumeRateLimit(key, { NODE_ENV: "test" });
    await expect(consumeRateLimit(key, { NODE_ENV: "test" })).rejects.toMatchObject({ status: 429 });
    await expect(consumeRateLimit(key, { NODE_ENV: "production" })).rejects.toMatchObject({ status: 503 });
  });
  it("enforces distributed quotas and limiter failures", async () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: "production", UPSTASH_REDIS_REST_URL: "https://limiter.test", UPSTASH_REDIS_REST_TOKEN: "test" };
    await expect(consumeRateLimit(token, env, vi.fn<typeof fetch>().mockResolvedValue(Response.json({ result: 11 })))).rejects.toMatchObject({ status: 429 });
    await expect(consumeRateLimit(token, env, vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")))).rejects.toMatchObject({ status: 503 });
  });
});
