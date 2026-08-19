// @ts-check
const { test, expect } = require("@playwright/test");

/* Version-controlled edits to the WHOLE prompt, not just the notes fragment.

   The first cut let you edit `notes` and version that, while the rest of the
   prompt — the identity rules, the styling rules, the master directive — was
   read-only because it was assembled in muse-backend. That is an
   implementation detail deciding what Marko is allowed to change, which is
   backwards. Where the text happens to live should not determine whether it
   can be edited and rolled back.

   So a version can now carry a full `template`. When one is live, it replaces
   the backend's assembly entirely.

   The one thing a template cannot freeze is the per-request content: the
   garment line changes with every product, and the instruction about which
   image is which depends on how many product photos actually attached. Those
   stay as {{ITEMS}} and {{IMAGE_INSTRUCTION}} placeholders, substituted at
   generation time. Everything else is the author's. */

const API = "http://127.0.0.1:8798";
const BRAND = "barcelino";
const KEY = "test-studio-key-do-not-ship-0000000000";
const AUTH = { "x-studio-key": KEY };
const GARMENT = "assets/catalog/1225-jkt-100-silk.jpg";

const uniq = (s) => `${s} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const get = async (request) =>
  (await request.get(`${API}/${BRAND}/api/prompt`, { headers: AUTH })).json();

async function generate(request) {
  const res = await request.post(`${API}/${BRAND}/api/tryon`, {
    data: { garment: GARMENT, name: "Beige Blue Silk Jacket", category: "Jacket" },
  });
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

async function saveTemplate(request, template, { label, activate } = {}) {
  const res = await request.post(`${API}/${BRAND}/api/prompt`, {
    headers: AUTH,
    data: { label: label || uniq("tpl"), template, activate: activate !== false },
  });
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

test.describe("editing the whole prompt", () => {
  test("offers the real assembled prompt as a starting point", async ({ request }) => {
    /* You cannot meaningfully edit a prompt you have to retype from a
       screenshot. Version one of a template has to start from the actual
       thing, placeholders already in place. */
    await generate(request);
    const store = await get(request);

    expect(store.capturedTemplate, "a template to start from").toBeTruthy();
    expect(store.capturedTemplate).toContain("CRITICAL IDENTITY RULES");
    expect(store.capturedTemplate).toContain("{{ITEMS}}");
    /* The concrete garment must NOT be baked in, or every look would be a
       Beige Blue Silk Jacket. */
    expect(store.capturedTemplate).not.toContain("Beige Blue Silk Jacket");
  });

  test("a saved template is versioned like anything else", async ({ request }) => {
    const before = await get(request);
    const a = await saveTemplate(request, "TEMPLATE A\n{{ITEMS}}", { label: uniq("A") });
    const b = await saveTemplate(request, "TEMPLATE B\n{{ITEMS}}", { label: uniq("B") });

    const after = await get(request);
    expect(after.versions.length).toBe(before.versions.length + 2);
    expect(after.active).toBe(b.id);

    /* Roll back and the earlier wording must come back exactly. */
    const res = await request.post(`${API}/${BRAND}/api/prompt/activate`, {
      headers: AUTH, data: { id: a.id },
    });
    expect(res.status()).toBe(200);
    const rolled = await get(request);
    expect(rolled.versions.find((v) => v.id === a.id).template).toBe("TEMPLATE A\n{{ITEMS}}");
  });

  test("the live template is what actually gets sent", async ({ request }) => {
    const marker = uniq("SENTINEL");
    await saveTemplate(request, `${marker}\n\n{{ITEMS}}\n\n{{IMAGE_INSTRUCTION}}`);
    await generate(request);

    const store = await get(request);
    expect(store.lastSent.text).toContain(marker);
    /* Proof the backend's own assembly was replaced, not appended to. */
    expect(store.lastSent.text).not.toContain("CRITICAL IDENTITY RULES");
  });

  test("placeholders are filled with the real per-request content", async ({ request }) => {
    await saveTemplate(request, "HEAD\n{{ITEMS}}\nTAIL\n{{IMAGE_INSTRUCTION}}");
    await generate(request);

    const sent = (await get(request)).lastSent.text;
    expect(sent).toContain("Beige Blue Silk Jacket");
    expect(sent, "no placeholder may survive into the real prompt").not.toContain("{{ITEMS}}");
    expect(sent).not.toContain("{{IMAGE_INSTRUCTION}}");
  });

  test("a template with no item slot is refused", async ({ request }) => {
    /* Without it the model is never told which garment to use, and every look
       silently becomes whatever it invents. Better to refuse the save. */
    const res = await request.post(`${API}/${BRAND}/api/prompt`, {
      headers: AUTH,
      data: { label: "no slot", template: "just some words with no placeholder" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/ITEMS/i);
  });

  test("notes-only versions still work", async ({ request }) => {
    /* The existing versions predate templates. Activating one must fall back
       to the backend's own assembly rather than breaking. */
    const notes = uniq("plain notes");
    const v = await (await request.post(`${API}/${BRAND}/api/prompt`, {
      headers: AUTH, data: { label: uniq("legacy"), notes, activate: true },
    })).json();
    expect(v.id).toBeTruthy();

    await generate(request);
    const sent = (await get(request)).lastSent.text;
    expect(sent).toContain("CRITICAL IDENTITY RULES");
    expect(sent).toContain(notes);
  });
});

test.describe("editing the whole prompt in the panel", () => {
  const OPEN = "[data-prompt-open]";
  const PANEL = "[data-prompt-panel]";
  const FULL = "[data-prompt-full]";

  async function openPanel(page) {
    await page.route("**/api/tryon", () => {});
    await page.goto(`${API}/${BRAND}/virtual-try-on.html?studio=1&prompt_key=${encodeURIComponent(KEY)}`);
    await expect(page.locator(OPEN)).toBeVisible({ timeout: 15_000 });
    await page.locator(OPEN).click();
    await expect(page.locator(PANEL)).toBeVisible();
  }

  test("the full prompt is editable, not read-only", async ({ page, request }) => {
    await generate(request);
    await openPanel(page);

    const full = page.locator(FULL);
    await expect(full).toBeVisible();
    const editable = await full.evaluate((el) =>
      el.isContentEditable || ["TEXTAREA", "INPUT"].includes(el.tagName));
    expect(editable, "Marko must be able to edit the whole prompt").toBe(true);
  });

  test("saving from the panel versions the whole prompt", async ({ page, request }) => {
    await generate(request);
    await openPanel(page);

    const before = await page.locator("[data-prompt-version]").count();
    const marker = uniq("PANEL EDIT");
    await page.locator(FULL).fill(`${marker}\n\n{{ITEMS}}`);
    await page.locator("[data-prompt-label]").fill(marker);
    await page.locator("[data-prompt-save]").click();

    await expect(page.locator("[data-prompt-version]")).toHaveCount(before + 1, { timeout: 10_000 });

    const store = await get(request);
    expect(store.versions.some((v) => (v.template || "").includes(marker))).toBe(true);
  });
});
