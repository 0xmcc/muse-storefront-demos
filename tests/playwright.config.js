// @ts-check
const { defineConfig, devices } = require("@playwright/test");

/* The studio is a static page; every network call it makes is stubbed in the
   spec. So the only server we need is one that hands out files from sites/.
   Serving the brand folder as the web root mirrors how serve.py mounts it. */
module.exports = defineConfig({
  testDir: ".",
  outputDir: "./.artifacts",
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:8799",
    viewport: { width: 1440, height: 950 },
    screenshot: "off",
  },
  webServer: {
    command:
      "python3 -m http.server 8799 --bind 127.0.0.1 --directory ../sites/barcelino",
    url: "http://127.0.0.1:8799/virtual-try-on.html",
    reuseExistingServer: true,
    stdout: "ignore",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
