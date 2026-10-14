import { describe, expect, it, vi } from "vitest";
import { type checkRateLimit } from "@vercel/firewall";
import { authorize, consumeRateLimit, EXTRACTION_RATE_LIMIT_ID, readLimitedJson, validateImages } from "../../src/lib/server/security";
describe("extraction access and limits", () => {
  const token = "test-token-" + "a".repeat(32);
  const request = new Request("https://recipe.test/api/extract", { headers: {
    Authorization: `Bearer ${token}`, Cookie: "private-cookie=secret", "x-real-ip": "192.0.2.1",
  } });
  it("rejects unconfigured, unauthorized, and cross-origin requests", () => {
    const request = new Request("https://recipe.test/api/extract", { headers: { Authorization: `Bearer ${token}` } });
    expect(authorize(request, token)).toBe(token);
    expect(() => authorize(request, undefined)).toThrow();
    expect(() => authorize(request, token + "wrong")).toThrow();
    expect(() => authorize(new Request(request, { headers: { Origin: "https://other.test", Authorization: `Bearer ${token}` } }), token)).toThrow();
  });
  it.each(["1", "1234", "my-kitchen"])("accepts a matching private code without a minimum length (%s)", (code) => {
    const shortRequest = new Request("https://recipe.test/api/extract", { headers: { Authorization: `Bearer ${code}` } });
    expect(authorize(shortRequest, code)).toBe(code);
    expect(() => authorize(shortRequest, code + "wrong")).toThrow();
  });
  it.each(["", " ", "REPLACE_ME"])("keeps empty and placeholder configuration disabled", (code) => {
    expect(() => authorize(request, code)).toThrow("not configured");
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
  it("limits local requests without calling Vercel and resets at the next window", async () => {
    const key = crypto.randomUUID();
    const checker = vi.fn<typeof checkRateLimit>();
    for (let i = 0; i < 10; i++) await consumeRateLimit(key, request, { NODE_ENV: "test" }, checker, 1000);
    await expect(consumeRateLimit(key, request, { NODE_ENV: "test" }, checker, 1000)).rejects.toMatchObject({ status: 429, retryAfter: 599 });
    await expect(consumeRateLimit(key, request, { NODE_ENV: "test" }, checker, 600000)).resolves.toBeUndefined();
    expect(checker).not.toHaveBeenCalled();
  });
  it("fails closed in production outside Vercel instead of using a process-local quota", async () => {
    const checker = vi.fn<typeof checkRateLimit>();
    await expect(consumeRateLimit(token, request, { NODE_ENV: "production" }, checker)).rejects.toMatchObject({ status: 503 });
    expect(checker).not.toHaveBeenCalled();
  });
  const env: NodeJS.ProcessEnv = { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview" };
  it("uses one shared hashed app-code bucket across IPs, without forwarding credentials", async () => {
    const checker = vi.fn<typeof checkRateLimit>().mockResolvedValue({ rateLimited: false });
    await consumeRateLimit(token, request, env, checker);
    await consumeRateLimit(token, new Request(request, { headers: { "x-real-ip": "192.0.2.2" } }), env, checker);
    expect(checker.mock.calls[0][0]).toBe(EXTRACTION_RATE_LIMIT_ID);
    const options = checker.mock.calls[0][1]!;
    expect(options.rateLimitKey).toBe(checker.mock.calls[1][1]!.rateLimitKey);
    expect(options.rateLimitKey).not.toContain(token);
    expect(options.timeout).toBe(3000);
    expect(options.headers).toBeInstanceOf(Headers);
    const headers = options.headers as Headers;
    expect(headers.get("host")).toBe("recipe.test");
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("x-real-ip")).toBe("192.0.2.1");
    await consumeRateLimit(token, request, { ...env, VERCEL_ENV: "production" }, checker);
    expect(checker.mock.calls[2][1]!.rateLimitKey).not.toBe(options.rateLimitKey);
  });
  it("returns a retry delay when Vercel reports an exhausted quota", async () => {
    const checker = vi.fn<typeof checkRateLimit>().mockResolvedValue({ rateLimited: true });
    await expect(consumeRateLimit(token, request, env, checker)).rejects.toMatchObject({ status: 429, retryAfter: 600 });
  });
  it.each([
    { rateLimited: false, error: "not-found" as const },
    { rateLimited: true, error: "blocked" as const },
  ])("blocks extraction if the firewall rule is missing or inaccessible ($error)", async (result) => {
    const checker = vi.fn<typeof checkRateLimit>().mockResolvedValue(result);
    await expect(consumeRateLimit(token, request, env, checker)).rejects.toMatchObject({ status: 503 });
  });
  it.each([new Error("offline"), new DOMException("timed out", "TimeoutError")])("blocks extraction when the rate-limit service fails", async (error) => {
    const checker = vi.fn<typeof checkRateLimit>().mockRejectedValue(error);
    await expect(consumeRateLimit(token, request, env, checker)).rejects.toMatchObject({ status: 503 });
  });
});
