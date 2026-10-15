"use client";
import { useEffect } from "react";

/** Keep browser chrome aligned with manual appearance overrides as well as OS changes. */
export function ThemeChrome() {
  useEffect(() => {
    const root = document.documentElement;
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const color = getComputedStyle(root).getPropertyValue("--bg").trim();
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (meta && color) meta.content = color;
    };
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    preference.addEventListener("change", update);
    update();
    return () => { observer.disconnect(); preference.removeEventListener("change", update); };
  }, []);
  return <div className="status-bar-background" aria-hidden="true" />;
}
