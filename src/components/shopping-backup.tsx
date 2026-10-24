"use client";
import { useRef, useState } from "react";
import { ArrowDownToLine, FileUp } from "lucide-react";
import { errorMessage } from "@/lib/recipe";
import { importShoppingLists, MAX_SHOPPING_BACKUP_BYTES, type ShoppingBackup } from "@/lib/shopping-lists";
import { restoreShoppingLists, shoppingListsBackup } from "@/lib/shopping-db";
import { Button } from "./ui/button";

export function ShoppingBackupControls({ notify, onPendingChange }: { notify: (message: string, error?: boolean) => void; onPendingChange: (pending: boolean) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [incoming, setIncoming] = useState<ShoppingBackup | null>(null);
  const [working, setWorking] = useState(false);
  async function download() {
    setWorking(true); onPendingChange(true);
    try {
      const blob = new Blob([await shoppingListsBackup()], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = "shopping-lists.json"; document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000); notify("Shopping lists exported.");
    } catch (cause) { notify(errorMessage(cause), true); }
    finally { setWorking(false); onPendingChange(false); }
  }
  async function read(file?: File) {
    if (!file) return;
    setIncoming(null);
    setWorking(true); onPendingChange(true);
    try {
      if (!file.name.toLowerCase().endsWith(".json")) throw new Error("Choose a shopping-lists.json backup");
      if (file.size > MAX_SHOPPING_BACKUP_BYTES) throw new Error("Shopping lists exceed the 5 MB backup limit");
      setIncoming(importShoppingLists(await file.text()));
    } catch (cause) { notify(errorMessage(cause), true); }
    finally { if (inputRef.current) inputRef.current.value = ""; setWorking(false); onPendingChange(false); }
  }
  async function restore() {
    if (!incoming) return;
    setWorking(true); onPendingChange(true);
    try { await restoreShoppingLists(incoming); setIncoming(null); notify("Shopping lists restored."); }
    catch (cause) { notify(errorMessage(cause), true); }
    finally { setWorking(false); onPendingChange(false); }
  }
  return <section className="shopping-backup"><h3>Shopping-list backup</h3><p className="muted small">Lists live in this browser. Save them separately from your recipe collection.</p><input ref={inputRef} className="sr-only" type="file" accept=".json,application/json" aria-label="Shopping-list backup file" disabled={working} onChange={event => void read(event.target.files?.[0])} /><div className="settings-actions"><Button variant="secondary" disabled={working} onClick={() => void download()}><ArrowDownToLine size={18} /> Export shopping lists</Button><Button variant="secondary" disabled={working} onClick={() => inputRef.current?.click()}><FileUp size={18} /> Restore shopping lists</Button></div>{incoming && <section className="shopping-restore" aria-label="Review shopping-list restore"><h3>Replace shopping lists?</h3><p className="small">{incoming.lists.length} lists · {incoming.items.length} items</p><p className="muted small">This replaces all current shopping lists. Your recipes stay as they are.</p><div className="modal-actions"><Button variant="secondary" disabled={working} onClick={() => setIncoming(null)}>Cancel restore</Button><Button variant="danger" disabled={working} onClick={() => void restore()}>Replace shopping lists</Button></div></section>}</section>;
}
