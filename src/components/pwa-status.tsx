"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
export function PwaStatus({ canUpdate = true }: { canUpdate?: boolean }) {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let mounted = true;
    let registration: ServiceWorkerRegistration | undefined;
    let reloading = false;
    const inspect = () => { if (mounted && registration) { if (registration.waiting && navigator.serviceWorker.controller) setWaiting(registration.waiting); if (registration.active) setReady(true); } };
    const check = () => { void registration?.update().catch(() => {}); };
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((result) => {
      registration = result; inspect();
      result.addEventListener("updatefound", () => { result.installing?.addEventListener("statechange", inspect); });
      void navigator.serviceWorker.ready.then(() => { if (mounted) setReady(true); });
    }).catch(() => {});
    window.addEventListener("online", check); document.addEventListener("visibilitychange", check);
    const approvedReload = () => { if (sessionStorage.getItem("recipe-update-approved") === "yes" && !reloading) { reloading = true; sessionStorage.removeItem("recipe-update-approved"); window.location.reload(); } };
    navigator.serviceWorker.addEventListener("controllerchange", approvedReload);
    return () => { mounted = false; window.removeEventListener("online", check); document.removeEventListener("visibilitychange", check); navigator.serviceWorker.removeEventListener("controllerchange", approvedReload); };
  }, []);
  if (waiting) return <div className="update-banner" role="status"><RefreshCw size={17} /><span>A fresh version is ready.{!canUpdate && " Finish your changes to update."}</span><Button variant="secondary" disabled={!canUpdate} onClick={() => { sessionStorage.setItem("recipe-update-approved", "yes"); waiting.postMessage({ type: "ACTIVATE" }); }}>Update</Button></div>;
  return ready ? <p className="pwa-ready">Available offline on this device</p> : null;
}
