import { DeepSeekExtractor } from "@/lib/ai/deepseek";
import { authorize, consumeRateLimit, readLimitedJson, RequestError, validateImages } from "@/lib/server/security";
import { EMPTY_VOCABULARY, vocabularySchema } from "@/lib/taxonomy";
export const runtime = "nodejs";
export const maxDuration = 90;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const token = authorize(request, process.env.APP_ACCESS_TOKEN, process.env.APP_ORIGIN);
    if (!process.env.DEEPSEEK_API_KEY) throw new RequestError("The app owner has not configured the AI service key.", 503);
    const input = await readLimitedJson(request);
    const images = validateImages(input);
    const vocabulary = vocabularySchema.parse((input as { vocabulary?: unknown }).vocabulary || EMPTY_VOCABULARY);
    await consumeRateLimit(token, request);
    const provider = new DeepSeekExtractor(process.env.DEEPSEEK_API_KEY, process.env.DEEPSEEK_MODEL || "deepseek-flash");
    return Response.json(await provider.extract(images, request.signal, vocabulary), { headers });
  } catch (error) {
    if (error instanceof RequestError) return Response.json({ error: error.message }, { status: error.status, headers: { ...headers, ...(error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}) } });
    const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    return Response.json({ error: timedOut ? "Extraction timed out. Please retry with fewer screenshots." : error instanceof Error ? error.message : "Extraction failed. Please retry." }, { status: 502, headers });
  }
}
