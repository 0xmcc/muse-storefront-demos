// @ts-check
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

/* Regression cover for the fitting-room loading state.

   Two bugs in a row, in the same few lines:

   1. A cream veil was stacked UNDER .look (which is z-index:1) with the status
      text above it. The phrase came out stamped on an undimmed photograph —
      present, but unreadable, so the frame read as broken.
   2. The fix for (1) removed the text from the frame entirely and left only a
      10.5px gold caption above the panel (#a08a5e on #f7f5f2 — about 3.1:1).
      On a cold start the frame is a flat empty rectangle and the only word
      that anything is happening is a caption you cannot see.

   Both bugs are the same failure wearing different clothes: the shopper waits
   ~16s in front of a frame that does not tell them it is working. So these
   tests do not check that an element exists — they measure whether a person
   could read it, by sampling the rendered pixels. Structure passes in both
   broken versions; pixels do not. */

const PHOTO = path.join(process.env.HOME, "Downloads", "linkedinPFP.jpeg");
const SITE = path.join(__dirname, "..", "sites", "barcelino");

/* A real photograph for the "look" so the second-garment case reproduces the
   original bug faithfully: text over actual photography, not over flat grey. */
const LOOK_URL =
  "data:image/jpeg;base64," +
  fs.readFileSync(path.join(SITE, "assets", "catalog", "1041-bermuda-seersucker.jpg"))
    .toString("base64");

/* The status line the shopper is meant to read while a look generates. It may
   live anywhere inside the frame; the tests care where it renders, not what it
   is called. */
const STATUS = "#stage [data-fitting-status]";

/* ------------------------------------------------------------------ *
 * measurement
 * ------------------------------------------------------------------ */

/* WCAG contrast across the pixels actually painted where the text sits.
   Screenshot the text's own line box, hand it back to the page, and compare
   the darkest and lightest luminance in the crop. Invisible text gives a
   near-uniform crop and a ratio near 1:1, whatever the CSS claims. */
async function renderedContrast(page, selector) {
  const clip = await page.$eval(selector, (el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const rects = [...r.getClientRects()].filter((b) => b.width > 0 && b.height > 0);
    const b = rects.length ? rects[0] : el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.floor(b.left)),
      y: Math.max(0, Math.floor(b.top)),
      width: Math.max(1, Math.ceil(b.width)),
      height: Math.max(1, Math.ceil(b.height)),
    };
  });

  const png = (await page.screenshot({ clip })).toString("base64");

  return page.evaluate(async (b64) => {
    const blob = await (await fetch("data:image/png;base64," + b64)).blob();
    const bmp = await createImageBitmap(blob);
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = cv.getContext("2d");
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    const chan = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    let min = 1, max = 0;
    for (let i = 0; i < d.length; i += 4) {
      const L = 0.2126 * chan(d[i]) + 0.7152 * chan(d[i + 1]) + 0.0722 * chan(d[i + 2]);
      if (L < min) min = L;
      if (L > max) max = L;
    }
    return (max + 0.05) / (min + 0.05);
  }, png);
}

/* Is `sel` actually the topmost thing at its own coordinates, or is the
   photograph sitting on it? Precisely what bug (1) got wrong, and no CSS
   property answers it alone — z-index only means anything within a stacking
   context. Hit testing does answer it, and it answers a second question at
   the same time: a veil that fails this is also not intercepting the clicks
   it is covering. */
async function paintsAbovePhotograph(page, selector) {
  return page.$eval(selector, (el) => {
    const b = el.getBoundingClientRect();
    const pts = [
      [b.left + b.width * 0.5, b.top + b.height * 0.5],
      [b.left + b.width * 0.25, b.top + b.height * 0.5],
      [b.left + b.width * 0.75, b.top + b.height * 0.5],
    ];
    return pts.every(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === el || el.contains(hit));
    });
  });
}

/* ------------------------------------------------------------------ *
 * flow
 * ------------------------------------------------------------------ */

function stallTryOn(page) {
  // The real call takes ~16s. Never fulfilling holds that state still.
  return page.route("**/api/tryon", () => {});
}

function serveLook(page, delayMs = 0) {
  return page.route("**/api/tryon", async (route) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ imageUrl: LOOK_URL }),
    });
  });
}

/* The full shopper path, with a real file off disk. Both dialogs animate in
   over ~0.4s, so wait for the settled `in` class or clicks land on a moving
   target; the real <input> is hidden behind a styled .box, so tick the label. */
async function walkToStudio(page) {
  await page.goto("/virtual-try-on.html");
  await page.locator("[data-open-studio]").first().click();

  await expect(page.locator("#cScrim")).toHaveClass(/\bin\b/);
  await page.locator("label.chk", { has: page.locator("#c1") }).locator(".box").click();
  await page.locator("label.chk", { has: page.locator("#c2") }).locator(".box").click();
  await expect(page.locator("#cGo")).toBeEnabled();
  await page.locator("#cGo").click();

  await expect(page.locator("#uScrim")).toHaveClass(/\bin\b/);
  await page.locator("#uFile").setInputFiles(PHOTO);

  await expect(page.locator("#scrim")).toHaveClass(/\bin\b/, { timeout: 15_000 });
}

const settle = (page) => page.waitForTimeout(900); // transitions are .4–.7s

/* ------------------------------------------------------------------ *
 * tests
 * ------------------------------------------------------------------ */

test.describe("fitting-room loading state", () => {
  test("tells the shopper it is working, inside the frame", async ({ page }) => {
    await stallTryOn(page);
    await walkToStudio(page);
    await expect(page.locator("#stage")).toHaveClass(/loading/);
    await settle(page);

    const status = page.locator(STATUS);
    await expect(status, "the frame carries no status of its own — a shopper stares at an empty rectangle for ~16s").toHaveCount(1);
    await expect(status).toBeVisible();
    await expect(status).not.toBeEmpty();
  });

  test("that status is readable on a cold frame", async ({ page }) => {
    await stallTryOn(page);
    await walkToStudio(page);
    await expect(page.locator("#stage")).toHaveClass(/loading/);
    await settle(page);

    const ratio = await renderedContrast(page, STATUS);
    expect(ratio, `rendered contrast ${ratio.toFixed(2)}:1 — below the 4.5:1 needed for text this small`)
      .toBeGreaterThanOrEqual(4.5);
  });

  test("that status is readable over the previous look", async ({ page }) => {
    /* The original bug in its exact shape: a look is already on screen, the
       shopper picks another, and the status text lands on live photography. */
    await serveLook(page);
    await walkToStudio(page);
    await expect(page.locator("#look")).toHaveClass(/\bin\b/, { timeout: 15_000 });
    await settle(page);

    await page.unroute("**/api/tryon");
    await stallTryOn(page);
    await page.locator(".rail .card, .rail [data-slug]").nth(1).click();
    await expect(page.locator("#stage")).toHaveClass(/loading/);
    await settle(page);

    expect(await paintsAbovePhotograph(page, STATUS),
      "the status is painted underneath the photograph — this is the original bug").toBe(true);

    const ratio = await renderedContrast(page, STATUS);
    expect(ratio, `rendered contrast over the outgoing look: ${ratio.toFixed(2)}:1`)
      .toBeGreaterThanOrEqual(4.5);
  });

  test("the frame is not left blank while it waits", async ({ page }) => {
    /* A cold stage is #eceae7 edge to edge. Whatever the treatment is, the
       frame has to carry some mark of activity, or it reads as failed. */
    await stallTryOn(page);
    await walkToStudio(page);
    await expect(page.locator("#stage")).toHaveClass(/loading/);
    await settle(page);

    /* Sample the middle of the frame only. The full rect would pass on the
       expand button and the rounded-corner antialiasing alone, which is not
       what "the frame shows something" means. */
    const clip = await page.$eval("#stage", (el) => {
      const b = el.getBoundingClientRect();
      return { x: Math.floor(b.x + b.width * 0.2), y: Math.floor(b.y + b.height * 0.2),
               width: Math.floor(b.width * 0.6), height: Math.floor(b.height * 0.6) };
    });
    const png = (await page.screenshot({ clip })).toString("base64");
    const distinct = await page.evaluate(async (b64) => {
      const blob = await (await fetch("data:image/png;base64," + b64)).blob();
      const bmp = await createImageBitmap(blob);
      const cv = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = cv.getContext("2d");
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 4) {
        seen.add((d[i] >> 3 << 10) | (d[i + 1] >> 3 << 5) | (d[i + 2] >> 3));
      }
      return seen.size;
    }, png);

    expect(distinct, `the waiting frame renders ${distinct} distinct tones — it is a blank rectangle`)
      .toBeGreaterThan(8);
  });

  test("the treatment clears completely once the look lands", async ({ page }) => {
    await serveLook(page);
    await walkToStudio(page);
    await expect(page.locator("#look")).toHaveClass(/\bin\b/, { timeout: 15_000 });
    await expect(page.locator("#stage")).not.toHaveClass(/loading/);
    await settle(page);

    await expect(page.locator(STATUS)).toBeHidden();
    await expect(page.locator("#lookLabel .rest")).toBeVisible();
    expect(await page.$eval("#look", (el) => getComputedStyle(el).filter))
      .toBe("none");
  });

  test("the ?fitting capture hook reaches the same state", async ({ page }) => {
    await stallTryOn(page);
    await page.goto("/virtual-try-on.html?fitting=1");
    await expect(page.locator("#stage")).toHaveClass(/loading/, { timeout: 15_000 });
    await settle(page);

    const ratio = await renderedContrast(page, STATUS);
    expect(ratio, `capture-hook contrast ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});
