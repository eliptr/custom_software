"use client";
import { useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Pencil, Plus, ShoppingBasket, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { errorMessage } from "@/lib/recipe";
import { addManualShoppingItem, clearBoughtShoppingItems, createShoppingList, deleteShoppingItem, deleteShoppingList, renameShoppingList, setShoppingItemBought, updateShoppingItem } from "@/lib/shopping-db";
import { shoppingSourceAmount, SUPERMARKET_ID, type ShoppingItem } from "@/lib/shopping-lists";
import { Button } from "./ui/button";
import { Modal } from "./ui/modal";

type ListDialog = { kind: "create" } | { kind: "rename"; id: string } | { kind: "delete"; id: string; name: string } | { kind: "clear"; id: string } | { kind: "edit"; item: ShoppingItem } | null;
export function ShoppingLists({ onBack, onAddRecipe, notify }: { onBack: () => void; onAddRecipe: () => void; notify: (message: string, error?: boolean) => void }) {
  const lists = useLiveQuery(() => db.shoppingLists.orderBy("createdAt").toArray());
  const [selectedId, setSelectedId] = useState(SUPERMARKET_ID);
  const activeId = lists?.some(list => list.id === selectedId) ? selectedId : SUPERMARKET_ID;
  const items = useLiveQuery(() => db.shoppingItems.where("listId").equals(activeId).sortBy("order"), [activeId]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dialog, setDialog] = useState<ListDialog>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [working, setWorking] = useState(false);
  const current = lists?.find(list => list.id === activeId);
  const pending = (items || []).filter(item => !item.bought);
  const bought = (items || []).filter(item => item.bought);

  async function run(operation: () => Promise<unknown>) {
    setWorking(true);
    try { await operation(); return true; }
    catch (cause) { notify(errorMessage(cause), true); return false; }
    finally { setWorking(false); }
  }
  async function add(event: FormEvent) {
    event.preventDefault();
    if (await run(() => addManualShoppingItem(activeId, name, amount))) { setName(""); setAmount(""); }
  }
  async function saveDialog(event: FormEvent) {
    event.preventDefault();
    const success = await run(async () => {
      if (dialog?.kind === "create") setSelectedId(await createShoppingList(editName));
      else if (dialog?.kind === "rename") await renameShoppingList(dialog.id, editName);
      else if (dialog?.kind === "edit") await updateShoppingItem(dialog.item.id, { name: editName, amount: editAmount });
    });
    if (success) setDialog(null);
  }
  async function confirm() {
    const success = await run(async () => {
      if (dialog?.kind === "delete") { await deleteShoppingList(dialog.id); setSelectedId(SUPERMARKET_ID); }
      else if (dialog?.kind === "clear") await clearBoughtShoppingItems(dialog.id);
    });
    if (success) setDialog(null);
  }
  function edit(item: ShoppingItem) { setEditName(item.name); setEditAmount(item.amount); setDialog({ kind: "edit", item }); }
  const close = () => { if (!working) setDialog(null); };
  const formDialog = dialog?.kind === "create" || dialog?.kind === "rename" || dialog?.kind === "edit";
  return <section className="shopping-page" aria-label="Shopping lists">
    <div className="detail-toolbar"><button className="back-link" onClick={onBack}><ArrowLeft size={18} /> All recipes</button><Button className="desktop-add" variant="secondary" onClick={onAddRecipe}><Plus size={18} /> Add recipe</Button></div>
    <div className="shopping-heading"><h1>Lists</h1><span className="count-label">{pending.length} to buy</span></div>
    <div className="shopping-list-toolbar"><select aria-label="Shopping list" value={activeId} disabled={!lists || working} onChange={event => { setSelectedId(event.target.value); setName(""); setAmount(""); }}>
      <option value={SUPERMARKET_ID}>Supermarket</option>{lists?.filter(list => list.id !== SUPERMARKET_ID).map(list => <option key={list.id} value={list.id}>{list.name}</option>)}
    </select><button className="icon-button" aria-label="Create list" disabled={working} onClick={() => { setEditName(""); setDialog({ kind: "create" }); }}><Plus size={18} /></button>
      {activeId !== SUPERMARKET_ID && <><button className="icon-button" aria-label="Rename list" disabled={working} onClick={() => { setEditName(current?.name || ""); setDialog({ kind: "rename", id: activeId }); }}><Pencil size={17} /></button><button className="icon-button" aria-label="Delete list" disabled={working} onClick={() => setDialog({ kind: "delete", id: activeId, name: current?.name || "This list" })}><Trash2 size={17} /></button></>}
    </div>
    <form className="shopping-add" onSubmit={event => void add(event)} aria-label="Add shopping item"><label>Item<input required maxLength={300} placeholder="e.g. Milk" value={name} onChange={event => setName(event.target.value)} disabled={working} /></label><label>Amount / note <span className="muted">(optional)</span><input maxLength={1000} placeholder="e.g. 2 cartons" value={amount} onChange={event => setAmount(event.target.value)} disabled={working} /></label><Button type="submit" disabled={working || !name.trim() || !items}><Plus size={17} /> Add item</Button></form>
    {items === undefined ? <p className="muted small" role="status">Opening your list…</p> : <>
      {!items.length && <div className="shopping-empty"><ShoppingBasket size={24} strokeWidth={1.5} /><p>No items yet</p><p className="muted small">Add an item here{activeId === SUPERMARKET_ID ? " or use the basket beside a recipe ingredient." : "."}</p></div>}
      {pending.length > 0 && <ShoppingRows items={pending} working={working} onEdit={edit} onToggle={item => run(() => setShoppingItemBought(item.id, !item.bought))} onDelete={item => void run(() => deleteShoppingItem(item.id))} />}
      {bought.length > 0 && <section className="shopping-bought" aria-label="Bought items"><div className="section-heading"><h2>Bought <span className="count-label">{bought.length}</span></h2><Button variant="ghost" disabled={working} onClick={() => setDialog({ kind: "clear", id: activeId })}>Clear bought</Button></div><ShoppingRows items={bought} working={working} onEdit={edit} onToggle={item => run(() => setShoppingItemBought(item.id, !item.bought))} onDelete={item => void run(() => deleteShoppingItem(item.id))} /></section>}
    </>}
    <Modal open={Boolean(formDialog)} title={dialog?.kind === "create" ? "Create list" : dialog?.kind === "rename" ? "Rename list" : "Edit item"} onClose={close}><form onSubmit={event => void saveDialog(event)}><label className="field-label">{dialog?.kind === "edit" ? "Item name" : "List name"}<input required maxLength={300} value={editName} onChange={event => setEditName(event.target.value)} disabled={working} /></label>{dialog?.kind === "edit" && <label className="field-label">Amount / note<input maxLength={1000} value={editAmount} onChange={event => setEditAmount(event.target.value)} disabled={working} /></label>}<div className="modal-actions"><Button type="button" variant="secondary" onClick={close} disabled={working}>Cancel</Button><Button type="submit" disabled={working || !editName.trim()}>Save</Button></div></form></Modal>
    <Modal open={dialog?.kind === "delete" || dialog?.kind === "clear"} title={dialog?.kind === "delete" ? "Delete this list?" : "Clear bought items?"} description={dialog?.kind === "delete" ? `“${dialog.name}” and its items will be removed.` : "Bought items will be removed from this list."} onClose={close}><div className="modal-actions"><Button variant="secondary" onClick={close} disabled={working}>Cancel</Button><Button variant="danger" onClick={() => void confirm()} disabled={working}>{dialog?.kind === "delete" ? "Delete list" : "Clear bought items"}</Button></div></Modal>
  </section>;
}

type RowActions = { working: boolean; onEdit: (item: ShoppingItem) => void; onToggle: (item: ShoppingItem) => Promise<boolean>; onDelete: (item: ShoppingItem) => void };
function ShoppingRows({ items, ...actions }: { items: ShoppingItem[] } & RowActions) {
  return <ul className="shopping-items">{items.map(item => <ShoppingRow key={item.id} item={item} {...actions} />)}</ul>;
}
function ShoppingRow({ item, working, onEdit, onToggle, onDelete }: { item: ShoppingItem } & RowActions) {
  const [pending, setPending] = useState<{ before: boolean; next: boolean } | null>(null);
  const checked = pending?.before === item.bought ? pending.next : item.bought;
  async function toggle() {
    setPending({ before: item.bought, next: !item.bought });
    if (!(await onToggle(item))) setPending(null);
  }
  return <li className={item.bought ? "is-bought" : ""}><label className="shopping-item-label"><input type="checkbox" aria-label={`Bought ${item.name}`} checked={checked} disabled={working} onChange={() => void toggle()} /><span className="shopping-item-content"><strong>{item.name}</strong>{item.amount && <small>{item.amount}</small>}{item.sources.map(source => <small className="shopping-source" key={source.key}>{shoppingSourceAmount(source) || "No amount specified"}<span> · {source.recipeTitle}</span></small>)}</span></label><div className="shopping-row-actions"><button className="icon-button" aria-label={`Edit ${item.name}`} disabled={working} onClick={() => onEdit(item)}><Pencil size={16} /></button><button className="icon-button" aria-label={`Remove ${item.name}`} disabled={working} onClick={() => onDelete(item)}><Trash2 size={16} /></button></div></li>;
}
