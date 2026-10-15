"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { collectionVocabulary } from "@/lib/taxonomy";
import { METADATA_FIELDS, errorMessage, recipeContentSchema, type Metadata, type MetadataField, type RecipeContent } from "@/lib/recipe";
import { createConversionRequest, equivalentEstimateResponseSchema, validateSavedSuggestions, canApplyEquivalent, type EquivalentBinding } from "@/lib/conversion/equivalent-suggestions";
import { effectiveMeasurements } from "@/lib/conversion/equivalents";
import { EquivalentPair } from "./equivalent-pair";
import { METADATA_LABELS, temperatureText } from "@/lib/metadata";
import { Button } from "./ui/button";
function display(metadata: Metadata, field: MetadataField) {
  if (field === "cookingTemperatures") return metadata.cookingTemperatures.map(temperatureText).join("; ") || "Not set";
  const value = metadata[field];
  return value === null || value === "" ? "Not set" : Array.isArray(value) ? value.join(", ") || "None" : String(value) + (field === "prepTime" || field === "cookTime" ? " min" : "");
}
type Props = { content: RecipeContent; rowIds: string[]; token: string; onTokenChange: (value: string) => void; online: boolean; onAccept: (field: MetadataField, metadata: Metadata) => void; onAcceptIngredient: (binding: EquivalentBinding) => void; onBusyChange: (busy: boolean) => void };
export function MetadataSuggestions({ content, rowIds, token, onTokenChange, online, onAccept, onAcceptIngredient, onBusyChange }: Props) {
  const [suggestions, setSuggestions] = useState<Metadata | null>(null);
  const [dismissed, setDismissed] = useState<MetadataField[]>([]);
  const [ingredientSuggestions, setIngredientSuggestions] = useState<EquivalentBinding[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  async function estimate() {
    if (loading) return;
    setError("");
    if (!online) { setError("Connect to the internet to request AI metadata. Local editing still works."); return; }
    if (!token.trim()) { setError("Enter the private app code to request metadata."); return; }
    const controller = new AbortController(); abort.current = controller;
    setLoading(true); onBusyChange(true);
    try {
      const recipe = recipeContentSchema.parse(content);
      const submittedRowIds = [...rowIds];
      const conversions = createConversionRequest(recipe.ingredients);
      const vocabulary = collectionVocabulary(await db.recipes.toArray());
      const response = await fetch("/api/estimate", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ recipe, vocabulary, conversionVersion: 1, conversions }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90000)]) });
      const data = await response.json().catch(() => ({ error: "Metadata estimation could not finish. Please retry." }));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Metadata estimation failed.");
      if (controller.signal.aborted) return;
      const envelope = equivalentEstimateResponseSchema.parse(data);
      if (envelope.requestId !== conversions.requestId) throw new Error("Suggestions belong to a different request. Please retry.");
      const result = envelope.metadata;
      const identities = validateSavedSuggestions(envelope.conversionSuggestions, conversions, recipe.ingredients);
      setIngredientSuggestions(identities.map(suggestion => {
        const target = conversions.targets.find(target => target.ref === suggestion.ref)!;
        return { rowId: submittedRowIds[target.index], submitted: recipe.ingredients[target.index], suggestion };
      }));
      // Validate again at the client boundary. The user owns this device-local vocabulary.
      result.category = vocabulary.categories.some(term => term.name === result.category) ? result.category : null;
      result.tags = result.tags.filter(tag => vocabulary.tags.some(term => term.name === tag));
      setSuggestions(result); setDismissed([]);
    } catch (cause) { if (!controller.signal.aborted) setError(errorMessage(cause)); }
    finally { if (!controller.signal.aborted) { setLoading(false); onBusyChange(false); } }
  }
  async function accept(field: MetadataField) {
    if (!suggestions) return;
    try {
      if (field === "category" || field === "tags") {
        const vocabulary = collectionVocabulary(await db.recipes.toArray());
        if (field === "category" && suggestions.category && !vocabulary.categories.some(term => term.name === suggestions.category) || field === "tags" && suggestions.tags.some(tag => !vocabulary.tags.some(term => term.name === tag))) throw new Error("That category or tag is no longer in the collection. Request fresh suggestions.");
      }
      onAccept(field, suggestions); setDismissed(previous => [...previous, field]);
    } catch (cause) { setError(errorMessage(cause)); }
  }
  const pending = suggestions ? METADATA_FIELDS.filter(field => !dismissed.includes(field) && JSON.stringify(content[field]) !== JSON.stringify(suggestions[field])) : [];
  return <section className="form-section metadata-suggestions"><h2>A second opinion</h2><p className="muted small">Suggest metadata from your current ingredients and steps. Nothing changes until you accept each field. Only saved categories and tags are eligible.</p>
    <label className="field-label" htmlFor="metadata-code">Private app code</label><input id="metadata-code" type="password" autoComplete="off" value={token} onChange={event => onTokenChange(event.target.value)} />
    <Button type="button" variant="secondary" disabled={loading || !online} onClick={() => void estimate()}><Sparkles size={17} />{loading ? "Estimating metadata…" : "Re-estimate metadata"}</Button>
    {!online && <p className="muted small">AI suggestions are unavailable offline.</p>}{loading && <p role="status" className="muted small">Your draft remains unchanged while suggestions are prepared.</p>}{error && <p role="alert" className="error-message">{error}</p>}
    {suggestions && <div aria-label="Metadata suggestions">{pending.length === 0 && <p className="muted small" role="status">No pending metadata changes.</p>}{pending.map(field => <article className="suggestion" key={field}><h3>{METADATA_LABELS[field]}</h3><p className="muted small">Current: {display(content, field)}</p><p>Suggested: {display(suggestions, field)} <small className="muted">({suggestions.metadataSources[field] || "unknown source"})</small></p><div className="inline-actions"><Button type="button" variant="secondary" onClick={() => void accept(field)} aria-label={`Accept ${METADATA_LABELS[field]}`}>Accept</Button><Button type="button" variant="ghost" onClick={() => setDismissed(previous => [...previous, field])} aria-label={`Reject ${METADATA_LABELS[field]}`}>Reject</Button></div></article>)}</div>}
    {suggestions && <div aria-label="Ingredient equivalent suggestions"><h3>Ingredient equivalents</h3><p className="muted small">Review each pair separately. Accepting metadata never changes ingredient measurements. Unavailable or invalid proposals leave saved pairs unchanged.</p>{ingredientSuggestions.length === 0 && <p className="muted small">No available ingredient proposals. Current saved equivalents are kept.</p>}{ingredientSuggestions.map(binding => {
      const index = rowIds.indexOf(binding.rowId), current = content.ingredients[index];
      const applicable = canApplyEquivalent(binding, current);
      return <article className="suggestion" key={binding.suggestion.ref}><h3>{binding.submitted.name}</h3><p className="muted small">For original: {[binding.submitted.quantity, binding.submitted.unit].filter(Boolean).join(" ") || "Unspecified"}</p><p>Current equivalents</p><EquivalentPair measurements={current ? effectiveMeasurements(current) : null} /><p>Proposed equivalents</p><EquivalentPair measurements={binding.suggestion.measurements} />{binding.suggestion.measurements.assumptions && <p className="muted small">{binding.suggestion.measurements.assumptions}</p>}{!applicable && <p className="muted small">Ingredient changed or was removed. Request fresh suggestions.</p>}<div className="inline-actions"><Button type="button" variant="secondary" disabled={!applicable} aria-label={`Accept equivalents ${binding.submitted.name}`} onClick={() => { onAcceptIngredient(binding); setIngredientSuggestions(items => items.filter(item => item !== binding)); }}>Accept pair</Button><Button type="button" variant="ghost" aria-label={`Reject equivalents ${binding.submitted.name}`} onClick={() => setIngredientSuggestions(items => items.filter(item => item !== binding))}>Reject</Button></div></article>;
    })}</div>}
  </section>;
}
