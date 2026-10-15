"use client";
import { useState } from "react";
import { ArrowLeft, Clock3, Pencil, Trash2 } from "lucide-react";
import { type Recipe } from "@/lib/recipe";
import { convertIngredient, type MeasurementSystem } from "@/lib/measurements";
import { readMeasurementPreference, writeMeasurementPreference } from "@/lib/preferences";
import { Button } from "./ui/button";
import { RecipeMetadata } from "./recipe-metadata";
import { RecipeJournal } from "./recipe-journal";
export function RecipeDetails({ recipe, onBack, onEdit, onDelete }: { recipe: Recipe; onBack: () => void; onEdit: () => void; onDelete: () => void }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [system, setSystem] = useState<MeasurementSystem>(() => readMeasurementPreference());
  const [preferenceError, setPreferenceError] = useState(false);
  function changeSystem(value: MeasurementSystem) { setSystem(value); setPreferenceError(!writeMeasurementPreference(value)); }
  return <article className="recipe-detail"><button className="back-link" onClick={onBack}><ArrowLeft size={18} /> All recipes</button>
    <div className="page-heading"><p className="eyebrow">{recipe.category || "FROM YOUR COLLECTION"}</p><h1>{recipe.title}</h1>{recipe.description && <p className="recipe-description">{recipe.description}</p>}</div>
    <div className="detail-meta">{recipe.prepTime !== null && <span><Clock3 size={17} />{recipe.metadataSources.prepTime === "estimated" ? "≈ " : ""}{recipe.prepTime} min prep</span>}<RecipeMetadata recipe={recipe} /></div>
    {recipe.tags.length > 0 && <div className="tag-list">{recipe.tags.map((tag, index) => <span className="tag" key={index}>{tag}</span>)}</div>}
    <div className="detail-columns"><section className="ingredients-section"><div className="section-heading"><h2>Ingredients</h2><span className="count-label">{checked.size}/{recipe.ingredients.length}</span></div><div className="measurement-toggle" role="group" aria-label="Ingredient measurements"><Button variant="secondary" aria-pressed={system === "metric"} onClick={() => changeSystem("metric")}>Metric</Button><Button variant="secondary" aria-pressed={system === "cups"} onClick={() => changeSystem("cups")}>Cups / Spoons</Button></div><p className="muted small">US cups and spoons. Density conversions are approximate; original amounts are always kept. Tap ingredients to check them off.</p>{preferenceError && <p className="muted small" role="status">Your browser could not remember this preference. It still applies to this view.</p>}<ul className="cooking-ingredients">{recipe.ingredients.map((ingredient, index) => {
      const measurement = convertIngredient(ingredient, system);
      return <li key={index}><label className={checked.has(index) ? "checked" : ""}><input type="checkbox" checked={checked.has(index)} onChange={(event) => { const next = new Set(checked); if (event.target.checked) next.add(index); else next.delete(index); setChecked(next); }} /><span><strong>{measurement.approximate ? "≈ " : ""}{[measurement.quantity, measurement.unit, ingredient.name].filter(Boolean).join(" ")}</strong>{ingredient.notes && <small>{ingredient.notes}</small>}<small>Original: {[ingredient.quantity, ingredient.unit].filter(Boolean).join(" ") || "No amount specified"}</small>{measurement.reason && <small>{measurement.reason}</small>}{measurement.convention && <small>Source: {measurement.convention}</small>}</span></label></li>;
    })}</ul>{!recipe.ingredients.length && <p className="muted">No ingredients added yet.</p>}</section>
      <section className="method-section"><h2>Method</h2><ol className="cooking-steps">{recipe.instructions.map((step, index) => <li key={index}><span className="step-number" aria-hidden>{String(index + 1).padStart(2, "0")}</span><p>{step}</p></li>)}</ol>{!recipe.instructions.length && <p className="muted">No cooking steps added yet.</p>}</section></div>
    <RecipeJournal recipe={recipe} onRestored={() => setChecked(new Set())} /><div className="detail-footer"><Button variant="secondary" onClick={onEdit}><Pencil size={17} /> Edit recipe</Button><Button variant="ghost" onClick={onDelete}><Trash2 size={17} /> Delete</Button></div><p className="muted small">Saved {new Date(recipe.createdAt).toLocaleDateString()} · Updated {new Date(recipe.updatedAt).toLocaleDateString()}</p>
  </article>;
}
