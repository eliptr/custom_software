import { z } from "zod";
import { measurementContextSchema } from "./schema";

export const EQUIVALENT_PROMPT_VERSION = "ingredient-equivalents/1";
const amount = z.number().finite().positive().max(1e9);
export const metricAmountSchema = z.object({ amount, unit: z.enum(["g", "kg", "ml", "L"]) }).strict();
export const cupsAmountSchema = z.object({ amount, unit: z.enum(["cup", "tbsp", "tsp"]) }).strict();
export const equivalentPairSchema = z.object({
  form: z.enum(["solid", "liquid"]),
  metric: metricAmountSchema.nullable(), cups: cupsAmountSchema.nullable(),
  assumptions: z.string().max(1000).nullable(),
}).strict();
export const equivalentInputSchema = z.object({
  name: z.string().max(300), quantity: z.string().max(100).nullable(), unit: z.string().max(100).nullable(),
  notes: z.string().max(1000).nullable(), measurementContext: measurementContextSchema,
}).strict();
export const savedMeasurementsSchema = equivalentPairSchema.extend({
  metric: metricAmountSchema.extend({ source: z.enum(["exact", "estimated"]) }).nullable(),
  cups: cupsAmountSchema.extend({ source: z.enum(["exact", "estimated"]) }).nullable(),
  input: equivalentInputSchema, inputFingerprint: z.string().regex(/^[a-f0-9]{16}$/),
  model: z.string().min(1).max(100), promptVersion: z.string().min(1).max(100),
  estimatedAt: z.iso.datetime({ offset: true }),
}).strict().refine(pair => pair.metric === null || (pair.form === "solid" ? ["g", "kg"].includes(pair.metric.unit) : ["ml", "L"].includes(pair.metric.unit)), "Metric units must match the ingredient form");
export type EquivalentInput = z.infer<typeof equivalentInputSchema>;
export type EquivalentPair = z.infer<typeof equivalentPairSchema>;
export type SavedMeasurements = z.infer<typeof savedMeasurementsSchema>;
