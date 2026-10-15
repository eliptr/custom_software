import { z } from "zod";

export const conventionSchema = z.enum(["us", "metric-250", "metric-240", "australian", "unknown"]);
export const numberFormatSchema = z.enum(["auto", "en-US", "el-GR"]);
export const measurementContextSchema = z.object({
  convention: conventionSchema.default("us"),
  conventionSource: z.enum(["assumed", "user", "legacy", "extracted"]).default("assumed"),
  numberFormat: numberFormatSchema.default("auto"),
}).strict().default({ convention: "us", conventionSource: "assumed", numberFormat: "auto" });
export const identityContextSchema = z.object({
  name: z.string().max(300), notes: z.string().max(1000).nullable(), unit: z.string().max(100).nullable(),
  convention: conventionSchema, numberFormat: numberFormatSchema,
}).strict();
export const ingredientIdentitySchema = z.object({
  profileId: z.string().min(1).max(100), source: z.enum(["local", "ai", "user", "legacy"]),
  catalogVersion: z.string().max(100), context: identityContextSchema,
  assumptionsConfirmed: z.boolean().default(false),
}).strict().nullable().default(null);
export type IdentityContext = z.infer<typeof identityContextSchema>;
export type IngredientIdentity = NonNullable<z.infer<typeof ingredientIdentitySchema>>;
export type MeasurementContext = z.infer<typeof measurementContextSchema>;
