// Notebook-wide search. Ctrl+F shows results from the current notebook first,
// then every other notebook, with snippets; Enter/Shift+Enter walks the list.
import { $, el, toast } from "./util.js";
import { S, cur, nbById, plainText, titleOf } from "./state.js";

let M = [], mi = -1, panel = null;

function matchAll(hay, q) {
  const out = [];
  const h = hay.toLowerCase();
  for (let p = h.indexOf(q); p >= 0; p = h.indexOf(q, p + q.length)) out.push(p);
  return out;
}

function snippet(text, p, q) {
  const a = Math.max(0, p - 40), b = Math.min(text.length, p + q.length + 60);
  const line = text.slice(a, b).replace(/\n+/g, "  ");
  return (a > 0 ? "… " : "") + line + (b < text.length ? " …" : "");
}

function blockOffset(nb, blockIdx) {
  let off = 0;
  for (let i = 0; i < blockIdx; i++) {
    const b = nb.blocks[i];
    off += ((b.t === "text" || b.t === "code" ? b.v : b.t === "h" ? b.v : "") || "").length + 1;
  }
  return off;
}

export function runSearch(query) {
  const q = (query ?? $("#sq")?.value ?? "").trim().toLowerCase();
  M = [];
  if (!q) { renderPanel(); return 0; }
  const f = cur();
  const seen = new Set();
  // 1) current notebook first
  if (f) { seen.add(f.id); searchNotebook(f, q); }
  // 2) then the rest, most recently edited first
  const others = S.notebooks
    .filter((x) => !seen.has(x.id))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  for (const nb of others) searchNotebook(nb, q);
  mi = M.length ? 0 : -1;
  renderPanel();
  return M.length;
}

function searchNotebook(nb, q) {
  nb.blocks.forEach((b, i) => {
    if (b.t !== "text" && b.t !== "code" && b.t !== "h") return;
    const v = b.v || "";
    for (const p of matchAll(v, q))
      M.push({ nb: nb.id, i, p, n: q.length, snippet: snippet(v, p, q.length), here: nb.id === S.cur });
  });
  // tag hits count too
  if ((nb.tags || []).some((t) => t.toLowerCase().includes(q)))
    M.push({ nb: nb.id, i: -1, p: 0, n: q.length, snippet: "tagged #" + nb.tags.filter((t) => t.toLowerCase().includes(q)).join(" #"), here: nb.id === S.cur });
}

function renderPanel() {
  const box = $("#sresults");
  if (!box) return;
  box.replaceChildren();
  if (!M.length) {
    box.append(el("div", { class: "sr-empty", text: $("#sq")?.value ? "No matches anywhere in this notebook collection." : "Start typing to search every notebook — headings, text, code and tags." }));
    return;
  }
  const here = M.filter((m) => m.here), other = M.filter((m) => !m.here);
  const group = (label, arr) => {
    if (!arr.length) return;
    box.append(el("div", { class: "sr-head", text: label }));
    arr.forEach((m, k) => {
      const n = nbById(m.nb);
      const idx = M.indexOf(m);
      box.append(el("div", {
        class: "sr" + (idx === mi ? " on" : ""),
        onclick: () => { mi = idx; goto(m); },
      },
        el("div", { class: "sr-title", text: (n ? titleOf(n) : "?") + (m.here ? "" : "  ·  " + (n ? n.name : "")) }),
        el("div", { class: "sr-snip", text: m.snippet }),
      ));
    });
  };
  group("In this notebook", here);
  group("Other notebooks", other);
  const sc = $("#scount");
  if (sc) sc.textContent = M.length ? `${Math.min(mi + 1, M.length)}/${M.length}` : "0/0";
}

function goto(m) {
  const n = nbById(m.nb);
  if (!n) return;
  const after = () => {
    const page = $("#page");
    const c = page?.children[m.i];
    if (c) {
      c.scrollIntoView({ block: "center" });
      const t = c.querySelector("textarea,input.hd");
      if (t) {
        t.focus();
        if (t.tagName === "TEXTAREA" && m.p >= 0) {
          try { t.setSelectionRange(m.p, Math.min(t.value.length, m.p + m.n)); } catch (e) {}
        }
      }
    }
  };
  if (m.nb !== S.cur) import("./app.js").then((x) => x.openNotebookById(m.nb, after));
  else after();
  renderPanel();
}

export function step(d) {
  if (!M.length) return runSearch();
  mi = (mi + d + M.length) % M.length;
  goto(M[mi]);
  renderPanel();
}

export function openSearch(initial) {
  const sb = $("#sb");
  if (sb) { sb.classList.remove("hidden"); $("#sresults")?.classList.remove("hidden"); }
  const q = $("#sq");
  if (q) { q.focus(); q.select(); if (initial) { q.value = initial; runSearch(initial); } }
}

export function closeSearch() {
  const sb = $("#sb");
  if (sb) { sb.classList.add("hidden"); $("#sresults")?.classList.add("hidden"); }
}
