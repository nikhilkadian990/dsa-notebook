import { test } from "node:test";
import assert from "node:assert/strict";
import { md, hl, code, esc } from "../public/js/md.js";
import { slug, when, DAY, plural } from "../public/js/util.js";

test("escapes html", () => {
  assert.equal(esc("<b>x</b>"), "&lt;b&gt;x&lt;/b&gt;");
});

test("inline markdown: bold, italic, code", () => {
  assert.match(md("**hi**"), /<span class="bd">hi<\/span>/);
  assert.match(md("*hi*"), /<span class="it">hi<\/span>/);
  assert.match(md("`x`"), /<span class="ic">x<\/span>/);
});

test("list markers get a marker class", () => {
  assert.match(md("- item"), /<span class="mk">-<\/span>/);
  assert.match(md("1. item"), /<span class="mk">1\.<\/span>/);
});

test("blockquotes are styled", () => {
  assert.match(md("> quoted"), /<span class="q">/);
});

test("fenced code blocks highlight", () => {
  const out = hl("```java\nint x = 1;\nString s = \"a\";\n```");
  assert.match(out, /class="l c"/);
  assert.match(out, /class="k"/);      // int, String
  assert.match(out, /class="n"/);      // 1
  assert.match(out, /class="s"/);      // "a"
});

test("hash-comment languages use # comments", () => {
  const py = hl("```python\n# comment\nx = 1\n```");
  assert.match(py, /class="m"/); // comment
});

test("markdown inside code fences is not formatted", () => {
  const out = hl("```\n**not bold**\n```");
  assert.ok(!out.includes('class="bd"'));
});

test("highlighter handles empty input", () => {
  // an empty block still renders one (zero-width) line so the mirror keeps its height
  assert.equal(hl(""), '<div class="l">\u200b</div>');
  assert.equal(code("", "java"), "");
});

test("links render as anchors", () => {
  assert.match(md("[text](https://example.com)"), /<a class="lk" data-href="https:\/\/example\.com">/);
  assert.match(md("[note](@nb:abc123)"), /class="lk int"/);
});

test("bold does not swallow a code span (pasted markdown)", () => {
  // **Remember: `count == 0`** must keep its code span styled as code
  const out = md("**Remember:** `count == 0` means choose a new candidate.");
  assert.match(out, /<span class="bd">Remember:<\/span>/);
  assert.match(out, /<span class="ic">count == 0<\/span>/);
});

test("the pasted study-note paragraph renders pretty", () => {
  const out = md(
    "**Remember:** `count == 0` means the current candidate has been completely cancelled. " +
    "The algorithm works because the majority has **more occurrences than all other elements combined**.",
  );
  assert.match(out, /<span class="bd">Remember:<\/span>/);
  assert.match(out, /<span class="ic">count == 0<\/span>/);
  assert.match(out, /<span class="bd">more occurrences than all other elements combined<\/span>/);
  // nothing bold leaked around as literal asterisks
  assert.ok(!/\*/.test(out), "no stray asterisks: " + out);
});

test("code spans do not double-escape ampersands", () => {
  // a && b used to render as "a &amp;&amp; b"
  assert.equal(md("`a && b`"), '<span class="ic">a &amp;&amp; b</span>');
});

test("a bullet star is a marker, not italic", () => {
  assert.match(md("* item"), /<span class="mk">\*<\/span>/);
  assert.ok(!md("* item").includes('class="it"'));
});

test("a stray star in prose stays literal", () => {
  assert.equal(md("5 * 3 = 15"), "5 * 3 = 15");
});

test("styling inside link text stays nested", () => {
  const out = md("[**bold** and `code`](https://example.com)");
  assert.ok(out.includes("<a "), out);
  // the anchor closes after the styled text, with no stray </span> left over
  assert.equal((out.match(/<\/a>/g) || []).length, 1);
  assert.equal((out.match(/<\/span>/g) || []).length, (out.match(/<span/g) || []).length);
});

test("slug is url-safe", () => {
  assert.equal(slug("Two Pointers.md"), "two-pointers");
  assert.equal(slug("DSA/Stacks & Queues.md"), "dsa-stacks-queues");
  assert.equal(slug(""), "untitled");
  assert.equal(slug("!!!"), "note"); // degenerate input still yields a safe slug
});

test("when() labels", () => {
  assert.equal(when(Date.now()), "today");
  assert.equal(when(Date.now() - DAY), "yesterday");
  assert.equal(when(Date.now() - 3 * DAY), "3d ago");
  assert.equal(when(0), "never");
});

test("plural", () => {
  assert.equal(plural(1, "notebook"), "1 notebook");
  assert.equal(plural(2, "notebook"), "2 notebooks");
});
