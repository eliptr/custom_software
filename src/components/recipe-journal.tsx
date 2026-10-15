"use client";
import { useState, type FormEvent } from "react";
import { deleteCookingNote, restoreRevision, saveCookingNote } from "@/lib/db";
import { errorMessage, type CookingNote, type Recipe } from "@/lib/recipe";
import { RevisionPreview } from "./revision-preview";
import { Button } from "./ui/button";
import { Modal } from "./ui/modal";
function today() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export function RecipeJournal({ recipe, onRestored }: { recipe: Recipe; onRestored: () => void }) {
  const [editing, setEditing] = useState<CookingNote | "new" | null>(null);
  const [body, setBody] = useState("");
  const [cookedOn, setCookedOn] = useState(today);
  const [rating, setRating] = useState("");
  const [pending, setPending] = useState<{ kind: "note" | "revision"; id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function edit(note?: CookingNote) { setEditing(note || "new"); setBody(note?.body || ""); setCookedOn(note?.cookedOn || today()); setRating(note?.rating?.toString() || ""); setError(""); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editing || busy) return;
    setBusy(true); setError("");
    try {
      const now = new Date(Math.max(Date.now(), editing === "new" ? 0 : Date.parse(editing.updatedAt))).toISOString();
      await saveCookingNote(recipe.id, { id: editing === "new" ? crypto.randomUUID() : editing.id, createdAt: editing === "new" ? now : editing.createdAt, updatedAt: now, body, cookedOn, rating: rating ? Number(rating) : null });
      setEditing(null);
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  async function confirm() {
    if (!pending || busy) return;
    setBusy(true); setError("");
    try { if (pending.kind === "note") await deleteCookingNote(recipe.id, pending.id); else { await restoreRevision(recipe.id, pending.id); onRestored(); } setPending(null); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  const notes = [...recipe.cookingNotes].sort((a, b) => b.cookedOn.localeCompare(a.cookedOn) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return <div className="recipe-journal">
    <section className="form-section"><div className="section-heading"><h2>Cooking Notes</h2><Button variant="secondary" onClick={() => edit()}>Add cooking note</Button></div><p className="muted small">Substitutions, adjustments, and observations. Newest attempts first.</p>
      {notes.length === 0 && <p className="muted small">Your next cooking attempt starts the story.</p>}
      {notes.map(note => <article className="journal-entry" key={note.id}><div className="section-heading"><time dateTime={note.cookedOn}>{note.cookedOn}</time>{note.rating !== null && <span aria-label={`Rating ${note.rating} out of 5`}>{note.rating}/5</span>}</div><p className="preserve-lines">{note.body}</p><div className="inline-actions"><Button variant="ghost" onClick={() => edit(note)} aria-label={`Edit cooking note ${note.cookedOn}`}>Edit note</Button><Button variant="ghost" onClick={() => { setError(""); setPending({ kind: "note", id: note.id }); }} aria-label={`Delete cooking note ${note.cookedOn}`}>Delete note</Button></div></article>)}
    </section>
    <section className="form-section"><h2>Recipe revisions</h2><p className="muted small">Use “Save as a new revision” in the editor to keep a snapshot. Cooking notes do not create revisions.</p>{recipe.revisions.length === 0 && <p className="muted small">No revisions saved yet.</p>}
      {[...recipe.revisions].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map(revision => <RevisionPreview key={revision.id} revision={revision} onRestore={() => { setError(""); setPending({ kind: "revision", id: revision.id }); }} />)}
    </section>
    {error && !editing && !pending && <p role="alert" className="error-message">{error}</p>}
    <Modal open={editing !== null} title={editing === "new" ? "A cooking note" : "Edit cooking note"} description="Keep a dated record of what worked and what to try next." onClose={() => { if (!busy) setEditing(null); }}><form onSubmit={save}><label className="field-label" htmlFor="cooked-on">Cooking date</label><input id="cooked-on" type="date" required value={cookedOn} onChange={event => setCookedOn(event.target.value)} /><label className="field-label" htmlFor="cooking-note">Cooking note</label><textarea id="cooking-note" rows={4} maxLength={5000} value={body} onChange={event => setBody(event.target.value)} /><label className="field-label" htmlFor="note-rating">Personal rating (optional)</label><select id="note-rating" value={rating} onChange={event => setRating(event.target.value)}><option value="">No rating</option>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}/5</option>)}</select>{error && <p role="alert" className="error-message">{error}</p>}<div className="modal-actions"><Button type="button" variant="secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save cooking note"}</Button></div></form></Modal>
    <Modal open={pending !== null} title={pending?.kind === "note" ? "Delete this cooking note?" : "Restore this revision?"} description={pending?.kind === "note" ? "This note will be removed from this device." : "Replace the current recipe fields with this snapshot. Cooking notes and all history stay. A safety snapshot of the current recipe is added first."} onClose={() => { if (!busy) setPending(null); }}>{error && <p role="alert" className="error-message">{error}</p>}<div className="modal-actions"><Button variant="secondary" disabled={busy} onClick={() => setPending(null)}>Cancel</Button><Button variant={pending?.kind === "note" ? "danger" : "primary"} disabled={busy} onClick={() => void confirm()}>{busy ? "Saving…" : pending?.kind === "note" ? "Delete cooking note" : "Restore revision"}</Button></div></Modal>
  </div>;
}
