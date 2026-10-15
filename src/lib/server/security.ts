import { createHash, timingSafeEqual } from "node:crypto";
import { checkRateLimit } from "@vercel/firewall";
import { z } from "zod";
import { type Screenshot } from "../ai/provider";
import { vocabularySchema } from "../taxonomy";

export const MAX_REQUEST_BYTES = 4_000_000;
export const MAX_IMAGE_BYTES = 2_800_000;
export class RequestError extends Error { constructor(message: string, public status = 400, public retryAfter?: number) { super(message); } }
const hash = (text: string) => createHash("sha256").update(text).digest();

export function authorize(request: Request, expected: string | undefined, allowedOrigin?: string): string {
  if (!expected?.trim() || expected === "REPLACE_ME") throw new RequestError("Screenshot extraction is not configured. Contact the app owner.", 503);
  const origin = request.headers.get("origin");
  if (origin && origin !== (allowedOrigin || new URL(request.url).origin)) throw new RequestError("This origin is not allowed.", 403);
  const auth = request.headers.get("authorization") || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!provided || !timingSafeEqual(hash(provided), hash(expected))) throw new RequestError("Enter the private app code to use screenshot extraction.", 401);
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
}).strict()).min(1).max(6), vocabulary: vocabularySchema.optional(), conversionVersion: z.union([z.literal(1), z.literal(3)]).optional() }).strict();

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
export const EXTRACTION_RATE_LIMIT_ID = "recipe-extraction";
export const EXTRACTION_WINDOW_SECONDS = 600;
const EXTRACTION_LIMIT = 10;

export async function consumeRateLimit(
  token: string,
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
  checker: typeof checkRateLimit = checkRateLimit,
  now = Date.now(),
): Promise<void> {
  const key = `recipe-tracker:${env.VERCEL_ENV || "production"}:${hash(token).toString("hex")}`;
  if (env.NODE_ENV === "production") {
    if (env.VERCEL !== "1") throw new RequestError("Screenshot extraction requires the Vercel rate limiter. Contact the app owner.", 503);
    try {
      // The SDK forwards supplied headers to the firewall. Keep the app code,
      // unrelated cookies, and other request data out of that internal request.
      const headers = new Headers({ host: new URL(request.url).host });
      for (const name of ["x-real-ip", "x-forwarded-for"]) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
      }
      const result = await checker(EXTRACTION_RATE_LIMIT_ID, {
        headers, rateLimitKey: key, timeout: 3000,
      });
      // The SDK reports a missing rule as rateLimited:false with an error.
      // Never let missing configuration silently enable an unlimited paid API.
      if (result.error === "not-found") throw new RequestError("Screenshot extraction is not configured. The app owner needs to enable its Vercel rate-limit rule.", 503);
      if (result.error) throw new RequestError("Extraction's rate limiter is unavailable. Contact the app owner.", 503);
      if (result.rateLimited) throw new RequestError("Extraction limit reached. Please try again in 10 minutes.", 429, EXTRACTION_WINDOW_SECONDS);
      return;
    } catch (error) {
      if (error instanceof RequestError) throw error;
      throw new RequestError("Extraction is temporarily unavailable because its rate limiter could not be reached.", 503);
    }
  }
  const windowMs = EXTRACTION_WINDOW_SECONDS * 1000;
  const windowKey = `${key}:${Math.floor(now / windowMs)}`;
  const expires = (Math.floor(now / windowMs) + 1) * windowMs;
  for (const [entry, value] of localWindows) if (value.expires <= now) localWindows.delete(entry);
  const state = localWindows.get(windowKey) || { count: 0, expires };
  state.count++;
  localWindows.set(windowKey, state);
  if (state.count > EXTRACTION_LIMIT) throw new RequestError("Extraction limit reached. Please try again later.", 429, Math.ceil((expires - now) / 1000));
}
