import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
type WorkerEvent = { request?: Request; data?: { type: string }; waitUntil?: (promise: Promise<unknown>) => void; respondWith?: (promise: Promise<Response>) => void };
function worker() {
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const stored = new Map<string, Response>();
  const cache = { addAll: vi.fn().mockResolvedValue(undefined), put: vi.fn(async (key: string, value: Response) => { stored.set(key, value); }), match: vi.fn(async (key: string) => stored.get(key)?.clone()) };
  const caches = { open: vi.fn().mockResolvedValue(cache), keys: vi.fn().mockResolvedValue(["recipe-tracker-old", "recipe-tracker-test", "another-app"]), delete: vi.fn().mockResolvedValue(true) };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('<html><script src="/_next/static/app.js"></script><link href="/_next/static/style.css" /></html>'));
  const skipWaiting = vi.fn().mockResolvedValue(undefined);
  const claim = vi.fn().mockResolvedValue(undefined);
  runInNewContext(readFileSync("scripts/service-worker.js", "utf8").replace("__VERSION__", "test"), {
    self: { location: { origin: "https://recipe.test" }, addEventListener: (name: string, handler: (event: WorkerEvent) => void) => handlers.set(name, handler), skipWaiting, clients: { claim } },
    caches, fetch: fetcher, Request: class extends Request { constructor(input: string, init?: RequestInit) { super(new URL(input, "https://recipe.test"), init); } }, Response, URL,
  });
  return { handlers, cache, caches, fetcher, skipWaiting, claim };
}
async function lifecycle(handler: (event: WorkerEvent) => void) {
  let work: Promise<unknown> = Promise.resolve();
  handler({ waitUntil: (promise) => { work = promise; } });
  await work;
}
describe("versioned offline shell", () => {
  it("precaches shell JS, CSS, manifest and icons without activating early", async () => {
    const service = worker();
    await lifecycle(service.handlers.get("install")!);
    expect(service.cache.addAll.mock.calls[0][0]).toContain("/_next/static/app.js");
    expect(service.cache.addAll.mock.calls[0][0]).toContain("/_next/static/style.css");
    expect(service.cache.addAll.mock.calls[0][0]).toContain("/manifest.webmanifest");
    expect(service.cache.put).toHaveBeenCalledWith("/", expect.any(Response));
    expect(service.skipWaiting).not.toHaveBeenCalled();
    service.handlers.get("message")!({ data: { type: "ACTIVATE" } });
    expect(service.skipWaiting).toHaveBeenCalledOnce();
  });
  it("never intercepts paid API requests, POSTs, or third-party resources", () => {
    const service = worker(); const respondWith = vi.fn();
    for (const request of [new Request("https://recipe.test/api/extract"), new Request("https://recipe.test/", { method: "POST" }), new Request("https://other.test/_next/static/app.js")]) service.handlers.get("fetch")!({ request, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  });
  it("cleans only old Recipe Tracker shell caches on activation", async () => {
    const service = worker();
    await lifecycle(service.handlers.get("activate")!);
    expect(service.caches.delete).toHaveBeenCalledExactlyOnceWith("recipe-tracker-old");
    expect(service.claim).toHaveBeenCalledOnce();
  });
  it("fails installation if the complete shell cannot be cached", async () => {
    const service = worker(); service.cache.addAll.mockRejectedValue(new Error("missing chunk"));
    await expect(lifecycle(service.handlers.get("install")!)).rejects.toThrow("missing chunk");
    expect(service.cache.put).not.toHaveBeenCalled();
  });
});
