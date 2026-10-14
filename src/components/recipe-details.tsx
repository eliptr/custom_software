"use client";
import { useState } from "react";
import { ArrowLeft, Clock3, Pencil, Trash2, Users } from "lucide-react";
import { type Recipe } from "@/lib/recipe";
import { Button } from "./ui/button";
export function RecipeDetails({ recipe, onBack, onEdit, onDelete }: { recipe: Recipe; onBack: () => void; onEdit: () => void; onDelete: () => void }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  return <article className="recipe-detail"><button className="back-link" onClick={onBack}><ArrowLeft size={18} /> All recipes</button>
    <div className="page-heading"><p className="eyebrow">{recipe.category || "FROM YOUR COLLECTION"}</p><h1>{recipe.title}</h1>{recipe.description && <p className="recipe-description">{recipe.description}</p>}</div>
    <div className="detail-meta">{recipe.prepTime !== null && <span><Clock3 size={17} />{recipe.prepTime} min prep</span>}{recipe.cookTime !== null && <span><Clock3 size={17} />{recipe.cookTime} min cook</span>}{recipe.servings !== null && <span><Users size={17} />Serves {recipe.servings}</span>}</div>
    {recipe.tags.length > 0 && <div className="tag-list">{recipe.tags.map((tag, index) => <span className="tag" key={index}>{tag}</span>)}</div>}
    <div className="detail-columns"><section className="ingredients-section"><div className="section-heading"><h2>Ingredients</h2><span className="count-label">{checked.size}/{recipe.ingredients.length}</span></div><p className="muted small">Tap to check things off as you cook.</p><ul className="cooking-ingredients">{recipe.ingredients.map((ingredient, index) => <li key={index}><label className={checked.has(index) ? "checked" : ""}><input type="checkbox" checked={checked.has(index)} onChange={(event) => { const next = new Set(checked); if (event.target.checked) next.add(index); else next.delete(index); setChecked(next); }} /><span><strong>{[ingredient.quantity, ingredient.unit, ingredient.name].filter(Boolean).join(" ")}</strong>{ingredient.notes && <small>{ingredient.notes}</small>}</span></label></li>)}</ul>{!recipe.ingredients.length && <p className="muted">No ingredients added yet.</p>}</section>
      <section className="method-section"><h2>Method</h2><ol className="cooking-steps">{recipe.instructions.map((step, index) => <li key={index}><span className="step-number" aria-hidden>{String(index + 1).padStart(2, "0")}</span><p>{step}</p></li>)}</ol>{!recipe.instructions.length && <p className="muted">No cooking steps added yet.</p>}</section></div>
    <div className="detail-footer"><Button variant="secondary" onClick={onEdit}><Pencil size={17} /> Edit recipe</Button><Button variant="ghost" onClick={onDelete}><Trash2 size={17} /> Delete</Button></div><p className="muted small">Saved {new Date(recipe.createdAt).toLocaleDateString()} · Updated {new Date(recipe.updatedAt).toLocaleDateString()}</p>
  </article>;
}
