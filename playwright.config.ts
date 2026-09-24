import { defineConfig, devices } from "@playwright/test";

/**
 * A real browser, not jsdom.
 *
 * Most of what is worth testing here does not exist under jsdom: <dialog> has no modal
 * behaviour, element.animate is absent, and focus does not move. Polyfilling all three
 * would mean testing a fiction of the component rather than the component — and every bug
 * these tests were written for lived in exactly those three places.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:5199", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // the tests drive the real app, so they bring their own server up and take it down again
  webServer: {
    command: "npm run dev -- --port 5199 --strictPort",
    url: "http://localhost:5199",
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
  },
});
