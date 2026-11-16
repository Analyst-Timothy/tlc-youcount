const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/journeys",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["line"]] : "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    channel: process.env.CI ? undefined : "chrome",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
