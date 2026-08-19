/* Walks the real shopper flow at phone sizes and reports layout breakage.

   Checks the two failures that actually matter on a phone: the page scrolling
   sideways, and anything sitting outside the viewport. Both are invisible at
   desktop width, which is where every screenshot so far has been taken. */
const { chromium, devices } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "https://muse.fashion/barcelino";
const OUT = process.env.OUT || "/tmp/mobile";
const PHOTO = path.join(process.env.HOME, "Downloads", "linkedinPFP.jpeg");
const LOOK = "data:image/jpeg;base64," + fs.readFileSync(path.join(
  __dirname, "..", "sites", "barcelino", "assets", "catalog",
  "1225-jkt-100-silk.jpg")).toString("base64");

const SIZES = [
  { name: "iphone-se",     width: 375, height: 667 },
  { name: "iphone-14",     width: 390, height: 844 },
  { name: "iphone-pro-max",width: 430, height: 932 },
  { name: "android-small", width: 360, height: 800 },
];

/* Anything wider than the viewport, or hanging off either edge. A few px of
   slop avoids flagging sub-pixel rounding on borders. */
async function overflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad = [];
    for (const el of document.querySelectorAll("body *")) {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || !el.offsetParent && s.position !== "fixed") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 2 || r.left < -2) {
        bad.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : "." + String(el.className).split(" ")[0]}`
                 + ` [${Math.round(r.left)}..${Math.round(r.right)}]`);
      }
    }
    return {
      pageScrollsSideways:
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: vw,
      offenders: [...new Set(bad)].slice(0, 6),
    };
  });
}

const shot = (page, size, step) =>
  page.screenshot({ path: `${OUT}/${size.name}-${step}.png`, fullPage: false });

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  let problems = 0;

  for (const size of SIZES) {
    const ctx = await browser.newContext({
      ...devices["iPhone 13"],
      viewport: { width: size.width, height: size.height },
      isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    // Never spend a generation for a layout audit.
    await page.route("**/api/tryon", (route) =>
      route.fulfill({ status: 200, contentType: "application/json",
                      body: JSON.stringify({ data: { imageUrl: LOOK }, imageUrl: LOOK }) }));

    const report = async (step) => {
      const o = await overflow(page);
      const bad = o.pageScrollsSideways || o.offenders.length;
      if (bad) problems++;
      console.log(
        `  ${size.name.padEnd(15)} ${step.padEnd(10)} ` +
        (bad ? `BREAKS  scroll ${o.scrollWidth}>${o.clientWidth}  ${o.offenders.join(", ")}`
             : "ok"));
      await shot(page, size, step);
    };

    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await report("landing");

    await page.locator("[data-open-studio]").first().click();
    await page.locator("#cScrim.in").waitFor({ timeout: 15000 });
    await report("consent");

    await page.locator("label.chk", { has: page.locator("#c1") }).locator(".box").click();
    await page.locator("label.chk", { has: page.locator("#c2") }).locator(".box").click();
    await page.locator("#cGo").click();
    await page.locator("#uScrim.in").waitFor({ timeout: 15000 });
    await report("upload");

    await page.locator("#uFile").setInputFiles(PHOTO);
    await page.locator("#scrim.in").waitFor({ timeout: 20000 });
    await page.waitForTimeout(700);
    await report("studio");

    await page.locator("#look.in").waitFor({ timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(900);
    await report("result");

    await ctx.close();
  }

  await browser.close();
  console.log(problems ? `\n${problems} step(s) with layout problems` : "\nno layout problems found");
})();
