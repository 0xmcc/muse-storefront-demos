/* Capture harness. Walks the real shopper path with a photo off disk, holds
   the generation call open, and photographs the fitting state.

   Usage: node capture.js <out.png> [--rest | --over] [--variant=NAME] [--crop]
     (default) cold frame, first look generating
     --rest    a look landed, treatment cleared
     --over    a look is on the frame and the next one is generating
     --crop    photograph the frame alone rather than the whole studio
     --variant one of the treatments in VARIANTS below, applied as a stylesheet
               override so alternatives can be compared without editing the
               page. `soft` is what the page actually ships.

   Prints the WCAG contrast of the status line as rendered, which is the number
   the choice between treatments should turn on.
   Assumes `python3 -m http.server 8799 --directory ../sites/barcelino` is up. */
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const OUT = process.argv[2] || "fitting.png";
const OVER = process.argv.includes("--over");   // status over an existing look
const REST = process.argv.includes("--rest") || OVER;
const CROP = process.argv.includes("--crop");
const VARIANT = (process.argv.find((a) => a.startsWith("--variant=")) || "")
  .split("=")[1] || "soft";

const PHOTO = path.join(process.env.HOME, "Downloads", "linkedinPFP.jpeg");
/* Stand-in for a generated look, so the settled frame photographs like the
   real thing rather than a flat placeholder. */
const LOOK =
  "data:image/jpeg;base64," +
  fs.readFileSync(path.join(__dirname, "..", "sites", "barcelino",
      "assets", "catalog", "1041-bermuda-seersucker.jpg")).toString("base64");

/* The rejected treatments, kept so the comparison that chose `soft` can be
   re-run without editing the page. Each strips the shipping wash first, so a
   variant is a clean swap rather than a stack of leftovers.

   Measured on 2026-08-17, cold frame / over a look:
     soft   15.71 / 15.84   ships
     plate  11.62 / 12.31   safe, but a black box in a boutique
     veil    6.87 /  8.53   good over photography, a slab when empty
     bare    2.61 /  3.62   the transparent version — this was the bug */
const STRIP = `
  .fitting{background:none;-webkit-backdrop-filter:none;backdrop-filter:none}
  .fitting .mark{background:none;box-shadow:none;padding:0;
    -webkit-backdrop-filter:none;backdrop-filter:none}
  .fitting p{color:#fff}
  .fitting .sweep{background:rgba(255,255,255,.24)}`;

const VARIANTS = {
  /* Shipping: the frame washes to the panel's cream, status set in ink. */
  soft: "",

  /* Dark plate behind the text only, light wash over the frame. */
  plate: STRIP + `
    .fitting{background:rgba(247,245,242,.42)}
    .fitting .mark{padding:21px 30px 19px;border-radius:3px;
      background:rgba(24,22,20,.84);
      -webkit-backdrop-filter:blur(6px) saturate(.85);backdrop-filter:blur(6px) saturate(.85);
      box-shadow:0 10px 34px rgba(0,0,0,.16)}`,

  /* Full-frame dark scrim, text straight on it. */
  veil: STRIP + `
    .fitting{background:rgba(24,22,20,.68);
      -webkit-backdrop-filter:blur(3px) saturate(.9);backdrop-filter:blur(3px) saturate(.9)}`,

  /* No backdrop at all — white text carried by a shadow, over whatever the
     frame happens to be showing. */
  bare: STRIP + `
    .fitting p{text-shadow:0 1px 20px rgba(0,0,0,.8),0 0 4px rgba(0,0,0,.55)}`,
};

if (!(VARIANT in VARIANTS)) {
  console.error(`unknown variant "${VARIANT}" — try: ${Object.keys(VARIANTS).join(", ")}`);
  process.exit(1);
}

/* Same measurement the spec uses: screenshot the text's own line box and
   compare luminance extremes inside it. */
async function renderedContrast(page, selector) {
  const clip = await page.$eval(selector, (el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const rects = [...r.getClientRects()].filter((b) => b.width > 0 && b.height > 0);
    const b = rects.length ? rects[0] : el.getBoundingClientRect();
    return { x: Math.max(0, Math.floor(b.left)), y: Math.max(0, Math.floor(b.top)),
             width: Math.max(1, Math.ceil(b.width)), height: Math.max(1, Math.ceil(b.height)) };
  });
  const png = (await page.screenshot({ clip })).toString("base64");
  return page.evaluate(async (b64) => {
    const blob = await (await fetch("data:image/png;base64," + b64)).blob();
    const bmp = await createImageBitmap(blob);
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = cv.getContext("2d");
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    const chan = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    let min = 1, max = 0;
    for (let i = 0; i < d.length; i += 4) {
      const L = 0.2126 * chan(d[i]) + 0.7152 * chan(d[i + 1]) + 0.0722 * chan(d[i + 2]);
      if (L < min) min = L;
      if (L > max) max = L;
    }
    return (max + 0.05) / (min + 0.05);
  }, png);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

  await page.route("**/api/tryon", (route) => {
    if (REST) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ imageUrl: LOOK }),
      });
    }
    /* left hanging — the loading state, held still */
  });

  await page.goto("http://127.0.0.1:8799/virtual-try-on.html");
  if (VARIANTS[VARIANT]) await page.addStyleTag({ content: VARIANTS[VARIANT] });

  await page.locator("[data-open-studio]").first().click();
  await page.locator("#cScrim.in").waitFor();
  await page.locator("label.chk", { has: page.locator("#c1") }).locator(".box").click();
  await page.locator("label.chk", { has: page.locator("#c2") }).locator(".box").click();
  await page.locator("#cGo").click();
  await page.locator("#uScrim.in").waitFor();
  await page.locator("#uFile").setInputFiles(PHOTO);
  await page.locator("#scrim.in").waitFor({ timeout: 15000 });
  await page.waitForTimeout(1400); // let the crossfade settle

  /* The case the original bug was about: a look is already on the frame and
     the shopper picks another, so the status lands on live photography. */
  if (OVER) {
    await page.locator("#look.in").waitFor({ timeout: 15000 });
    await page.unroute("**/api/tryon");
    await page.route("**/api/tryon", () => {});
    await page.locator(".rail [data-slug]").nth(1).click();
    await page.locator("#stage.loading").waitFor();
    await page.waitForTimeout(1400);
  }

  let clip;
  if (CROP) {
    clip = await page.$eval("#stage", (el) => {
      const b = el.getBoundingClientRect();
      return { x: Math.floor(b.x), y: Math.floor(b.y),
               width: Math.floor(b.width), height: Math.floor(b.height) };
    });
  }

  const loading = (await page.locator("#stage").getAttribute("class")).includes("loading");
  const ratio = loading ? await renderedContrast(page, "#stage [data-fitting-status]") : null;

  await page.screenshot({ path: OUT, ...(clip ? { clip } : {}) });
  console.log(
    `${VARIANT.padEnd(6)} ${(OVER ? "over-look" : REST ? "at-rest" : "cold-frame").padEnd(11)}` +
    `${ratio ? ratio.toFixed(2).padStart(6) + ":1" : "       —"}  ${OUT}`
  );
  await browser.close();
})();
