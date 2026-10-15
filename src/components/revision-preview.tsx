"use client";
import { useState } from "react";
import { type Revision } from "@/lib/recipe";
import { RecipeMetadata } from "./recipe-metadata";
import { Button } from "./ui/button";
export function RevisionPreview({ revision, onRestore }: { revision: Revision; onRestore: () => void }) {
  const [open, setOpen] = useState(false);
  const snapshot = revision.snapshot;
  return <details className="journal-entry" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{new Date(revision.createdAt).toLocaleString()} · {revision.description || "Recipe snapshot"}</summary>
    {open && <><h3>{snapshot.title}</h3><RecipeMetadata recipe={snapshot} />
      {snapshot.prepTime !== null && <p className="muted small">Preparation: {snapshot.prepTime} min</p>}
      {snapshot.description && <p className="preserve-lines">{snapshot.description}</p>}
      {snapshot.category && <p>Category: {snapshot.category}</p>}{snapshot.tags.length > 0 && <p>Tags: {snapshot.tags.join(", ")}</p>}
      <ul>{snapshot.ingredients.map((ingredient, index) => <li key={index}>{[ingredient.quantity, ingredient.unit, ingredient.name].filter(Boolean).join(" ")}{ingredient.notes ? ` (${ingredient.notes})` : ""}</li>)}</ul>
      <ol>{snapshot.instructions.map((step, index) => <li key={index} className="preserve-lines">{step}</li>)}</ol>
      <Button variant="secondary" onClick={onRestore}>Restore this revision</Button></>}
  </details>;
}
