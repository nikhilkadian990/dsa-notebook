// Test-only ESM loader: swaps the browser-only fb.js for the in-memory fake so
// the rest of the app runs under Node + jsdom.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const FAKE_FB = readFileSync(new URL("./fake-fb.js", import.meta.url), "utf8");

export async function load(url, _context, nextLoad) {
  if (/\/public\/js\/fb\.js$/.test(url))
    return { format: "module", shortCircuit: true, source: FAKE_FB };
  return nextLoad(url);
}
