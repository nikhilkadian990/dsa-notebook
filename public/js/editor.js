// The block editor. Renders the current notebook into #page and keeps the
// in-memory block array in sync with every keystroke.
//
// Block types:
//   text {v}                 markdown-ish textarea over a highlighted mirror
//   h    {v,l}               heading input
//   code {v,lang,open}       dedicated code block (copy / collapse / language)
//   img  {src,name}          image
//   vis  {code,h,name}       sandboxed iframe visual (source kept in the notebook)

import { $, el, btn, uid, toast, dl } from "./util.js";
import { hl, code as hlCode, md } from "./md.js";
import { cur, mark, nbById, S } from "./state.js";
import { STRENGTH_LABEL, STATUS_LABEL } from "./store.js";

/* ---------- normalization: keep exactly one text block between others ---------- */
export function norm(f) {
  const o = [];
  for (const b of f.blocks) {
    const p = o[o.length - 1];
    if (b.t === "text" && p && p.t === "text")
      p.v = p.v && b.v ? p.v + "\n" + b.v : p.v + b.v;
    else {
      if (b.t !== "text" && (!p || p.t !== "text")) o.push({ t: "text", v: "" });
      o.push(b);
    }
  }
  if (!o.length || o[o.length - 1].t !== "text") o.push({ t: "text", v: "" });
  f.blocks = o;
}

let last = null; // {i, ta?} last focused editable
export const lastFocus = () => last;
export const setLast = (v) => (last = v);

export const pageEl = () => $("#page");

export function render(onDone) {
  const f = cur();
  if (!f) return;
  const d = $("#doc"), y = d ? d.scrollTop : 0, pg = pageEl();
  norm(f);
  last = null;
  pg.replaceChildren(...f.blocks.map((b, i) => mk(b, i)));
  fit();
  if (d) d.scrollTop = y;
  renderOutline();
  if (onDone) onDone();
}

export function fit() {
  for (const t of document.querySelectorAll(".tb textarea")) {
    t.style.height = "auto";
    t.style.height = t.scrollHeight + "px";
  }
}

function editableAt(i) {
  return pageEl().children[i]?.querySelector("textarea,input.hd");
}

export function focusAt(i, pos) {
  const t = editableAt(i);
  if (t) {
    t.focus();
    const p = Math.min(pos, t.value.length);
    t.setSelectionRange(p, p);
  }
}

export function go(j, d, end) {
  const c = pageEl().children;
  for (; j >= 0 && j < c.length; j += d) {
    const t = editableAt(j);
    if (t) {
      t.focus();
      const p = end ? t.value.length : 0;
      t.setSelectionRange(p, p);
      return;
    }
  }
}

export function rm(i) {
  const f = cur();
  f.blocks.splice(i, 1);
  mark(f);
  render();
  focusAt(Math.max(0, i - 1), 1e9);
}

/* ---------- block factories ---------- */
function mk(b, i) {
  switch (b.t) {
    case "text": return mkText(b, i);
    case "h": return mkHeading(b, i);
    case "link": return mkLink(b, i);
    case "code": return mkCode(b, i);
    case "img": return mkImg(b, i);
    case "vis": return mkVis(b, i);
  }
  return mkText({ t: "text", v: "" }, i);
}

function mkText(b, i) {
  const pre = el("pre");
  const ta = el("textarea", {
    value: b.v, spellcheck: false, rows: 1,
    placeholder: i === 0 ? "Start typing…  (markdown **bold**, *italic*, `code`, [link](url))" : "",
  });
  pre.innerHTML = hl(b.v);
  ta.addEventListener("input", () => {
    const d = $("#doc"), y = d.scrollTop;
    b.v = ta.value;
    pre.innerHTML = hl(b.v);
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
    d.scrollTop = y;
    mark(cur());
  });
  ta.addEventListener("focus", () => (last = { i, ta }));
  ta.addEventListener("keydown", (e) => textKeys(e, ta, i));
  return el("div", { class: "tb" }, pre, ta);
}

function textKeys(e, ta, i) {
  if (e.key === "Tab" && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    document.execCommand("insertText", false, "  ");
  } else if (e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) {
    return;
  } else if (e.key === "ArrowUp" && ta.selectionEnd === 0) {
    e.preventDefault(); go(i - 1, -1, true);
  } else if (e.key === "ArrowDown" && ta.selectionStart === ta.value.length) {
    e.preventDefault(); go(i + 1, 1, false);
  }
}

function mkHeading(b, i) {
  const inp = el("input", { class: "hd", value: b.v, placeholder: "Note / question title", spellcheck: false });
  inp.addEventListener("input", () => {
    b.v = inp.value;
    renderOutline();
    mark(cur());
  });
  inp.addEventListener("focus", () => (last = { i }));
  inp.addEventListener("keydown", (e) => {
    if (e.altKey) return;
    if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); go(i + 1, 1, false); }
    else if (e.key === "ArrowUp") { e.preventDefault(); go(i - 1, -1, true); }
    else if (e.key === "Backspace" && !inp.value) { e.preventDefault(); rm(i); }
  });

  // a note always has metadata attached to its heading; normalize lazily so old
  // notebooks get a strip the moment their heading is rendered
  if (!b.meta) b.meta = null;

  const wrap = el("div", { class: "nh" });
  const head = el("div", { class: "nh-h" },
    el("button", {
      class: "ib nh-btn", title: "Note settings — link, difficulty, stage, tags, recall", text: "☰",
      onclick: (e) => {
        e.stopPropagation();
        const was = body.classList.contains("hidden");
        // only one note strip open at a time, like an IDE's inline toolbar
        pageEl().querySelectorAll(".nh-body").forEach((x) => x.classList.add("hidden"));
        body.classList.toggle("hidden", !was);
        if (was) build(); // was hidden → we are opening: (re)build the toolbar
        else buildToken++; // closing: cancel any in-flight build
      },
    }),
    inp,
    el("span", { class: "nh-pills", "data-pills": "" }),
  );
  const body = el("div", { class: "nh-body hidden" });
  wrap.append(head, body);

  // the toolbar is built lazily, and rebuilt on open so it never goes stale.
  // Guarded with a token: if the strip is closed again before the async build
  // lands, the build is discarded instead of re-opening the toolbar.
  let buildToken = 0;
  function build() {
    const token = ++buildToken;
    import("./meta.js").then((m) => {
      if (token !== buildToken || body.classList.contains("hidden")) return;
      m.renderNoteBar(cur(), b, body, () => refreshPills());
    });
  }

  function refreshPills() {
    const host = head.querySelector('[data-pills]');
    if (!host) return;
    host.replaceChildren();
    const mm = b.meta;
    if (!mm) return;
    if (mm.difficulty) host.append(el("span", { class: "pill sm st-dif", text: mm.difficulty }));
    if (mm.status && mm.status !== "unsolved") host.append(el("span", { class: "pill sm st-" + mm.status, text: STATUS_LABEL[mm.status] }));
    if (mm.strength && mm.strength !== "learning") host.append(el("span", { class: "pill sm kr-" + mm.strength, text: STRENGTH_LABEL[mm.strength] }));
    if (mm.url) host.append(el("a", { class: "pill sm lk", href: mm.url, target: "_blank", rel: "noopener", text: "problem ↗", title: mm.url }));
    const tags = mm.tags || [];
    if (tags.length) host.append(el("span", { class: "nh-tags", text: tags.map((t) => "#" + t).join(" ") }));
  }
  refreshPills();
  return wrap;
}

function mkCode(b, i) {
  const pre = el("pre");
  const langSel = el("select", { class: "lang-sel" });
  for (const l of ["", "java", "python", "cpp", "c", "js", "ts", "go", "rust", "sql", "bash", "kotlin"])
    langSel.append(el("option", { value: l, text: l || "plain", selected: (b.lang || "") === l }));
  langSel.addEventListener("change", () => {
    b.lang = langSel.value;
    paint();
    mark(cur());
  });
  const copy = btn("Copy", () => {
    navigator.clipboard?.writeText(b.v).then(() => toast("Code copied"));
  });
  const tog = btn(b.open === false ? "Expand" : "Collapse", () => {
    b.open = b.open === false ? true : false;
    mark(cur());
    paint();
  });
  const paint = () => {
    pre.className = b.open === false ? "collapsed" : "";
    pre.innerHTML = hlCode(b.v, b.lang) || "\u200b";
    tog.textContent = b.open === false ? "Expand" : "Collapse";
  };
  paint();
  const edit = btn("Edit", () => {
    const v = prompt("Edit code (Tab = 2 spaces inside the field is preserved):", b.v);
    if (v !== null) { b.v = v; paint(); mark(cur()); }
  });
  return el(
    "section",
    { class: "blk cblk" },
    el("div", { class: "bar" },
      el("span", { class: "tag-dot", text: "code" }),
      langSel,
      el("span", { class: "sp" }),
      copy, tog, edit,
      btn("Delete", () => rm(i)),
    ),
    pre,
  );
}

function mkImg(b, i) {
  return el("figure", { class: "blk" },
    el("div", { class: "bar" },
      el("span", { text: "Image " + (b.name || "") }),
      el("span", { class: "sp" }),
      btn("Download", () => dlData(b)),
      btn("Delete", () => rm(i)),
    ),
    el("img", { src: b.src, alt: b.name || "image" }),
  );
}
function dlData(b) {
  fetch(b.src)
    .then((r) => r.blob())
    .then((blob) => dl(b.name || "image.png", blob))
    .catch(() => toast("Could not export image"));
}

const BASE =
  "<style>html,body{margin:0;background:#0f1815;color:#dbe6df;font-family:system-ui,sans-serif}" +
  "svg{max-width:100%}body>svg:only-child{width:100%;height:100vh}</style>";
export const wrapV = (c) =>
  /<html[\s>]|<!doctype/i.test(c) ? c : "<!doctype html><meta charset=\"utf-8\">" + BASE + c;

function mkVis(b, i) {
  const fr = el("iframe", { title: "visual" });
  fr.setAttribute("sandbox", "allow-scripts allow-popups");
  const run = () => { fr.srcdoc = wrapV(b.code); };
  run();
  const vw = el("div", { class: "vw" }, fr);
  vw.style.height = (b.h || 320) + "px";
  new ResizeObserver(() => {
    const h = vw.offsetHeight;
    if (h && Math.abs(h - (b.h || 320)) > 2) { b.h = h; mark(cur()); }
  }).observe(vw);
  const openTab = () => {
    const w = window.open();
    if (w) { w.document.open(); w.document.write(wrapV(b.code)); w.document.close(); }
    else toast("Allow popups to open the visual in a new tab");
  };
  return el("section", { class: "blk" },
    el("div", { class: "bar" },
      el("span", { text: "Visual" + (b.name ? " — " + b.name : ""), title: "The full source of this visual is stored inside this notebook" }),
      el("span", { class: "sp" }),
      btn("Edit", () => visDlg(b, run)),
      btn("Re-run", run),
      btn("Open in new tab", openTab),
      btn("Download code", () => {
        const nm = b.name || "visual.html";
        dl(nm, new Blob([b.code], { type: /\.svg$/i.test(nm) ? "image/svg+xml" : "text/html" }));
      }),
      btn("Delete", () => rm(i)),
    ),
    vw,
  );
}

/* ---------- visual dialog: paste code or import a file such as Sorting_Lab.html ---------- */
let vcb = null, vName = "";
export function visDlg(b, cb) {
  vcb = { b, cb };
  vName = (b && b.name) || "";
  $("#vc").value = b ? b.code : "";
  $("#vn").textContent = vName ? "Source file: " + vName : "";
  $("#vd").showModal();
  $("#vc").focus();
}

/* ---------- insertion ---------- */
export function insertBlock(nb) {
  const f = cur();
  const bl = f.blocks;
  if (last && bl[last.i]) {
    if (last.ta && bl[last.i].t === "text") {
      const b = bl[last.i], p = last.ta.selectionStart;
      bl.splice(last.i, 1,
        { t: "text", v: b.v.slice(0, p).replace(/\n$/, "") },
        nb,
        { t: "text", v: b.v.slice(p).replace(/^\n/, "") });
    } else bl.splice(last.i + 1, 0, nb);
  } else bl.push(nb);
  mark(f);
  render();
  const k = bl.indexOf(nb);
  focusAt(nb.t === "h" ? k : k + 1, 0);
  if (nb.t === "h") pageEl().children[k].scrollIntoView({ block: "center" });
  return nb;
}

export const insHeading = () => insertBlock({ t: "h", v: "", l: 2, meta: null });

/** Dedicated code block — no backtick typing required. */
export function insCode(lang = "java") {
  insertBlock({ t: "code", v: "", lang, open: true });
  const f = cur(), i = f.blocks.findIndex((b) => b.t === "code");
  if (i > 0) focusAt(i, 0);
}

/* ---------- outline ---------- */
export function renderOutline() {
  const o = $("#olist");
  if (!o) return;
  o.replaceChildren();
  const f = cur();
  if (!f) return;
  f.blocks.forEach((b, i) => {
    if (b.t === "h")
      o.append(el("div", {
        class: "oi", tabIndex: 0, text: b.v || "(untitled)",
        title: b.v || "",
        onclick: () => jump(i),
        onkeydown: (e) => e.key === "Enter" && jump(i),
      }));
  });
  if (!o.children.length)
    o.append(el("div", { class: "pad dim small", text: "Headings you insert appear here." }));
}

export function jump(i) {
  const c = pageEl().children[i];
  if (!c) return;
  c.scrollIntoView({ block: "start" });
  const t = c.querySelector("input");
  t && t.focus({ preventScroll: true });
}

export function navH(d) {
  const f = cur();
  const H = [];
  f.blocks.forEach((b, i) => b.t === "h" && H.push(i));
  if (!H.length) return;
  const c = last ? last.i : -1;
  let t = d > 0 ? H.find((i) => i > c) : [...H].reverse().find((i) => i < c);
  if (t == null) t = d > 0 ? H[0] : H[H.length - 1];
  jump(t);
}

/* ---------- internal + external links ---------- */

/** A link is its own slim block: one line, sits between text rows, opens in a
 *  new tab on click. Inside text it stays inline markdown. */
function mkLink(b, i) {
  const href = String(b.v || "");
  const label = String(b.label || href).trim() || href;
  const isInt = href.startsWith("@nb:") || href.startsWith("@h:");
  const clean = isInt ? label : href.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const follow = (e) => {
    e.stopPropagation();
    followLink(href);
  };
  const box = el("div", { class: "lblk" + (isInt ? " int" : "") },
    el("span", { class: "lic", text: isInt ? "⧉" : "↗" }),
    el("span", { class: "lt", text: label }),
    el("span", { class: "lu dim", text: clean }),
    el("span", { class: "sp" }),
    el("button", { class: "ib", title: "Edit link", text: "✎", onclick: (e) => { e.stopPropagation(); editLink(b); } }),
    el("button", { class: "ib", title: "Delete link", text: "✕", onclick: (e) => { e.stopPropagation(); rm(i); } }),
  );
  box.title = isInt ? "Internal link to " + label : href;
  box.addEventListener("click", follow);
  return box;
}

function editLink(b) {
  const v = ask("Link target — paste a URL, or type @ to link another notebook:", b.v || "https://");
  if (v === null) return;
  const t = v.trim();
  if (!t) return;
  if (t === "@") {
    const f = cur();
    const opts = S.notebooks.filter((x) => x.id !== f?.id);
    if (!opts.length) return toast("No other notebooks yet");
    const list = opts.map((x, k) => `${k + 1}. ${x.name}`).join("\n");
    const pick = window.prompt("Choose a notebook:\n" + list, "1");
    const n = parseInt(pick, 10) - 1;
    if (isNaN(n) || !opts[n]) return;
    b.v = "@nb:" + opts[n].id;
    b.label = b.label || opts[n].name.replace(/\.(md|txt)$/i, "");
  } else {
    b.v = t;
  }
  mark(cur());
  render();
}

/** Resolve clicks on rendered links. The textarea sits above the mirror, so plain
 *  clicks edit; Alt+Click follows the link underneath the caret. */
export function handleLinkClick(e) {
  const a = e.target.closest("a.lk");
  if (!a || (!e.altKey && !e.ctrlKey && !e.metaKey)) return;
  e.preventDefault();
  followLink(a.dataset.href);
}

export function followLink(href) {
  if (!href) return;
  if (href.startsWith("@nb:")) {
    const id = href.slice(4);
    if (!nbById(id)) return toast("That notebook no longer exists");
    import("./app.js").then((m) => m.openNotebookById(id));
  } else if (href.startsWith("@h:")) {
    jump(+href.slice(2));
  } else if (/^https?:\/\//.test(href)) {
    window.open(href, "_blank", "noopener");
  }
}

export function insertLink(ta) {
  // Insert a dedicated slim link block (its own line, click-to-open). If a text
  // selection exists, the link is dropped inline at the caret instead.
  const target = ask("Link target:\n• paste a URL for an external link\n• type @ to choose another notebook", "https://");
  if (target === null) return;
  const t = target.trim();
  if (!t) return;
  if (t === "@") {
    const f = cur();
    const opts = S.notebooks.filter((x) => x.id !== f?.id);
    if (!opts.length) return toast("No other notebooks yet");
    const list = opts.map((x, i) => `${i + 1}. ${x.name}`).join("\n");
    const pick = window.prompt("Choose a notebook:\n" + list, "1");
    const n = parseInt(pick, 10) - 1;
    if (isNaN(n) || !opts[n]) return;
    const label = (ask("Link text (leave blank to use the notebook name):", "") || "").trim();
    insertBlock({ t: "link", v: "@nb:" + opts[n].id, label: label || opts[n].name.replace(/\.(md|txt)$/i, "") });
    return;
  }
  const label = (ask("Link text (leave blank to show the URL):", "") || "").trim();
  insertBlock({ t: "link", v: t, label });
}
