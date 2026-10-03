#!/usr/bin/env node
// Cache-busting build: copies public/ → dist/ and stamps a content-hash query
// onto every ES module specifier and every <script>/<link> reference.
//
// Firebase Hosting caches JS/CSS aggressively. Before this build, files were
// served as `immutable` for a year, so a browser that loaded the app once would
// keep running stale modules after a deploy and never notice. Because the app
// loads plain ES modules by relative path (no bundler), the version has to be
// stamped on every specifier — versioning only the entry <script> would leave
// the statically-imported children pointing at their old cached URLs.

import { createHash } from "node:crypto";
import {
  cpSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  rmSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "public");
const OUT = join(ROOT, "dist");

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });

// Deterministic per commit: same deploy content ⇒ same version, so repeat
// deploys of identical code stay cacheable.
let rev = "local";
try {
  rev = execSync("git rev-parse --short=10 HEAD", { cwd: ROOT }).toString().trim();
} catch {
  rev = String(Date.now());
}

// Stable map of a specifier to its versioned form, so shared deps reuse one URL.
const stamp = (spec) => {
  const [base, q] = spec.split("?");
  return q ? spec : `${base}?v=${rev}`;
};

// Rewrite relative module specifiers inside a JS file, e.g. "./util.js".
// Covers static `import/export ... from "./x.js"` and dynamic `import("./x.js")`.
const versionJs = (src) =>
  src.replace(
    /((?:import|export)(?:[\s\S]*?\sfrom\s*)?["']|import\(["'])(\.\/[^"']+\.js)(["'])/g,
    (m, pre, spec, post) => `${pre}${stamp(spec)}${post}`
  );

// Rewrite absolute asset references in HTML, e.g. "/js/app.js" and "/styles.css".
const versionHtml = (src) =>
  src.replace(/((?:src|href)=[""])(\/[^""]+\.(?:js|css|svg|woff2))([""])/g, (m, pre, ref, post) =>
    `${pre}${stamp(ref)}${post}`);

cpSync(SRC, OUT, { recursive: true });

const walk = (dir) => {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) {
      walk(p);
    } else if (extname(name.name) === ".js") {
      const f = join(dir, name.name);
      writeFileSync(f, versionJs(readFileSync(f, "utf8")));
    } else if (name.name.endsWith(".html")) {
      const f = join(dir, name.name);
      writeFileSync(f, versionHtml(readFileSync(f, "utf8")));
    }
  }
};

walk(OUT);

// Report what changed so a deploy is auditable.
const idx = readFileSync(join(OUT, "index.html"), "utf8");
const refs = [...idx.matchAll(/(?:src|href)=[""]\/[^""]+[""]/g)].map((m) => m[0]);
console.log(`build: rev ${rev} → dist/`);
console.log(refs.join("\n"));
