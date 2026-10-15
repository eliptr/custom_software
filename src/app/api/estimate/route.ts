import { z } from "zod";
import { DeepSeekExtractor } from "@/lib/ai/deepseek";
import { recipeContentSchema } from "@/lib/recipe";
import { vocabularySchema } from "@/lib/taxonomy";
import { identificationRequestSchema, validIdentificationRequest } from "@/lib/conversion/suggestions";
import { conversionRequestSchema, validConversionRequest } from "@/lib/conversion/equivalent-suggestions";
import { authorize, consumeRateLimit, readLimitedJson, RequestError } from "@/lib/server/security";
export const runtime = "nodejs";
export const maxDuration = 90;
export const dynamic = "force-dynamic";
const inputSchema = z.object({ recipe: recipeContentSchema, vocabulary: vocabularySchema, identification: identificationRequestSchema.optional(), conversionVersion: z.literal(1).optional(), conversions: conversionRequestSchema.optional() }).strict().refine(input => input.conversionVersion === 1 ? Boolean(input.conversions) && !input.identification : !input.conversions, "Conversion requests require conversionVersion: 1");
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const token = authorize(request, process.env.APP_ACCESS_TOKEN, process.env.APP_ORIGIN);
    if (!process.env.DEEPSEEK_API_KEY) throw new RequestError("The app owner has not configured the AI service key.", 503);
    const input = inputSchema.safeParse(await readLimitedJson(request));
    if (!input.success) throw new RequestError("The recipe or existing category/tag vocabulary is invalid. Check the draft before retrying.");
    if (input.data.identification && !validIdentificationRequest(input.data.identification, input.data.recipe.ingredients)) throw new RequestError("Ingredient identification context is invalid or stale. Request fresh suggestions.");
    if (input.data.conversions && !validConversionRequest(input.data.conversions, input.data.recipe.ingredients)) throw new RequestError("Ingredient conversion context is invalid or stale. Request fresh suggestions.");
    if (!input.data.recipe.ingredients.length && !input.data.recipe.instructions.length) throw new RequestError("Add ingredients or cooking instructions before requesting estimates.");
    await consumeRateLimit(token, request);
    const provider = new DeepSeekExtractor(process.env.DEEPSEEK_API_KEY, process.env.DEEPSEEK_MODEL || "deepseek-flash");
    if (input.data.conversionVersion === 1 && input.data.conversions) return Response.json(await provider.estimate(input.data.recipe, input.data.vocabulary, request.signal, undefined, input.data.conversions), { headers });
    const result = await provider.estimate(input.data.recipe, input.data.vocabulary, request.signal, input.data.identification);
    // Existing installed clients still receive the v2 metadata-only shape.
    return Response.json(input.data.identification ? result : result.metadata, { headers });
  } catch (error) {
    if (error instanceof RequestError) return Response.json({ error: error.message }, { status: error.status, headers: { ...headers, ...(error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}) } });
    const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    return Response.json({ error: timedOut ? "Metadata estimation timed out. Please retry." : error instanceof Error ? error.message : "Estimation failed. Please retry." }, { status: 502, headers });
  }
}
