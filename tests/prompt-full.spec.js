// @ts-check
const { test, expect } = require("@playwright/test");

/* Showing the prompt that is actually sent.

   The panel first shipped showing only the `notes` field, which is a fraction
   of the real thing. What Gemini receives is assembled in muse-backend: a
   master directive with the identity rules, the item list, the styling and
   product-fidelity rules, and only then the notes — wrapped in "Honor these
   where reasonable". Reading the notes box and believing it was the prompt is
   how you end up editing the weakest line in it.

   The rule these tests enforce: the demo NEVER reconstructs that text itself.
   A hand-copied master directive would drift from the backend the first time
   anyone edited it and would then be a confident lie. It has to arrive from
   whatever actually built it, and be shown as captured rather than as live. */

const API = "http://127.0.0.1:8798";
const BRAND = "barcelino";
const KEY = "test-studio-key-do-not-ship-0000000000";
const AUTH = { "x-studio-key": KEY };

const GARMENT = "assets/catalog/1225-jkt-100-silk.jpg";

async function generate(request) {
  const res = await request.post(`${API}/${BRAND}/api/tryon`, {
    data: { garment: GARMENT, name: "Beige Blue Silk Jacket", category: "Jacket" },
  });
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

test.describe("the full prompt", () => {
  test("is captured from the backend after a generation", async ({ request }) => {
    await generate(request);

    const store = await (await request.get(`${API}/${BRAND}/api/prompt`, { headers: AUTH })).json();
    expect(store.lastSent, "the assembled prompt must be recorded").toBeTruthy();
    expect(typeof store.lastSent.text).toBe("string");
    expect(store.lastSent.text.length).toBeGreaterThan(80);
    expect(Date.parse(store.lastSent.at), "capture time must be real").not.toBeNaN();
  });

  test("contains the parts the demo never wrote itself", async ({ request }) => {
    await generate(request);
    const store = await (await request.get(`${API}/${BRAND}/api/prompt`, { headers: AUTH })).json();

    /* These come from the backend, not from anything in this repo. If the demo
       started synthesising the prompt locally, it could not produce them. */
    expect(store.lastSent.text).toContain("MASTER DIRECTIVE");
    expect(store.lastSent.text).toContain("THE OUTFIT");
    expect(store.lastSent.text).toContain("STYLING RULES");
  });

  test("shows where the editable notes land inside it", async ({ request }) => {
    const notes = "unmistakable marker " + Date.now();
    await request.post(`${API}/${BRAND}/api/prompt`, {
      headers: AUTH, data: { label: "marker", notes, activate: true },
    });
    await generate(request);

    const store = await (await request.get(`${API}/${BRAND}/api/prompt`, { headers: AUTH })).json();
    expect(store.lastSent.text).toContain(notes);
    /* The hedge matters: it is why strengthening identity wording in the notes
       box is weaker than it looks. */
    expect(store.lastSent.text).toContain("Honor these where reasonable");
  });

  test("is not exposed without the studio key", async ({ request }) => {
    await generate(request);
    const res = await request.get(`${API}/${BRAND}/api/prompt`);
    expect(res.status()).toBe(404);
  });
});

test.describe("the full prompt in the panel", () => {
  const PANEL = "[data-prompt-panel]";
  const OPEN = "[data-prompt-open]";
  const FULL = "[data-prompt-full]";

  test("is shown on screen, loaded with the real wording", async ({ page, request }) => {
    /* Superseded the read-only version of this test. Read-only was my call,
       not a constraint: where the text is assembled should not decide whether
       Marko can edit it. Editability is covered in prompt-template.spec.js;
       what matters here is that the box opens on the genuine prompt. */
    await generate(request);

    await page.route("**/api/tryon", () => {});
    await page.goto(`${API}/${BRAND}/virtual-try-on.html?studio=1&prompt_key=${encodeURIComponent(KEY)}`);
    await expect(page.locator(OPEN)).toBeVisible({ timeout: 15_000 });
    await page.locator(OPEN).click();
    await expect(page.locator(PANEL)).toBeVisible();

    const full = page.locator(FULL);
    await expect(full).toBeVisible();
    await expect(full).toHaveValue(/CRITICAL IDENTITY RULES/);
    await expect(full, "the per-request slot must be visible to edit around")
      .toHaveValue(/\{\{ITEMS\}\}/);
  });

  test("names the notes box for the slot it actually fills", async ({ page, request }) => {
    await generate(request);
    await page.route("**/api/tryon", () => {});
    await page.goto(`${API}/${BRAND}/virtual-try-on.html?studio=1&prompt_key=${encodeURIComponent(KEY)}`);
    await expect(page.locator(OPEN)).toBeVisible({ timeout: 15_000 });
    await page.locator(OPEN).click();

    /* It was labelled "Generation prompt", which is what caused the confusion. */
    await expect(page.locator(PANEL)).not.toContainText("Generation prompt");
    await expect(page.locator(PANEL)).toContainText(/styling notes/i);
  });
});
