// Import / export / migration. Markdown in, Markdown or plain text out, plus a
// full-notebook standalone HTML export and one-click migration of the original
// DSANotes.html (so existing notes are never lost in the transition).
import { el, btn, toast, dl, uid } from "./util.js";
import { S, cur, mark, titleOf } from "./state.js";
import { freshNotebook, normalize, save, writeAll } from "./store.js";
import { renderFiles } from "./sidebar.js";

const uniq = (n) => {
  n = (n || "").trim() || "Untitled.md";
  if (!/\.(md|txt)$/i.test(n)) n += ".md";
  const b = n;
  let k = 1;
  while (S.notebooks.some((f) => f.name.toLowerCase() === n.toLowerCase()))
    n = b.replace(/(\.\w+)$/, ` (${k++})$1`);
  return n;
};

/* ---------- markdown -> blocks ---------- */
export function parse(t) {
  const bl = [];
  let buf = [], inFence = false;
  const flush = () => {
    bl.push({ t: "text", v: buf.join("\n").replace(/^\n+|\n+$/g, "") });
    buf = [];
  };
  String(t).replace(/\r\n?/g, "\n").split("\n").forEach((l) => {
    if (/^\s*```/.test(l)) {
      if (!inFence) { flush(); inFence = true; }
      else { flush(); inFence = false; }
      return;
    }
    if (inFence) { buf.push(l); return; }
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
    if (m) { flush(); bl.push({ t: "h", v: m[2], l: m[1].length }); }
    else buf.push(l);
  });
  flush();
  return bl;
}

export async function importFiles(files) {
  let n = 0;
  for (const fl of files) {
    const name = fl.name;
    const text = await fl.text();
    if (/\.html?$/i.test(name)) {
      const got = migrateHtml(text);
      if (got) { n += got; continue; }
    }
    const blocks = parse(text);
    if (!blocks?.length) continue;
    const f = freshNotebook(uniq(name), null);
    f.blocks = blocks;
    S.notebooks.push(f);
    S.cur = f.id;
    save(f);
    n++;
  }
  if (n) {
    renderFiles();
    import("./editor.js").then((e) => e.render());
    import("./app.js").then((m) => m.afterDataChange());
    toast(`Imported ${n} notebook${n > 1 ? "s" : ""}`);
  }
}

/** Pull the embedded JSON out of a legacy DSANotes.html and convert every notebook
 *  it contains. Returns the number of notebooks added, or null if it isn't one. */
export function migrateHtml(html) {
  const m = /<script type="application\/json" id="nb-data">([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  let data;
  try { data = JSON.parse(m[1]); } catch (e) { return null; }
  if (!data?.files?.length) return null;
  let n = 0;
  const groups = Array.isArray(data.groups) ? data.groups : [];
  for (const g of groups) if (!S.folders.includes(g)) S.folders.push(g);
  for (const f of data.files) {
    const nb = normalize({
      id: uid(),
      name: uniq(f.name),
      group: f.g || null,
      tags: f.tags,
      meta: f.meta,
      blocks: (f.blocks || []).map((b) => (b.t === "h" ? { t: "h", v: b.v, l: b.l || 2 } : { ...b })),
    });
    nb.order = nb.createdAt = Date.now() + n;
    S.notebooks.push(nb);
    S.cur = nb.id;
    save(nb);
    n++;
  }
  return n;
}

/* ---------- blocks -> markdown ---------- */
export function toText(nb, o = {}) {
  return (nb.blocks || [])
    .map((b) => {
      if (b.t === "text") return b.v;
      if (b.t === "h") return "#".repeat(b.l || 2) + " " + b.v;
      if (b.t === "code") return "```" + (b.lang || "") + "\n" + b.v + "\n```";
      if (b.t === "img") return o.img ? `![${b.name || "image"}](${b.src})` : null;
      if (b.t === "vis") return o.vis ? "```html\n" + b.code + "\n```" : null;
      return null;
    })
    .filter((x) => x != null && x !== "")
    .join("\n\n") + "\n";
}

export function exportAll(o) {
  const items = S.notebooks.map((f) => ({
    n: f.name.replace(/\.(md|txt)$/i, "") + (o.ext === "txt" ? ".txt" : ".md"),
    t: toText(f, o),
  }));
  for (const it of items) dl(it.n, new Blob([it.t], { type: "text/plain" }));
  toast(`Downloaded ${items.length} file${items.length === 1 ? "" : "s"}`);
}

export function exportDialog() {
  const d = el("dialog", { class: "rd" });
  const md = el("input", { type: "radio", name: "fm", value: "md", checked: true });
  const txt = el("input", { type: "radio", name: "fm", value: "txt" });
  const img = el("input", { type: "checkbox" });
  const vis = el("input", { type: "checkbox", checked: true });
  d.append(
    el("h3", { text: "Export / backup" }),
    el("p", { class: "dim small", text: "One file per notebook. Visuals export as fenced ```html blocks; images are embedded only if you tick them (large files)." }),
    el("label", { class: "mfld" }, md, el("span", { text: "Markdown (.md)" })),
    el("label", { class: "mfld" }, txt, el("span", { text: "Plain text (.txt)" })),
    el("label", { class: "mfld" }, img, el("span", { text: "Include images (embedded data URIs)" })),
    el("label", { class: "mfld" }, vis, el("span", { text: "Include visual source code" })),
    el("div", { class: "row" },
      el("span", { class: "sp" }),
      btn("Download standalone copy of this notebook (.html)", () => { d.close(); standaloneHtml(); }, "b sm"),
    ),
    el("div", { class: "row" },
      el("span", { class: "sp" }),
      btn("Cancel", () => d.close()),
      btn("Export all notebooks", () => {
        exportAll({ ext: txt.checked ? "txt" : "md", img: img.checked, vis: vis.checked });
        d.close();
      }, "b pri"),
    ),
  );
  document.body.append(d);
  d.showModal();
  d.addEventListener("close", () => d.remove());
}

/** A self-contained copy of the current notebook that works offline, forever. */
export function standaloneHtml() {
  const f = cur();
  if (!f) return;
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${(f.name || "notebook").replace(/</g, "&lt;")}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><pre style="font:14px/1.6 Consolas,monospace;background:#0a100e;color:#dbe6df;padding:24px;white-space:pre-wrap">${esc(toText(f, { img: true, vis: true }))}</pre></body></html>`;
  dl((f.name || "notebook").replace(/\.(md|txt)$/i, "") + ".html", new Blob([html], { type: "text/html" }));
  toast("Downloaded a standalone copy of this notebook");
}
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
