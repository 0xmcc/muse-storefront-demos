// @ts-check
const { defineConfig, devices } = require("@playwright/test");

/* Two servers, because the specs need two different things.

   The fitting-state specs only need files, and stub every network call, so a
   plain static server is enough and keeps them fast.

   The prompt specs need serve.py itself — the prompt store, the studio-key
   check, and the try-on route all live there. It runs against a throwaway copy
   of sites/ (tests/fixture.js) so a test run cannot rewrite the prompt that
   muse.fashion/barcelino is generating with. */
module.exports = defineConfig({
  testDir: ".",
  outputDir: "./.artifacts",
  reporter: [["list"]],
  use: {
    viewport: { width: 1440, height: 950 },
    screenshot: "off",
  },
  webServer: [
    {
      command:
        "python3 -m http.server 8799 --bind 127.0.0.1 --directory ../sites/barcelino",
      url: "http://127.0.0.1:8799/virtual-try-on.html",
      reuseExistingServer: true,
      stdout: "ignore",
    },
    {
      command:
        "node fixture.js && python3 ../scripts/serve.py --sites .fixture/sites --port 8798 --host 127.0.0.1",
      url: "http://127.0.0.1:8798/barcelino/",
      reuseExistingServer: false,
      stdout: "ignore",
      env: {
        // The owner surface is off unless a key is configured, so tests must
        // supply one. Never a real key: this is the value the specs send.
        STUDIO_KEY: "test-studio-key-do-not-ship-0000000000",
        // Keeps serve.py from warning about credentials it will not use —
        // no spec here reaches the real generator.
        MUSE_API_BASE: "http://127.0.0.1:9/unused",
        APP_API_KEY: "unused-in-tests",
      },
    },
  ],
  projects: [
    {
      name: "static",
      testMatch: /fitting-label\.spec\.js/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:8799" },
    },
    {
      name: "serve",
      testMatch: /prompt-.*\.spec\.js/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:8798" },
    },
  ],
});
