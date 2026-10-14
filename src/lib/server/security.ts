import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { type Screenshot } from "../ai/provider";

export const MAX_REQUEST_BYTES = 4_000_000;
export const MAX_IMAGE_BYTES = 2_800_000;
export class RequestError extends Error { constructor(message: string, public status = 400, public retryAfter?: number) { super(message); } }
const hash = (text: string) => createHash("sha256").update(text).digest();

export function authorize(request: Request, expected: string | undefined, allowedOrigin?: string): string {
  if (!expected || expected.length < 32) throw new RequestError("Screenshot extraction is not configured. Contact the app owner.", 503);
  const origin = request.headers.get("origin");
  if (origin && origin !== (allowedOrigin || new URL(request.url).origin)) throw new RequestError("This origin is not allowed.", 403);
  const auth = request.headers.get("authorization") || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!provided || !timingSafeEqual(hash(provided), hash(expected))) throw new RequestError("Enter the app access token to use screenshot extraction.", 401);
  return provided;
}

export async function readLimitedJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new RequestError("Expected a JSON upload.", 415);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_REQUEST_BYTES) throw new RequestError("Screenshots are too large. Try fewer images.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("No screenshots were provided.");
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new RequestError("Screenshots are too large. Try fewer images.", 413);
      }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new RequestError("The upload is not valid JSON."); }
}

const uploadSchema = z.object({ images: z.array(z.object({
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  data: z.string().min(8).max(MAX_REQUEST_BYTES).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
}).strict()).min(1).max(6) }).strict();

export function validateImages(input: unknown): Screenshot[] {
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) throw new RequestError("Choose 1–6 valid JPEG, PNG, or WebP screenshots.");
  let total = 0;
  for (const image of parsed.data.images) {
    const bytes = Buffer.from(image.data, "base64");
    total += bytes.length;
    const valid = image.mimeType === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff : image.mimeType === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    if (!valid) throw new RequestError("An image does not match its declared format.");
    if (bytes.length > 1_500_000 || total > MAX_IMAGE_BYTES) throw new RequestError("Screenshots are too large. Try fewer images.", 413);
  }
  return [...new Map(parsed.data.images.map((image) => [image.data, image])).values()];
}

const localWindows = new Map<string, { count: number; expires: number }>();
export async function consumeRateLimit(token: string, env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch, now = Date.now()): Promise<void> {
  const windowMs = 3600000;
  const limit = 10;
  const key = `recipe-tracker:quota:${hash(token).toString("hex").slice(0, 24)}:${Math.floor(now / windowMs)}`;
  const retryAfter = Math.ceil((windowMs - now % windowMs) / 1000);
  const url = env.UPSTASH_REDIS_REST_URL;
  const accessToken = env.UPSTASH_REDIS_REST_TOKEN;
  if (url && accessToken) {
    try {
      if (!url.startsWith("https://")) throw new Error("Invalid limiter URL");
      const response = await fetcher(url.replace(/\/$/, ""), {
        method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(["EVAL", "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n", "1", key, "3600"]),
        signal: AbortSignal.timeout(5000), cache: "no-store",
      });
      if (!response.ok) throw new Error("Limiter failed");
      const result = z.object({ result: z.number().int().positive() }).parse(await response.json());
      if (result.result > limit) throw new RequestError("Hourly extraction limit reached. Please try again later.", 429, retryAfter);
      return;
    } catch (error) {
      if (error instanceof RequestError) throw error;
      throw new RequestError("Extraction is temporarily unavailable because its rate limiter could not be reached.", 503);
    }
  }
  if (env.NODE_ENV === "production") throw new RequestError("Extraction requires a shared production rate limiter. Contact the app owner.", 503);
  for (const [entry, value] of localWindows) if (value.expires <= now) localWindows.delete(entry);
  const state = localWindows.get(key) || { count: 0, expires: now + windowMs };
  state.count++;
  localWindows.set(key, state);
  if (state.count > limit) throw new RequestError("Hourly extraction limit reached. Please try again later.", 429, retryAfter);
}
