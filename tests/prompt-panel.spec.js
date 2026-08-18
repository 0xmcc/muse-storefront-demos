// @ts-check
const { test, expect } = require("@playwright/test");

/* The button, and who gets to see it.

   These run against serve.py rather than the static server, because the panel
   only appears when the server says the caller holds the studio key — the page
   decides nothing about authorisation on its own. A page that showed the
   button whenever a query parameter was present would hand every prospect a
   prompt box that spends money. */

const APP = "http://127.0.0.1:8798";
const BRAND = "barcelino";
const KEY = "test-studio-key-do-not-ship-0000000000";

const PANEL = "[data-prompt-panel]";
const OPEN = "[data-prompt-open]";
const TEXT = "[data-prompt-notes]";
const SAVE = "[data-prompt-save]";
const LABEL = "[data-prompt-label]";
const VERSIONS = "[data-prompt-version]";

const settle = (page) => page.waitForTimeout(700);

async function openStudioAs(page, key) {
  const url = key
    ? `${APP}/${BRAND}/virtual-try-on.html?studio=1&prompt_key=${encodeURIComponent(key)}`
    : `${APP}/${BRAND}/virtual-try-on.html?studio=1`;
  await page.goto(url);
  await expect(page.locator("#scrim")).toHaveClass(/\bin\b/, { timeout: 15_000 });
  await settle(page);
}

test.describe("prompt panel", () => {
  test("an ordinary visitor never sees it", async ({ page }) => {
    await openStudioAs(page, null);
    await expect(page.locator(OPEN)).toHaveCount(0);
    await expect(page.locator(PANEL)).toHaveCount(0);
  });

  test("a wrong key shows nothing either", async ({ page }) => {
    await openStudioAs(page, "not-the-key");
    await expect(page.locator(OPEN)).toHaveCount(0);
  });

  test("the key survives opening the demo in a new tab", async ({ context }) => {
    /* sessionStorage is per-tab, so a key stored there vanishes the moment you
       open muse.fashion/barcelino in a second tab — which is how anyone
       actually returns to a demo. The key has to outlive the tab that carried
       it in. */
    const first = await context.newPage();
    await first.route("**/api/tryon", () => {});
    await first.goto(`${APP}/${BRAND}/virtual-try-on.html?studio=1&prompt_key=${encodeURIComponent(KEY)}`);
    await expect(first.locator(OPEN)).toBeVisible({ timeout: 15_000 });

    const second = await context.newPage();
    await second.route("**/api/tryon", () => {});
    await second.goto(`${APP}/${BRAND}/virtual-try-on.html?studio=1`);
    await expect(second.locator(OPEN),
      "a second tab with no key in the URL still belongs to the owner").toBeVisible({ timeout: 15_000 });
  });

  test("the key is not left in the address bar", async ({ page }) => {
    /* Otherwise the first screen-share or pasted link leaks it. */
    await openStudioAs(page, KEY);
    await expect(page.locator(OPEN)).toBeVisible();
    expect(page.url()).not.toContain(KEY);
  });

  test("the button opens the prompt that is actually being sent", async ({ page, request }) => {
    /* Asserted against whatever the server says is live, not against the seed
       text: sibling specs change the active version, and "the box shows the
       house style" would then be testing test order. The real claim is that
       what you read in the box is what gets sent. */
    const store = await (await request.get(`${APP}/${BRAND}/api/prompt`, {
      headers: { "x-studio-key": KEY },
    })).json();
    const live = store.versions.find((v) => v.id === store.active);

    await openStudioAs(page, KEY);
    await page.locator(OPEN).click();

    const panel = page.locator(PANEL);
    await expect(panel).toBeVisible();

    const notes = page.locator(TEXT);
    await expect(notes).toBeVisible();
    await expect(notes).toHaveValue(live.notes);
  });

  test("it lists the versions, marking which one is live", async ({ page }) => {
    await openStudioAs(page, KEY);
    await page.locator(OPEN).click();
    await expect(page.locator(PANEL)).toBeVisible();

    const rows = page.locator(VERSIONS);
    await expect(rows.first()).toBeVisible();
    await expect(page.locator(`${VERSIONS}[data-active="true"]`)).toHaveCount(1);
  });

  test("saving from the panel adds a version without losing the current text",
    async ({ page }) => {
      await openStudioAs(page, KEY);
      await page.locator(OPEN).click();
      await expect(page.locator(PANEL)).toBeVisible();

      const before = await page.locator(VERSIONS).count();
      const original = await page.locator(TEXT).inputValue();

      await page.locator(LABEL).fill("panel save " + Date.now());
      await page.locator(TEXT).fill(original + "\nKeep the face unretouched.");
      await page.locator(SAVE).click();

      await expect(page.locator(VERSIONS)).toHaveCount(before + 1, { timeout: 10_000 });

      /* Reopen from scratch: the new version has to have reached the server,
         not just the DOM. */
      await page.reload();
      await expect(page.locator("#scrim")).toHaveClass(/\bin\b/, { timeout: 15_000 });
      await page.locator(OPEN).click();
      await expect(page.locator(VERSIONS)).toHaveCount(before + 1);
    });

  test("an empty prompt cannot be saved", async ({ page }) => {
    await openStudioAs(page, KEY);
    await page.locator(OPEN).click();
    await expect(page.locator(PANEL)).toBeVisible();

    const before = await page.locator(VERSIONS).count();
    await page.locator(TEXT).fill("   ");
    await page.locator(SAVE).click();
    await settle(page);
    await expect(page.locator(VERSIONS)).toHaveCount(before);
  });

  test("the panel closes and leaves the studio usable", async ({ page }) => {
    await openStudioAs(page, KEY);
    await page.locator(OPEN).click();
    await expect(page.locator(PANEL)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(PANEL)).toBeHidden();
    await expect(page.locator("#scrim")).toHaveClass(/\bin\b/);
  });
});
