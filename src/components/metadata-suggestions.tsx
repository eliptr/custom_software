"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { collectionVocabulary } from "@/lib/taxonomy";
import { METADATA_FIELDS, errorMessage, metadataSchema, recipeContentSchema, type Metadata, type MetadataField, type RecipeContent } from "@/lib/recipe";
import { METADATA_LABELS, temperatureText } from "@/lib/metadata";
import { Button } from "./ui/button";
function display(metadata: Metadata, field: MetadataField) {
  if (field === "cookingTemperatures") return metadata.cookingTemperatures.map(temperatureText).join("; ") || "Not set";
  const value = metadata[field];
  return value === null || value === "" ? "Not set" : Array.isArray(value) ? value.join(", ") || "None" : String(value) + (field === "prepTime" || field === "cookTime" ? " min" : "");
}
type Props = { content: RecipeContent; token: string; onTokenChange: (value: string) => void; online: boolean; onAccept: (field: MetadataField, metadata: Metadata) => void; onBusyChange: (busy: boolean) => void };
export function MetadataSuggestions({ content, token, onTokenChange, online, onAccept, onBusyChange }: Props) {
  const [suggestions, setSuggestions] = useState<Metadata | null>(null);
  const [dismissed, setDismissed] = useState<MetadataField[]>([]);
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
      const vocabulary = collectionVocabulary(await db.recipes.toArray());
      const response = await fetch("/api/estimate", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ recipe, vocabulary }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90000)]) });
      const data = await response.json().catch(() => ({ error: "Metadata estimation could not finish. Please retry." }));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Metadata estimation failed.");
      if (controller.signal.aborted) return;
      const result = metadataSchema.parse(data);
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
  </section>;
}
