import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
export function Modal({ open, title, description, children, onClose }: { open: boolean; title: string; description?: string; children: ReactNode; onClose: () => void }) {
  const opener = useRef<HTMLElement | null>(null);
  return <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <Dialog.Portal><Dialog.Overlay className="modal-overlay" /><Dialog.Content className="modal-content"
      onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (document.querySelector('[role="dialog"]')) return;
        if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
        else document.getElementById("main-content")?.focus({ preventScroll: true });
      }}>
      <div className="modal-heading"><Dialog.Title>{title}</Dialog.Title><Dialog.Close className="icon-button" aria-label="Close dialog"><X size={20} /></Dialog.Close></div>
      {description ? <Dialog.Description className="muted modal-description">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
      {children}
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
