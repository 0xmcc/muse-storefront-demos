const { chromium, devices } = require("@playwright/test");
const fs = require("fs"); const path = require("path");
const OUT = process.env.OUT || "/tmp/mshots";
const PHOTO = path.join(process.env.HOME, "Downloads", "linkedinPFP.jpeg");
const LOOK = "data:image/jpeg;base64," + fs.readFileSync(path.join(__dirname,"..","sites","barcelino","assets","catalog","1225-jkt-100-silk.jpg")).toString("base64");
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices["iPhone 13"], viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2 });
  const p = await ctx.newPage();
  let hold = true;
  await p.route("**/api/tryon", async (route) => {
    if (hold) return;                       // held open = loading state
    await route.fulfill({ status:200, contentType:"application/json",
      body: JSON.stringify({ imageUrl: LOOK }) });
  });
  await p.goto("https://muse.fashion/barcelino/", { waitUntil:"networkidle" });

  await p.locator("[data-open-studio]").first().click();
  await p.locator("#cScrim.in").waitFor(); await p.waitForTimeout(900);
  await p.screenshot({ path:`${OUT}/1-consent.png` });

  await p.locator("label.chk", { has: p.locator("#c1") }).locator(".box").click();
  await p.locator("label.chk", { has: p.locator("#c2") }).locator(".box").click();
  await p.locator("#cGo").click();
  await p.locator("#uScrim.in").waitFor(); await p.waitForTimeout(900);
  await p.screenshot({ path:`${OUT}/2-upload.png` });

  await p.locator("#uFile").setInputFiles(PHOTO);
  await p.locator("#scrim.in").waitFor({ timeout:20000 }); await p.waitForTimeout(1200);
  await p.screenshot({ path:`${OUT}/3-studio-loading.png` });

  // scroll to the look pane, which is what a shopper came for
  await p.locator("#stage").scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
  await p.screenshot({ path:`${OUT}/4-look-loading.png` });

  hold = false;
  await p.reload();
  await p.locator("#scrim.in").waitFor({ timeout:20000 }).catch(()=>{});
  await p.evaluate(() => { const s=document.getElementById('scrim'); if(s&&!s.classList.contains('show')) document.querySelector('[data-open-studio]')?.click(); });
  await p.waitForTimeout(1500);
  await p.locator("#look.in").waitFor({ timeout:20000 }).catch(()=>{});
  await p.locator("#stage").scrollIntoViewIfNeeded().catch(()=>{});
  await p.waitForTimeout(800);
  await p.screenshot({ path:`${OUT}/5-look-result.png` });

  console.log("done. look visible:", await p.locator("#look.in").count());
  await b.close();
})();
