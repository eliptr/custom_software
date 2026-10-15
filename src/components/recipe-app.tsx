"use client";
import { Component, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDownToLine, ArrowRight, BookOpen, Check, ChefHat, FileUp, ImagePlus, LoaderCircle, Moon, Plus, Search, Settings2, Sun, Upload, WifiOff, X } from "lucide-react";
import { db, deleteRecipe, importRecipes, previewImport, saveRecipe } from "@/lib/db";
import { createRecipe, emptyRecipe, errorMessage, extractionSchema, makeRevision, recipeSchema, searchText, toRecipeContent, type Recipe, type RecipeContent, type Extraction } from "@/lib/recipe";
import { collectionVocabulary } from "@/lib/taxonomy";
import { exportCollection, importCollection, MAX_IMPORT_BYTES } from "@/lib/markdown";
import { prepareScreenshots } from "@/lib/images";
import { Button } from "./ui/button";
import { Modal } from "./ui/modal";
import { RecipeEditor } from "./recipe-editor";
import { RecipeDetails } from "./recipe-details";
import { RecipeMetadata } from "./recipe-metadata";
import { PwaStatus } from "./pwa-status";

type View = { kind: "collection" } | { kind: "detail"; id: string } | { kind: "editor"; content: RecipeContent; original?: Recipe; warnings?: Extraction["warnings"] };
type Dialog = "add" | "settings" | "import" | "delete" | "discard" | null;
function subscribeOnline(callback: () => void) { window.addEventListener("online", callback); window.addEventListener("offline", callback); return () => { window.removeEventListener("online", callback); window.removeEventListener("offline", callback); }; }

class StorageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <main className="storage-error"><ChefHat size={40} /><h1>We couldn’t open your collection</h1><p>Your browser may be blocking local storage. Allow website storage, then reload Recipe Tracker. Existing data has not been deleted.</p><Button onClick={() => location.reload()}>Reload</Button></main> : this.props.children; }
}
export default function RecipeApp() { return <StorageBoundary><Collection /></StorageBoundary>; }

function Collection() {
  const recipes = useLiveQuery(() => db.recipes.toArray());
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [view, setView] = useState<View>({ kind: "collection" });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [sort, setSort] = useState("updated");
  const [token, setToken] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [extractionStage, setExtractionStage] = useState("");
  const [notification, setNotification] = useState<{ text: string; error: boolean } | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [incoming, setIncoming] = useState<Recipe[] | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [theme, setTheme] = useState<"light" | "dark" | "system">(() => {
    try { const saved = typeof window === "undefined" ? "system" : localStorage.getItem("recipe-theme"); return saved === "light" || saved === "dark" ? saved : "system"; } catch { return "system"; }
  });
  const importRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!notification || notification.error) return;
    const timer = setTimeout(() => setNotification(null), 4500);
    return () => clearTimeout(timer);
  }, [notification]);
  const selected = view.kind === "detail" ? recipes?.find((recipe) => recipe.id === view.id) : undefined;
  const categories = [...new Set((recipes || []).map((recipe) => recipe.category).filter((value): value is string => Boolean(value)))].sort();
  const tags = [...new Set((recipes || []).flatMap((recipe) => recipe.tags))].sort();
  const filtered = (recipes || []).filter((recipe) => {
    const term = searchText(query);
    return (!category || recipe.category === category) && (!tagFilter || recipe.tags.includes(tagFilter)) && (!term || searchText([recipe.title, ...recipe.ingredients.map((item) => item.name)].join(" ")).includes(term));
  }).sort((a, b) => sort === "name" ? a.title.localeCompare(b.title, ["el", "en"]) : sort === "created" ? Date.parse(b.createdAt) - Date.parse(a.createdAt) : Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  function notify(text: string, error = false) { setNotification({ text, error }); }
  function collection() { setView({ kind: "collection" }); window.scrollTo(0, 0); }
  function closeDialog() { abortRef.current?.abort(); setDialog(null); setFiles([]); setUploadError(""); }
  function manual() { setView({ kind: "editor", content: emptyRecipe() }); closeDialog(); window.scrollTo(0, 0); }
  function edit(recipe: Recipe) {
    setView({ kind: "editor", content: toRecipeContent(recipe), original: recipe }); window.scrollTo(0, 0);
  }
  async function persist(content: RecipeContent, revisionDescription?: string) {
    setBusy(true);
    try {
      const recipe = view.kind === "editor" && view.original ? recipeSchema.parse({ ...view.original, ...content, updatedAt: new Date().toISOString() }) : createRecipe(content);
      if (revisionDescription !== undefined) recipe.revisions = [...recipe.revisions, makeRevision(content, revisionDescription.trim() || null)];
      await saveRecipe(recipe);
      if (navigator.storage?.persist) void navigator.storage.persist().catch(() => {});
      setView({ kind: "detail", id: recipe.id }); notify("Recipe saved to your collection."); window.scrollTo(0, 0);
    } finally { setBusy(false); }
  }
  async function extract() {
    setUploadError(""); setBusy(true);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      if (!online) throw new Error("Connect to the internet to extract a recipe. You can still add one manually.");
      if (!token.trim()) throw new Error("Enter the private app code below to use AI extraction.");
      setExtractionStage("Preparing screenshots…");
      const images = await prepareScreenshots(files);
      if (controller.signal.aborted) return;
      setExtractionStage("Reading your recipe…");
      const vocabulary = collectionVocabulary(await db.recipes.toArray());
      const response = await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ images, vocabulary, conversionVersion: 3 }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90000)]) });
      const data = await response.json().catch(() => ({ error: "Extraction could not finish. Try fewer screenshots." }));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Extraction failed. Please retry.");
      const result = extractionSchema.parse(data);
      setView({ kind: "editor", content: result.recipe, warnings: result.warnings }); setDialog(null); setFiles([]); window.scrollTo(0, 0);
    } catch (cause) {
      if (!controller.signal.aborted) setUploadError(cause instanceof Error && cause.name === "TimeoutError" ? "Extraction timed out. Please retry." : errorMessage(cause));
    } finally { setBusy(false); setExtractionStage(""); abortRef.current = null; }
  }
  function download() {
    try {
      const blob = new Blob([exportCollection(recipes || [])], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = "recipe-collection.md"; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Your collection was exported as one Markdown file.");
    } catch (cause) { notify(errorMessage(cause), true); }
  }
  async function readImport(file?: File) {
    if (!file) return;
    try {
      if (!file.name.toLowerCase().endsWith(".md")) throw new Error("Choose a .md Recipe Tracker collection.");
      if (file.size > MAX_IMPORT_BYTES) throw new Error("The collection exceeds the 5 MB import limit.");
      setIncoming(importCollection(await file.text())); setImportMode("merge"); setDialog("import");
    } catch (cause) { notify(errorMessage(cause), true); }
    finally { if (importRef.current) importRef.current.value = ""; }
  }
  async function confirmImport() {
    if (!incoming) return;
    setBusy(true);
    try { await importRecipes(incoming, importMode); closeDialog(); collection(); setIncoming(null); notify("Collection imported successfully."); }
    catch (cause) { notify(errorMessage(cause), true); }
    finally { setBusy(false); }
  }
  async function confirmDelete() {
    if (!selected) return;
    setBusy(true);
    try { await deleteRecipe(selected.id); closeDialog(); collection(); notify("Recipe deleted."); }
    catch (cause) { notify(errorMessage(cause), true); }
    finally { setBusy(false); }
  }
  function changeTheme(next: "light" | "dark" | "system") {
    setTheme(next); document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("recipe-theme", next); } catch { /* Theme storage is optional. */ }
  }
  const preview = previewImport(recipes || [], incoming || []);
  return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to recipes</a>
    <header className="app-header"><div className="brand"><span className="brand-icon"><ChefHat size={24} strokeWidth={1.5} /></span><span>recipe<span className="brand-light">tracker</span><small>YOUR PERSONAL COOKBOOK</small></span></div><div className="header-actions"><span className="local-label"><span className="status-dot" /> Stored on your device</span><button className="icon-button" aria-label="Settings and backups" disabled={view.kind === "editor"} onClick={() => setDialog("settings")}><Settings2 size={21} /></button></div></header>
    {!online && <div className="offline-banner" role="status"><WifiOff size={17} /><span>You’re offline. Saved recipes and manual editing are ready to use.</span></div>}
    <PwaStatus canUpdate={view.kind === "collection" && !busy && dialog === null} />
    {notification && <div className={`toast ${notification.error ? "toast-error" : ""}`} role={notification.error ? "alert" : "status"}><span>{notification.text}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotification(null)}><X size={18} /></button></div>}
    <input ref={importRef} className="sr-only" type="file" accept=".md,text/markdown" aria-label="Import Markdown collection" onChange={(event) => void readImport(event.target.files?.[0])} />
    <main id="main-content" className="main-content" tabIndex={-1}>
      {view.kind === "collection" && <><section className="collection-heading"><div><p className="eyebrow">GOOD FOOD, KEPT CLOSE</p><h1>Your recipe collection<span className="heading-dot">.</span></h1><p className="muted">The recipes you love, all in one little place.</p></div><Button className="desktop-add" onClick={() => setDialog("add")}><Plus size={19} /> Add recipe</Button></section>
        <section className="capture-banner"><div className="capture-icon"><ImagePlus size={25} strokeWidth={1.5} /></div><div><h2>From screenshot to supper.</h2><p>Save a recipe from anywhere. We’ll help with the details.</p></div><button aria-label="Add recipe from screenshots" className="icon-button" onClick={() => setDialog("add")}><ArrowRight size={23} /></button></section>
        <section className="collection-toolbar" aria-label="Find recipes"><div className="search-field"><Search size={19} /><input aria-label="Search recipes" type="search" placeholder="Find a recipe or ingredient…" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="filters"><select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Filter by tag" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="">All tags</option>{tags.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Sort recipes" value={sort} onChange={(event) => setSort(event.target.value)}><option value="updated">Recently updated</option><option value="created">Newest first</option><option value="name">Name A–Z</option></select></div></section>
        <div className="collection-count"><p>{recipes === undefined ? "Opening your cookbook…" : `${filtered.length} ${filtered.length === 1 ? "recipe" : "recipes"}`}</p><span className="muted small">Made to be made again</span></div>
        {recipes === undefined ? <div className="loading-state" role="status"><LoaderCircle className="spin" /> Opening your collection…</div> : filtered.length > 0 ? <div className="recipe-grid">{filtered.map((recipe, index) => <button className="recipe-card" key={recipe.id} onClick={() => { setView({ kind: "detail", id: recipe.id }); window.scrollTo(0, 0); }}><div className="card-top"><span className="eyebrow">{recipe.category || "YOUR FAVORITES"}</span><span className="card-index">{String(index + 1).padStart(2, "0")}</span></div><h2>{recipe.title}</h2>{recipe.description && <p className="card-description">{recipe.description}</p>}<div className="card-footer"><RecipeMetadata recipe={recipe} /><ArrowRight size={19} /></div></button>)}</div> : <section className="empty-state"><span className="empty-icon"><BookOpen size={34} strokeWidth={1.3} /></span><p className="eyebrow">{recipes.length ? "KEEP LOOKING" : "A FRESH START"}</p><h2>{recipes.length ? "No recipes found" : "Every collection starts\nwith one good recipe."}</h2><p className="muted">{recipes.length ? "Try another search, category, or tag." : "Add a screenshot or write down a favorite.\nYour next great meal belongs here."}</p>{recipes.length ? <Button variant="secondary" onClick={() => { setQuery(""); setCategory(""); setTagFilter(""); }}>Clear filters</Button> : <Button onClick={() => setDialog("add")}><Plus size={18} /> Add your first recipe</Button>}</section>}
        <footer className="collection-footer"><span>YOUR RECIPES. YOUR DEVICE. YOUR KITCHEN.</span><button onClick={() => setDialog("settings")}>Back up your collection <ArrowDownToLine size={14} /></button></footer>
      </>}
      {view.kind === "detail" && (selected ? <RecipeDetails key={selected.id} recipe={selected} onBack={collection} onEdit={() => edit(selected)} onDelete={() => setDialog("delete")} /> : <section className="empty-state"><h2>Recipe unavailable</h2><Button onClick={collection}>Back to collection</Button></section>)}
      {view.kind === "editor" && <RecipeEditor token={token} onTokenChange={setToken} online={online} initial={view.content} warnings={view.warnings} editing={Boolean(view.original)} busy={busy} onSave={persist} onCancel={(dirty) => dirty ? setDialog("discard") : collection()} />}
    </main>
    {view.kind !== "editor" && <nav className="mobile-nav" aria-label="Main navigation"><button onClick={collection} aria-current={view.kind === "collection" ? "page" : undefined}><BookOpen size={21} /><span>Collection</span></button><button className="mobile-add" onClick={() => setDialog("add")}><Plus size={23} /><span>Add recipe</span></button><button onClick={() => setDialog("settings")}><Settings2 size={21} /><span>Settings</span></button></nav>}
    <Modal open={dialog === "add"} title="Add something delicious" description="Bring all screenshots of one recipe, or start with a blank page." onClose={closeDialog}><div className="upload-box"><ImagePlus size={30} strokeWidth={1.4} /><h3>Start with screenshots</h3><p className="muted small">1–6 JPEG, PNG, or WebP images of the same recipe.</p><label className="button button-secondary upload-label"><Upload size={18} /> Choose screenshots<input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy || !online} onChange={(event) => { setFiles(Array.from(event.target.files || [])); setUploadError(""); event.target.value = ""; }} /></label></div>
      {files.length > 0 && <ul className="file-list">{files.map((file, index) => <li key={index}><span>{file.name}</span><button className="icon-button" disabled={busy} aria-label={`Remove screenshot ${index + 1}`} onClick={() => setFiles(files.filter((_, i) => i !== index))}><X size={17} /></button></li>)}</ul>}
      {!online && <p className="notice-text"><WifiOff size={16} /> Screenshot extraction needs an internet connection.</p>}
      <label className="field-label" htmlFor="extraction-token">Private app code</label><input id="extraction-token" type="password" autoComplete="off" placeholder="Provided by the app owner" value={token} onChange={(event) => setToken(event.target.value)} /><p className="muted small">Use the code from the app owner, never an AI API key. Kept in memory for this session.</p>
      {uploadError && <p className="error-message" role="alert">{uploadError}</p>}<Button className="full-width" disabled={!files.length || busy || !online} onClick={() => void extract()}>{busy ? <LoaderCircle size={18} className="spin" /> : <ImagePlus size={18} />}{busy ? extractionStage : uploadError ? "Retry extraction" : "Extract recipe"}</Button><div className="divider"><span>or keep it simple</span></div><Button className="full-width" variant="secondary" disabled={busy} onClick={manual}><Plus size={18} /> Write a recipe manually</Button>
    </Modal>
    <Modal open={dialog === "settings"} title="Your kitchen, your way" description="Keep a backup of your collection and make yourself at home." onClose={closeDialog}><h3>Collection backup</h3><p className="muted small">Recipes live in this browser. Export regularly to protect them when changing devices or clearing browser data.</p><div className="settings-actions"><Button variant="secondary" disabled={recipes === undefined} onClick={download}><ArrowDownToLine size={18} />Export collection</Button><Button variant="secondary" disabled={recipes === undefined} onClick={() => importRef.current?.click()}><FileUp size={18} />Import Markdown</Button></div><p className="muted small">One readable <strong>recipe-collection.md</strong> file. No account needed.</p><hr /><h3>Appearance</h3><div className="theme-options">{(["system", "light", "dark"] as const).map((value) => <Button key={value} variant="secondary" onClick={() => changeTheme(value)} aria-pressed={theme === value}>{value === "dark" ? <Moon size={16} /> : <Sun size={16} />}{value.charAt(0).toUpperCase() + value.slice(1)}{theme === value && <Check size={14} />}</Button>)}</div><hr /><h3>Install on iPhone</h3><p className="muted">Open this app in Safari. Tap Share, then <strong>Add to Home Screen</strong>, then Add. Open it once online to prepare it for offline use.</p><p className="muted small">AI extraction uses an internet connection. Saved recipes, cooking checklists, editing, and backups work offline.</p></Modal>
    <Modal open={dialog === "import"} title="Review your import" description="Nothing changes until you confirm." onClose={closeDialog}><p><strong>{incoming?.length || 0} recipes</strong> in this file · {preview.filter((item) => item.action === "add").length} new · {preview.filter((item) => item.action === "update").length} existing IDs</p><div className="import-modes"><label><input type="radio" name="import-mode" checked={importMode === "merge"} onChange={() => setImportMode("merge")} /><span><strong>Merge collections</strong><small>Add new recipes and update matching IDs from the file.</small></span></label><label><input type="radio" name="import-mode" checked={importMode === "replace"} onChange={() => setImportMode("replace")} /><span><strong>Replace collection</strong><small>Remove all {recipes?.length || 0} saved recipes and restore only this file.</small></span></label></div><ul className="import-preview">{preview.map((item) => <li key={item.recipe.id}><span>{item.recipe.title}</span><span className="tag">{item.action}</span></li>)}</ul>{importMode === "replace" && <p className="error-message">This replaces your entire collection. Export a backup first if you need the current recipes.</p>}<div className="modal-actions"><Button variant="secondary" disabled={busy} onClick={closeDialog}>Cancel</Button><Button variant={importMode === "replace" ? "danger" : "primary"} disabled={busy} onClick={() => void confirmImport()}>{busy ? "Importing…" : importMode === "replace" ? "Replace collection" : "Merge recipes"}</Button></div></Modal>
    <Modal open={dialog === "delete"} title="Delete this recipe?" description={`“${selected?.title || "This recipe"}” will be removed from this device.`} onClose={closeDialog}><div className="modal-actions"><Button variant="secondary" disabled={busy} onClick={closeDialog}>Keep recipe</Button><Button variant="danger" disabled={busy} onClick={() => void confirmDelete()}>Delete recipe</Button></div></Modal>
    <Modal open={dialog === "discard"} title="Discard your changes?" description="Your unsaved edits will be lost." onClose={closeDialog}><div className="modal-actions"><Button variant="secondary" onClick={closeDialog}>Keep editing</Button><Button variant="danger" onClick={() => { closeDialog(); collection(); }}>Discard changes</Button></div></Modal>
  </div>;
}
