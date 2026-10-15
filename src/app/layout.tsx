import type { Metadata, Viewport } from "next";
import { ThemeChrome } from "@/components/theme-chrome";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recipe Tracker",
  description: "Your personal cookbook. Save screenshots, cook your favorites, and keep every recipe offline.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Recipe Tracker" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f7f6f0" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('recipe-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:'system'}catch(e){}" }} /></head><body><ThemeChrome />{children}</body></html>;
}
