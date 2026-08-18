/* Builds an isolated sites/ tree for the prompt tests to scribble on.

   The prompt API writes prompts.json into the brand folder. Pointing the test
   server at the real sites/ would mean a test run silently rewrites the prompt
   that muse.fashion/barcelino is generating with, so it gets a copy instead —
   and serve.py takes --sites so it can be aimed at one. */
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "sites");
const DEST = path.join(__dirname, ".fixture", "sites");

fs.rmSync(path.join(__dirname, ".fixture"), { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
fs.cpSync(SRC, DEST, { recursive: true });

/* A fixture that shipped with a prompts.json would test the wrong thing: the
   first-run path, where the file does not exist yet and the server has to seed
   it from the built-in house style, is the one that runs in production. */
for (const brand of fs.readdirSync(DEST)) {
  fs.rmSync(path.join(DEST, brand, "prompts.json"), { force: true });
}

console.log("fixture ready:", DEST);
