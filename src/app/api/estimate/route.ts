import { z } from "zod";
import { DeepSeekExtractor } from "@/lib/ai/deepseek";
import { recipeContentSchema } from "@/lib/recipe";
import { vocabularySchema } from "@/lib/taxonomy";
import { authorize, consumeRateLimit, readLimitedJson, RequestError } from "@/lib/server/security";
export const runtime = "nodejs";
export const maxDuration = 90;
export const dynamic = "force-dynamic";
const inputSchema = z.object({ recipe: recipeContentSchema, vocabulary: vocabularySchema }).strict();
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const token = authorize(request, process.env.APP_ACCESS_TOKEN, process.env.APP_ORIGIN);
    if (!process.env.DEEPSEEK_API_KEY) throw new RequestError("The app owner has not configured the AI service key.", 503);
    const input = inputSchema.safeParse(await readLimitedJson(request));
    if (!input.success) throw new RequestError("The recipe or existing category/tag vocabulary is invalid. Check the draft before retrying.");
    if (!input.data.recipe.ingredients.length && !input.data.recipe.instructions.length) throw new RequestError("Add ingredients or cooking instructions before requesting estimates.");
    await consumeRateLimit(token, request);
    const provider = new DeepSeekExtractor(process.env.DEEPSEEK_API_KEY, process.env.DEEPSEEK_MODEL || "deepseek-flash");
    return Response.json(await provider.estimate(input.data.recipe, input.data.vocabulary, request.signal), { headers });
  } catch (error) {
    if (error instanceof RequestError) return Response.json({ error: error.message }, { status: error.status, headers: { ...headers, ...(error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}) } });
    const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    return Response.json({ error: timedOut ? "Metadata estimation timed out. Please retry." : error instanceof Error ? error.message : "Estimation failed. Please retry." }, { status: 502, headers });
  }
}
