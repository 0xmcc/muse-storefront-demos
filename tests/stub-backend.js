/* A stand-in for muse-backend, so the prompt-capture path can be tested
   without a Gemini call.

   The real /api/outfits/tryon assembles the full prompt server-side and (with
   x-include-prompt) returns it alongside the image. This returns a recognisable
   prompt and a 1x1 PNG so serve.py's capture-and-store behaviour is exercised
   for real rather than mocked out. */
const http = require("http");

const PORT = Number(process.env.PORT || 8797);
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let notes = "";
    try { notes = (JSON.parse(body || "{}").notes) || ""; } catch {}

    const assembled =
      "STUB MASTER DIRECTIVE\n\nCRITICAL IDENTITY RULES:\n- preserve the face\n\n" +
      "THE OUTFIT:\n- Jacket: Beige Blue Silk Jacket (see reference image 1)\n\n" +
      "STYLING RULES:\n- product fidelity\n" +
      (notes ? `\nExtra styling notes: ${notes}. Honor these where reasonable.\n` : "") +
      "\nThe FIRST image is the person.";

    // Mirrors the real route: an authored template replaces the assembly
    // entirely, with the per-request slots substituted here.
    let authored = "";
    try { authored = (JSON.parse(body || "{}").promptTemplate) || ""; } catch {}
    const items = "- Jacket: Beige Blue Silk Jacket (see reference image 1)";
    const imageInstruction = "The FIRST image is the person.";
    const sent = authored.trim()
      ? authored.replaceAll("{{ITEMS}}", items).replaceAll("{{IMAGE_INSTRUCTION}}", imageInstruction)
      : assembled;
    const offered = assembled
      .replace(items, "{{ITEMS}}")
      .replace(imageInstruction, "{{IMAGE_INSTRUCTION}}");

    const payload = { data: { imageUrl: "data:image/png;base64," + PNG } };
    // Only when asked, mirroring the real backend's opt-in header.
    if (req.headers["x-include-prompt"]) {
      payload.data.prompt = sent;
      payload.data.promptTemplate = offered;
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  });
}).listen(PORT, "127.0.0.1", () => console.log("stub backend on " + PORT));
