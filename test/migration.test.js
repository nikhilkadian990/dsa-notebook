import { test } from "node:test";
import assert from "node:assert/strict";

// The legacy migration lives in io.js, which imports browser-only modules, so the
// extraction regex is exercised here against the real DSANotes.html on disk.

import fs from "node:fs";
import path from "node:path";

const HTML = fs.readFileSync(path.join(process.cwd(), "DSANotes.html"), "utf8");

function extract(html) {
  const m = /<script type="application\/json" id="nb-data">([\s\S]*?)<\/script>/.exec(html);
  return m ? JSON.parse(m[1]) : null;
}

test("the original DSANotes.html is still a valid migration source", () => {
  const data = extract(HTML);
  assert.ok(data, "embedded JSON must be found");
  assert.ok(Array.isArray(data.files));
  assert.equal(data.files.length, 1);
  assert.equal(data.files[0].name, "Arrays.md");
  assert.equal(data.files[0].g, "DSA");
  assert.ok(data.files[0].blocks.length > 5, "blocks survive");
  assert.ok(data.files[0].blocks.some((b) => b.t === "h"), "headings survive");
  assert.ok(data.files[0].blocks.some((b) => b.t === "text" && b.v.includes("```java")), "code fences survive");
});

test("markdown round trip keeps headings and code", () => {
  const data = extract(HTML);
  const nb = data.files[0];
  // serialize like io.toText (without images/visuals) then parse like io.parse
  const text = nb.blocks
    .map((b) => (b.t === "text" ? b.v : b.t === "h" ? "#".repeat(b.l || 2) + " " + b.v : null))
    .filter((x) => x != null && x !== "")
    .join("\n\n");

  const blocks = [];
  let buf = [], inFence = false;
  const flush = () => { blocks.push({ t: "text", v: buf.join("\n").trim() }); buf = []; };
  for (const ln of text.split("\n")) {
    if (/^\s*```/.test(ln)) { if (!inFence) { flush(); inFence = true; } else { flush(); inFence = false; } continue; }
    if (inFence) { buf.push(ln); continue; }
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(ln);
    if (m) { flush(); blocks.push({ t: "h", v: m[2], l: m[1].length }); } else buf.push(ln);
  }
  flush();

  const heads = blocks.filter((b) => b.t === "h").map((b) => b.v);
  assert.ok(heads.includes("1.) Maximum consecutive / continuous X"));
  assert.ok(blocks.some((b) => b.t === "text" && b.v.includes("reverse(nums, 0, k-1);")), "java code survives the round trip");
});
