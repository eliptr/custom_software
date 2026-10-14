import { defineConfig, devices } from "@playwright/test";
const channel = process.env.CI ? undefined : "msedge";
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1,
  timeout: 45000, expect: { timeout: 10000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure", screenshot: "only-on-failure", serviceWorkers: "allow" },
  projects: [
    { name: "mobile-chromium", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium", channel } },
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], channel } },
  ],
  webServer: { command: "npm run start", url: "http://localhost:3000", reuseExistingServer: !process.env.CI, timeout: 120000 },
});
