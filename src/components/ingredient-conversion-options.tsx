"use client";
import type { Ingredient } from "@/lib/recipe";
import { CONVENTIONS } from "@/lib/conversion/units";
import { effectiveMeasurements } from "@/lib/conversion/equivalents";
import type { MeasurementContext } from "@/lib/conversion/schema";
import { EquivalentPair } from "./equivalent-pair";
export function IngredientConversionOptions({ ingredient, index, onChange }: { ingredient: Ingredient; index: number; onChange: (value: Ingredient) => void }) {
  const saved = ingredient.savedMeasurements, active = effectiveMeasurements(ingredient);
  function contextChange(context: Partial<MeasurementContext>) { onChange({ ...ingredient, measurementContext: { ...ingredient.measurementContext, ...context } }); }
  return <details className="conversion-options"><summary>Measurement conversion</summary>
    <p className="muted small">Original name, amount, unit, and notes are kept. Re-estimate metadata also suggests equivalents for every ingredient.</p>
    <EquivalentPair measurements={active} />
    {saved && <><p className="muted small">Accepted basis: {[saved.input.quantity, saved.input.unit, saved.input.name].filter(Boolean).join(" ")}. Quantity changes scale from this basis without rounding saved values.</p>{!active && <p role="status" className="muted small">Saved equivalents need refreshing because the input changed or is ambiguous.</p>}<p className="muted small">{saved.assumptions || "Practical cooking approximation; check against your ingredient and preparation."}</p><p className="muted small">Estimated {new Date(saved.estimatedAt).toLocaleString()} · {saved.model} · {saved.promptVersion}</p></>}
    <label className="checkbox-label"><input type="checkbox" checked={ingredient.conversionMode === "original"} onChange={event => onChange({ ...ingredient, conversionMode: event.target.checked ? "original" : "auto" })} />Keep original measurement {index + 1}</label>
    <label>Source cup/spoon convention {index + 1}<select value={ingredient.measurementContext.convention} onChange={event => contextChange({ convention: event.target.value as MeasurementContext["convention"], conventionSource: "user" })}>{Object.entries(CONVENTIONS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select></label>
    <p className="muted small">{ingredient.measurementContext.conventionSource === "assumed" || ingredient.measurementContext.conventionSource === "legacy" ? "US customary is assumed for unspecified recipes. Confirm a different source convention here." : "Source convention selected explicitly."} Cups / Spoons display always uses US measures.</p>
    <label>Number format {index + 1}<select value={ingredient.measurementContext.numberFormat} onChange={event => contextChange({ numberFormat: event.target.value as MeasurementContext["numberFormat"] })}><option value="auto">Conservative automatic parsing</option><option value="en-US">1,000.5 = one thousand and a half</option><option value="el-GR">1.000,5 = one thousand and a half</option></select></label>
  </details>;
}
