"use client";
import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, ArrowLeft, Plus, Trash2, Save, AlertCircle } from "lucide-react";
import { type RecipeContent, type Extraction, ingredientSchema, applyMetadataSuggestion, errorMessage, recipeContentSchema, METADATA_FIELDS } from "@/lib/recipe";
import { applyEquivalentSuggestion } from "@/lib/conversion/equivalent-suggestions";
import { IngredientConversionOptions } from "./ingredient-conversion-options";
import { METADATA_LABELS } from "@/lib/metadata";
import { Button } from "./ui/button";
import { MetadataSuggestions } from "./metadata-suggestions";

type Props = { initial: RecipeContent; warnings?: Extraction["warnings"]; editing: boolean; busy: boolean; onSave: (content: RecipeContent, revisionDescription?: string) => Promise<void>; onCancel: (dirty: boolean) => void; token: string; onTokenChange: (value: string) => void; online: boolean };
export function RecipeEditor({ initial, warnings = [], editing, busy, onSave, onCancel, token, onTokenChange, online }: Props) {
  const [content, setContent] = useState<RecipeContent>(initial);
  const [rowIds, setRowIds] = useState(() => initial.ingredients.map(() => crypto.randomUUID()));
  const [error, setError] = useState("");
  const [tag, setTag] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [newRevision, setNewRevision] = useState(false);
  const [revisionDescription, setRevisionDescription] = useState("");
  const dirty = JSON.stringify(content) !== JSON.stringify(initial) || newRevision;
  const update = <K extends keyof RecipeContent>(key: K, value: RecipeContent[K]) => setContent((previous) => ({ ...previous, [key]: value, metadataSources: METADATA_FIELDS.includes(key as typeof METADATA_FIELDS[number]) ? { ...previous.metadataSources, [key]: "user" } : previous.metadataSources }));
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    try {
      if (!content.title.trim()) throw new Error("Give your recipe a title before saving.");
      if (estimating) throw new Error("Wait for metadata suggestions before saving.");
      await onSave(recipeContentSchema.parse(content), newRevision ? revisionDescription : undefined);
    } catch (cause) { setError(errorMessage(cause)); }
  }
  function moveStep(index: number, direction: number) {
    const steps = [...content.instructions];
    [steps[index], steps[index + direction]] = [steps[index + direction], steps[index]];
    update("instructions", steps);
  }
  function moveIngredient(index: number, direction: number) {
    const ingredients = [...content.ingredients], ids = [...rowIds];
    [ingredients[index], ingredients[index + direction]] = [ingredients[index + direction], ingredients[index]];
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    setRowIds(ids); update("ingredients", ingredients);
  }
  return <form className="editor" onSubmit={submit}>
    <button type="button" className="back-link" onClick={() => onCancel(dirty)}><ArrowLeft size={18} /> Back to collection</button>
    <div className="page-heading"><p className="eyebrow">{editing ? "MAKE IT YOURS" : warnings.length ? "REVIEW YOUR RECIPE" : "FROM YOUR KITCHEN"}</p><h1>{editing ? "Edit recipe" : "A new favorite"}</h1><p className="muted">{warnings.length ? "Check the extracted details, then save it to your collection." : "A few ingredients. A few steps. Something worth keeping."}</p></div>
    {warnings.length > 0 && <section className="notice" aria-label="Extraction uncertainties"><AlertCircle size={20} /><div><strong>A few things to check</strong><ul>{warnings.map((warning, index) => <li key={index}>{warning.message}</li>)}</ul></div></section>}
    <div className="tag-list" aria-label="Metadata sources">{METADATA_FIELDS.filter(field => ["estimated", "extracted"].includes(content.metadataSources[field] || "")).map(field => <span className="tag" key={field}>{METADATA_LABELS[field]}: {content.metadataSources[field] === "estimated" ? "AI estimate" : "extracted"}</span>)}</div>
    {error && <p className="error-message" role="alert">{error}</p>}
    <section className="form-section"><label className="field-label" htmlFor="recipe-title">Recipe title <span className="muted">(required)</span></label><input id="recipe-title" required maxLength={300} placeholder="What are we cooking?" value={content.title} onChange={(event) => update("title", event.target.value)} />
      <label className="field-label" htmlFor="recipe-description">A little about it <span className="muted">(optional)</span></label><textarea id="recipe-description" rows={2} maxLength={3000} placeholder="A family favorite, a weeknight go-to…" value={content.description ?? ""} onChange={(event) => update("description", event.target.value || null)} /></section>
    <section className="form-section"><div className="section-heading"><h2>Ingredients</h2><span className="count-label">{content.ingredients.length} items</span></div>
      <div className="ingredient-editor-list">{content.ingredients.map((ingredient, index) => <div className="ingredient-editor" key={rowIds[index]}>
        <div className="ingredient-top"><label className="sr-only" htmlFor={`ingredient-${index}`}>Ingredient {index + 1} name</label><input id={`ingredient-${index}`} required maxLength={300} placeholder="Ingredient name" value={ingredient.name} onChange={(event) => update("ingredients", content.ingredients.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /><button type="button" className="icon-button" aria-label={`Remove ingredient ${index + 1}`} onClick={() => { setRowIds(rowIds.filter((_, i) => i !== index)); update("ingredients", content.ingredients.filter((_, i) => i !== index)); }}><Trash2 size={18} /></button></div>
        <div className="ingredient-amount"><label>Quantity<input maxLength={100} placeholder="e.g. 1 ½" value={ingredient.quantity ?? ""} onChange={(event) => update("ingredients", content.ingredients.map((item, i) => i === index ? { ...item, quantity: event.target.value || null } : item))} /></label><label>Unit<input maxLength={100} placeholder="e.g. cups" value={ingredient.unit ?? ""} onChange={(event) => update("ingredients", content.ingredients.map((item, i) => i === index ? { ...item, unit: event.target.value || null } : item))} /></label></div>
        {warnings.some((warning) => warning.field === `ingredients.${index}.quantity`) && <small className="muted">Quantity needs review. Unknown amounts can stay blank.</small>}
        <label className="ingredient-notes">Notes <span className="muted">(optional)</span><input maxLength={1000} placeholder="Chopped, sifted, divided…" value={ingredient.notes ?? ""} onChange={(event) => update("ingredients", content.ingredients.map((item, i) => i === index ? { ...item, notes: event.target.value || null } : item))} /></label>
        <div className="step-actions"><button type="button" className="icon-button" disabled={index === 0} aria-label={`Move ingredient ${index + 1} up`} onClick={() => moveIngredient(index, -1)}><ArrowUp size={17} /></button><button type="button" className="icon-button" disabled={index === content.ingredients.length - 1} aria-label={`Move ingredient ${index + 1} down`} onClick={() => moveIngredient(index, 1)}><ArrowDown size={17} /></button></div>
        <IngredientConversionOptions ingredient={ingredient} index={index} onChange={value => update("ingredients", content.ingredients.map((item, i) => i === index ? value : item))} />
      </div>)}</div>
      <Button type="button" variant="secondary" onClick={() => { setRowIds([...rowIds, crypto.randomUUID()]); update("ingredients", [...content.ingredients, { ...ingredientSchema.parse({ name: "New ingredient", quantity: null, unit: null, notes: null }), name: "" }]); }}><Plus size={17} /> Add ingredient</Button>
    </section>
    <section className="form-section"><div className="section-heading"><h2>Method</h2><span className="count-label">{content.instructions.length} steps</span></div>
      <div className="step-editor-list">{content.instructions.map((step, index) => <div className="step-editor" key={index}><span className="step-number">{String(index + 1).padStart(2, "0")}</span><div className="step-body"><label className="sr-only" htmlFor={`step-${index}`}>Step {index + 1}</label><textarea id={`step-${index}`} required maxLength={3000} rows={3} placeholder="Keep it simple. Include times and temperatures." value={step} onChange={(event) => update("instructions", content.instructions.map((item, i) => i === index ? event.target.value : item))} /><div className="step-actions"><button type="button" className="icon-button" disabled={index === 0} aria-label={`Move step ${index + 1} up`} onClick={() => moveStep(index, -1)}><ArrowUp size={17} /></button><button type="button" className="icon-button" disabled={index === content.instructions.length - 1} aria-label={`Move step ${index + 1} down`} onClick={() => moveStep(index, 1)}><ArrowDown size={17} /></button><button type="button" className="icon-button" aria-label={`Remove step ${index + 1}`} onClick={() => update("instructions", content.instructions.filter((_, i) => i !== index))}><Trash2 size={17} /></button></div></div></div>)}</div>
      <Button type="button" variant="secondary" onClick={() => update("instructions", [...content.instructions, ""])}><Plus size={17} /> Add step</Button>
    </section>
    <section className="form-section"><div className="section-heading"><h2>Cooking temperatures</h2></div>{content.cookingTemperatures.map((temperature, index) => <div className="temperature-editor" key={index}><label>Temperature {index + 1} (°C)<input type="number" min={0} max={500} step="any" value={temperature.celsius} onChange={event => update("cookingTemperatures", content.cookingTemperatures.map((item, i) => i === index ? { ...item, celsius: Number(event.target.value), source: "user" } : item))} /></label><label>Cooking method {index + 1}<input required maxLength={100} placeholder="e.g. oven, frying oil" value={temperature.method} onChange={event => update("cookingTemperatures", content.cookingTemperatures.map((item, i) => i === index ? { ...item, method: event.target.value, source: "user" } : item))} /></label><button type="button" className="icon-button" aria-label={`Remove temperature ${index + 1}`} onClick={() => update("cookingTemperatures", content.cookingTemperatures.filter((_, i) => i !== index))}><Trash2 size={18} /></button></div>)}<Button type="button" variant="secondary" disabled={content.cookingTemperatures.length >= 10} onClick={() => update("cookingTemperatures", [...content.cookingTemperatures, { celsius: 180, method: "oven", source: "user" }])}><Plus size={17} /> Add temperature</Button></section>
    <section className="form-section"><h2>The details <span className="muted detail-optional">optional</span></h2><div className="metadata-grid">
      <label>Preparation (minutes)<input type="number" min={0} max={10080} value={content.prepTime ?? ""} onChange={(event) => update("prepTime", event.target.value === "" ? null : Number(event.target.value))} /></label>
      <label>Cooking (minutes)<input type="number" min={0} max={10080} value={content.cookTime ?? ""} onChange={(event) => update("cookTime", event.target.value === "" ? null : Number(event.target.value))} /></label>
      <label>Servings<input type="number" min={0.1} max={1000} step="any" value={content.servings ?? ""} onChange={(event) => update("servings", event.target.value === "" ? null : Number(event.target.value))} /></label>
      <label>Category<input maxLength={200} placeholder="e.g. Weeknight dinners" value={content.category ?? ""} onChange={(event) => update("category", event.target.value || null)} /></label>
    </div><label className="field-label" htmlFor="tag-input">Tags</label><div className="tag-input"><input id="tag-input" maxLength={100} placeholder="Add a tag" value={tag} onChange={(event) => setTag(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (tag.trim() && !content.tags.includes(tag.trim())) update("tags", [...content.tags, tag.trim()]); setTag(""); } }} /><Button type="button" variant="secondary" onClick={() => { if (tag.trim() && !content.tags.includes(tag.trim())) update("tags", [...content.tags, tag.trim()]); setTag(""); }}>Add</Button></div><div className="tag-list">{content.tags.map((value, index) => <button type="button" className="tag" key={index} aria-label={`Remove tag ${value}`} onClick={() => update("tags", content.tags.filter((_, i) => i !== index))}>{value}<span aria-hidden> ×</span></button>)}</div></section>
    <MetadataSuggestions content={content} rowIds={rowIds} token={token} onTokenChange={onTokenChange} online={online} onBusyChange={setEstimating} onAccept={(field, suggestions) => setContent(previous => applyMetadataSuggestion(previous, suggestions, field))} onAcceptIngredient={binding => setContent(previous => ({ ...previous, ingredients: previous.ingredients.map((item, index) => rowIds[index] === binding.rowId ? applyEquivalentSuggestion(item, binding) : item) }))} />
    <section className="form-section"><label className="checkbox-label"><input type="checkbox" checked={newRevision} onChange={event => setNewRevision(event.target.checked)} /> Save as a new revision</label><p className="muted small">Keep an independent snapshot of these ingredients, steps, and metadata. Ordinary saves do not add history.</p>{newRevision && <label className="field-label">Revision description (optional)<input maxLength={1000} value={revisionDescription} onChange={event => setRevisionDescription(event.target.value)} placeholder="e.g. less sugar, longer baking" /></label>}</section>
    <div className="editor-footer"><Button type="button" variant="secondary" disabled={busy} onClick={() => onCancel(dirty)}>Cancel</Button><Button type="submit" disabled={busy || estimating}><Save size={18} />{busy ? "Saving…" : "Save recipe"}</Button></div>
  </form>;
}
