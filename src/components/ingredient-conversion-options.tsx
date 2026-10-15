"use client";
import type { Ingredient } from "@/lib/recipe";
import { INGREDIENT_PROFILES } from "@/lib/conversion/catalog";
import { CONVENTIONS } from "@/lib/conversion/units";
import { makeIdentity, resolveIdentity } from "@/lib/conversion/identity";
import type { MeasurementContext } from "@/lib/conversion/schema";
export function IngredientConversionOptions({ ingredient, index, onChange }: { ingredient: Ingredient; index: number; onChange: (value: Ingredient) => void }) {
  const resolved = resolveIdentity(ingredient);
  const selected = ingredient.identity?.source === "user" ? ingredient.identity.profileId : "";
  function contextChange(context: Partial<MeasurementContext>) { onChange({ ...ingredient, measurementContext: { ...ingredient.measurementContext, ...context } }); }
  return <details className="conversion-options"><summary>Measurement conversion</summary>
    <p className="muted small">Original name, amount, unit, and notes are kept. Display conversions never change them.</p>
    <label className="checkbox-label"><input type="checkbox" checked={ingredient.conversionMode === "original"} onChange={event => onChange({ ...ingredient, conversionMode: event.target.checked ? "original" : "auto" })} />Keep original measurement {index + 1}</label>
    <label>Source cup/spoon convention {index + 1}<select value={ingredient.measurementContext.convention} onChange={event => contextChange({ convention: event.target.value as MeasurementContext["convention"], conventionSource: "user" })}>{Object.entries(CONVENTIONS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select></label>
    <p className="muted small">{ingredient.measurementContext.conventionSource === "assumed" || ingredient.measurementContext.conventionSource === "legacy" ? "US customary is assumed for older or unspecified recipes. Confirm the source convention if different." : "Source convention selected explicitly."} Display preference does not change the source convention.</p>
    <label>Number format {index + 1}<select value={ingredient.measurementContext.numberFormat} onChange={event => contextChange({ numberFormat: event.target.value as MeasurementContext["numberFormat"] })}><option value="auto">Conservative automatic parsing</option><option value="en-US">1,000.5 = one thousand and a half</option><option value="el-GR">1.000,5 = one thousand and a half</option></select></label>
    <label>Conversion ingredient {index + 1}<select value={selected} onChange={event => onChange({ ...ingredient, identity: event.target.value ? makeIdentity(ingredient, event.target.value, "user") : null })}><option value="">Match name locally first</option>{INGREDIENT_PROFILES.map(profile => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select></label>
    {selected && <><label className="checkbox-label"><input type="checkbox" checked={ingredient.identity?.assumptionsConfirmed ?? false} onChange={event => onChange({ ...ingredient, identity: makeIdentity(ingredient, selected, "user", event.target.checked) })} />I confirm this profile&apos;s preparation / packing assumptions</label><button type="button" className="back-link" onClick={() => onChange({ ...ingredient, identity: makeIdentity(ingredient, selected, "user", ingredient.identity?.assumptionsConfirmed) })}>Confirm profile for current ingredient text</button></>}
    <p className="muted small" role="status">{resolved.profile ? `${resolved.profile.label} · ${resolved.source}. ${resolved.profile.assumptions}` : resolved.reason}</p>
    {resolved.profile && <a className="muted small" href={resolved.profile.source} target="_blank" rel="noreferrer">Profile reference</a>}
  </details>;
}
