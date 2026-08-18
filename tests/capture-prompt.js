/* Photographs the prompt studio against a running serve.py.

   Usage: node capture-prompt.js <out.png> [--closed]
     (default) the panel open, showing the live prompt and its versions
     --closed  the studio as the owner first sees it, with the button only

   Needs serve.py up with STUDIO_KEY set, e.g.
     STUDIO_KEY=... python3 ../scripts/serve.py --sites .fixture/sites --port 8798 */
const { chromium } = require("@playwright/test");

const OUT = process.argv[2] || "prompt.png";
const CLOSED = process.argv.includes("--closed");
const APP = process.env.APP || "http://127.0.0.1:8798";
const BRAND = process.env.BRAND || "barcelino";
const KEY = process.env.STUDIO_KEY || "test-studio-key-do-not-ship-0000000000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

  // Never spend a generation just to take a screenshot of the prompt box.
  await page.route("**/api/tryon", () => {});

  await page.goto(
    `${APP}/${BRAND}/virtual-try-on.html?studio=1&prompt_key=${encodeURIComponent(KEY)}`);
  await page.locator("#scrim.in").waitFor({ timeout: 15000 });
  await page.locator("[data-prompt-open]").waitFor({ timeout: 10000 });

  if (!CLOSED) {
    await page.locator("[data-prompt-open]").click();
    await page.locator("[data-prompt-panel]").waitFor();
    await page.locator("[data-prompt-notes]").blur();
  }
  await page.waitForTimeout(600);

  await page.screenshot({ path: OUT });
  const versions = await page.locator("[data-prompt-version]").count();
  console.log(`wrote ${OUT}  versions=${versions}  keyInUrl=${page.url().includes(KEY)}`);
  await browser.close();
})();
