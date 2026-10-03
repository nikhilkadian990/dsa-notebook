// Verifies the built dist/ has every relative module specifier versioned, so no
// browser can fall back to a stale immutable-cached copy of an older deploy.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const dir = join(ROOT, "dist", "js");

let scanned = 0;
const bad = [];
for (const f of readdirSync(dir)) {
  const src = readFileSync(join(dir, f), "utf8");
  const re = /(\.\.?\/[A-Za-z0-9_.\-]+\.js)(\?[^"'\s]*)?(?=["'`])/g;
  let m;
  while ((m = re.exec(src))) {
    scanned++;
    if (!m[2]) bad.push(`${f}: ${m[1]}`);
  }
}

const html = readFileSync(join(ROOT, "dist", "index.html"), "utf8");
const htmlRefs = [...html.matchAll(/(?:src|href)="([^"]+\.js(?:\?[^"]*)?)"/g)].map((m) => m[1]);
const badHtml = htmlRefs.filter((r) => !r.includes("?v="));

console.log(`scanned ${scanned} relative .js specifiers, ${htmlRefs.length} html js refs`);
if (bad.length || badHtml.length) {
  console.log("UNVERSIONED:\n" + [...bad, ...badHtml].join("\n"));
  process.exit(1);
}
console.log("all module specifiers versioned");
