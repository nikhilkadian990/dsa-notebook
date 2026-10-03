import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// ai.js pulls in the Firebase SDK (browser-only) at import time. Register a
// loader that stubs those remote modules so the pure helpers run under Node.
register(pathToFileURL("./test/fb-stub.mjs").href);

const { parseQA, noteContext, sessionContext } = await import("../public/js/ai.js");

test("parseQA reads the strict Q:/A: format", () => {
  const out = parseQA("Q: Why move the right pointer?\nA: Because the sum is too large.\n\nQ: What invariant holds?\nA: The window always contains a valid candidate.");
  assert.equal(out.length, 2);
  assert.equal(out[0].q, "Why move the right pointer?");
  assert.equal(out[0].a, "Because the sum is too large.");
  assert.equal(out[1].q, "What invariant holds?");
});

test("parseQA tolerates bold markers and colons", () => {
  const out = parseQA("**Q:** What is the time complexity?\n**A:** O(n) — one pass over the array.");
  assert.equal(out.length, 1);
  assert.match(out[0].q, /time complexity/);
  assert.match(out[0].a, /O\(n\)/);
});

test("parseQA returns nothing for unstructured output", () => {
  assert.deepEqual(parseQA("Here are some questions about arrays."), []);
});

test("noteContext includes the title, tags and knowledge state", () => {
  const ctx = noteContext({
    name: "TwoSum.md", group: "DSA", tags: ["hashing", "two-pointers"],
    meta: { difficulty: "Easy", strength: "familiar" },
    blocks: [
      { t: "h", v: "Two Sum", l: 2 },
      { t: "text", v: "Use a hash map of value to index." },
      { t: "code", v: "int[] twoSum(int[] a){}", lang: "java" },
    ],
  });
  assert.match(ctx, /# Two Sum/);
  assert.match(ctx, /tags: #hashing #two-pointers/);
  assert.match(ctx, /knowledge: Getting Familiar/);
  assert.match(ctx, /```java/);
});

test("sessionContext lists knowledge states and review history", () => {
  const ctx = sessionContext([{
    name: "A.md", tags: ["sliding-window"], group: "DSA",
    meta: { strength: "learning", status: "solved" },
    reviews: [{ at: 1759000000000 }],
    mistakes: [{ what: "off by one" }],
  }]);
  assert.match(ctx, /tags: #sliding-window/);
  assert.match(ctx, /knowledge: Learning/);
  assert.match(ctx, /last reviewed: \d{4}-\d{2}-\d{2}/);
  assert.match(ctx, /mistakes logged: 1/);
});
