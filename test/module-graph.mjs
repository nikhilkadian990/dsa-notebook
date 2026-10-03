// Verifies the deployed app's ES module graph fully resolves on the live host:
// walks every static import from index.html's entrypoint and reports any 404s
// or wrong content types. A missing module would blank the whole app, so this is
// the highest-value static check available without a headless browser.

const BASE = process.argv[2] || "https://dsa-notebook-e65d2.web.app";
const seen = new Set();
const problems = [];
let ok = 0;

async function head(url) {
  const res = await fetch(url, { method: "GET" });
  return res;
}

async function walk(url, from) {
  if (seen.has(url)) return;
  seen.add(url);
  const res = await head(url);
  if (!res.ok) {
    problems.push(`${url} — ${res.status} (imported from ${from})`);
    return;
  }
  const ct = res.headers.get("content-type") || "";
  if (url.endsWith(".js") && !/javascript/.test(ct))
    problems.push(`${url} — wrong content type "${ct}"`);
  if (!url.endsWith(".js")) { ok++; return; }
  ok++;
  const src = await res.text();
  // static import specifiers (dynamic import() is handled at runtime, not here)
  const re = /import\s*(?:[\s\S]*?\sfrom\s*)?["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src))) {
    let spec = m[1];
    if (spec.startsWith("http")) await walk(spec, url);
    else if (spec.startsWith("/")) await walk(new URL(spec, BASE).href, url);
    else if (spec.startsWith("./") || spec.startsWith("../"))
      await walk(new URL(spec, url).href, url);
  }
}

await walk(BASE + "/js/app.js", "index.html");

console.log(`checked ${ok} file(s), ${seen.size} unique`);
if (problems.length) {
  console.log("PROBLEMS:\n" + problems.join("\n"));
  process.exitCode = 1;
} else {
  console.log("module graph fully resolves — every import returns 200 with a JS content type");
}
