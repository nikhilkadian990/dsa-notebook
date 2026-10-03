// Notebook-wide search, IDE/Notion style. Results are grouped by notebook with
// per-file match counts, each hit shows the matched line with the query
// highlighted, the containing note (nearest heading), and a click jumps straight
// to the spot. Enter / Shift+Enter walks the list.
import { $, el, esc, toast } from "./util.js";
import { S, cur, nbById, titleOf, noteTitle } from "./state.js";

let M = [], mi = -1;

function matchAll(hay, q) {
  const out = [];
  const h = hay.toLowerCase();
  for (let p = h.indexOf(q); p >= 0; p = h.indexOf(q, p + q.length)) out.push(p);
  return out;
}

/** Snippet around a hit, in the matched line, with the query wrapped in <mark>. */
function snippet(text, p, q) {
  const lineStart = text.lastIndexOf("\n", p) + 1;
  const lineEnd = text.indexOf("\n", p + q.length);
  const end = lineEnd === -1 ? text.length : lineEnd;
  const a = Math.max(lineStart, p - 48);
  const b = Math.min(end, p + q.length + 48);
  const esc2 = (s) => esc(s.replace(/\n+/g, " "));
  return (a > lineStart ? "…" : "") + esc2(text.slice(a, p)) +
    "<mark>" + esc2(text.slice(p, p + q.length)) + "</mark>" +
    esc2(text.slice(p + q.length, b)) + (b < end ? " …" : "");
}

/** Which note (heading block) does a block index belong to? */
function noteOf(nb, i) {
  const blocks = nb.blocks || [];
  let h = null;
  for (let k = 0; k <= i && k < blocks.length; k++) if (blocks[k].t === "h") h = blocks[k];
  return h;
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
    for (const p of matchAll(v, q)) {
      const h = b.t === "h" ? b : noteOf(nb, i);
      M.push({
        nb: nb.id, i, p, n: q.length, html: snippet(v, p, q.length),
        hit: v.slice(p, p + q.length), // exact matched text, to relocate the block
        note: h ? noteTitle(h) : null,
        here: nb.id === S.cur,
      });
    }
  });
  // tag hits count too — notebook-level and note-level
  const tagHits = (nb.tags || []).filter((t) => t.toLowerCase().includes(q));
  if (tagHits.length)
    M.push({ nb: nb.id, i: -1, p: 0, n: q.length, html: "tagged " + tagHits.map((t) => "<mark>#" + esc(t) + "</mark>").join(" "), hit: null, note: null, here: nb.id === S.cur });
  for (const b of (nb.blocks || [])) {
    const hits = (b.meta?.tags || []).filter((t) => t.toLowerCase().includes(q));
    if (hits.length)
      M.push({ nb: nb.id, i: nb.blocks.indexOf(b), p: 0, n: q.length, html: "note tagged " + hits.map((t) => "<mark>#" + esc(t) + "</mark>").join(" "), hit: null, note: b.t === "h" ? noteTitle(b) : null, here: nb.id === S.cur });
  }
}

function renderPanel() {
  const box = $("#sresults");
  if (!box) return;
  box.replaceChildren();
  if (!M.length) {
    box.append(el("div", { class: "sr-empty", text: $("#sq")?.value ? "No matches anywhere in this notebook collection." : "Start typing to search every notebook — headings, text, code and tags." }));
    return;
  }
  // group hits by notebook, current first — like an IDE's search panel
  const hereId = S.cur;
  const groups = new Map();
  for (const m of M) {
    if (!groups.has(m.nb)) groups.set(m.nb, []);
    groups.get(m.nb).push(m);
  }
  const ordered = [...groups.entries()].sort((a, b) => (b[0] === hereId) - (a[0] === hereId));

  for (const [nbId, items] of ordered) {
    const n = nbById(nbId);
    const head = el("div", { class: "sr-grp" },
      el("span", { class: "sr-grp-n", text: n ? titleOf(n) : "?" }),
      el("span", { class: "dim small", text: n ? n.name : "" }),
      el("span", { class: "sp" }),
      el("span", { class: "pill sm", text: items.length + " match" + (items.length === 1 ? "" : "es") }),
    );
    box.append(head);
    for (const m of items) {
      const idx = M.indexOf(m);
      box.append(el("div", {
        class: "sr" + (idx === mi ? " on" : ""),
        onclick: () => { mi = idx; goto(m); },
      },
        m.note ? el("div", { class: "sr-note", text: "◈ " + m.note }) : null,
        el("div", { class: "sr-snip", html: m.html }),
      ));
    }
  }
  const sc = $("#scount");
  if (sc) sc.textContent = M.length ? `${Math.min(mi + 1, M.length)}/${M.length}` : "0/0";
}

function goto(m) {
  const n = nbById(m.nb);
  if (!n) return;
  const after = () => {
    const page = $("#page");
    if (!page) return;
    // The editor's norm() inserts empty text blocks, so data indices and DOM
    // children don't line up. Locate the hit by its text in the rendered page.
    const editables = [...page.querySelectorAll("textarea,input.hd")];
    let t = null;
    if (m.hit) {
      const lower = m.hit.toLowerCase();
      t = editables.find((x) => x.value.toLowerCase().includes(lower)) || null;
    }
    if (!t) t = editables.find((x) => x.tagName === "INPUT") || editables[0];
    if (!t) return;
    const c = t.closest(".tb,.nh") || t.parentElement;
    // scroll inside the #doc viewport (the page itself isn't the scroller)
    const doc = $("#doc");
    if (doc && c) {
      const top = Math.max(0, c.offsetTop - doc.clientHeight / 2 + c.clientHeight / 2);
      const smooth = () => { try { doc.scrollTo({ top, behavior: "smooth" }); } catch (e) { doc.scrollTop = top; } };
      smooth();
    }
    t.focus({ preventScroll: true });
    if (t.tagName === "TEXTAREA" && m.hit) {
      const at = t.value.toLowerCase().indexOf(m.hit.toLowerCase());
      if (at >= 0) {
        try { t.setSelectionRange(at, at + m.hit.length); } catch (e) {}
        // briefly flash the row so the landing point is obvious
        c?.classList.add("jumped");
        setTimeout(() => c?.classList.remove("jumped"), 1200);
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
