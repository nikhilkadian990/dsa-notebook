// Command palette — Ctrl/Cmd+K. Never a permanent text block in the UI; it only
// exists while it is open.
import { el, toast } from "./util.js";
import { S, cur, nbById, titleOf, allTags } from "./state.js";

let d = null, list = [], sel = -1;

const COMMANDS = [
  { n: "New notebook", k: "Alt+N", f: () => side().then((m) => m.newFile()) },
  { n: "New folder", k: "", f: () => side().then((m) => m.newGroup()) },
  { n: "Search notebooks", k: "Ctrl+F", f: () => search().then((m) => m.openSearch()) },
  { n: "Start review session", k: "", f: () => import("./revise.js").then((m) => m.openRevise()) },
  { n: "Review due today", k: "", f: () => import("./revise.js").then((m) => m.openRevise()) },
  { n: "Recall mode (this notebook)", k: "", f: () => import("./recall.js").then((m) => m.start(cur())) },
  { n: "Add link", k: "", f: () => import("./editor.js").then((m) => m.insertLink()) },
  { n: "Add visual block", k: "Alt+V", f: () => import("./editor.js").then((m) => m.visDlg(null)) },
  { n: "Insert heading", k: "Alt+H", f: () => import("./editor.js").then((m) => m.insHeading()) },
  { n: "Insert code block", k: "Alt+C", f: () => import("./editor.js").then((m) => m.insCode()) },
  { n: "AI prompt for this note", k: "", f: () => import("./ai.js").then((m) => m.promptDialog(cur())) },
  { n: "Toggle reading / focus mode", k: "Alt+3", f: () => app().then((m) => m.toggleBoth()) },
  { n: "Toggle notebooks sidebar", k: "Alt+1", f: () => app().then((m) => m.toggleSide("l")) },
  { n: "Toggle outline", k: "Alt+2", f: () => app().then((m) => m.toggleSide("r")) },
  { n: "Open dashboard", k: "", f: () => app().then((m) => m.showView("dashboard")) },
  { n: "Browse tags", k: "", f: () => app().then((m) => m.showView("tags")) },
  { n: "Export / backup", k: "Alt+E", f: () => import("./io.js").then((m) => m.exportDialog()) },
  { n: "Import notebooks", k: "Alt+O", f: () => document.getElementById("impf")?.click() },
  { n: "Settings", k: "", f: () => app().then((m) => m.showView("settings")) },
];

const side = () => import("./sidebar.js");
const search = () => import("./search.js");
const app = () => import("./app.js");

export function openPalette(initial) {
  if (d && d.open) { d.close(); return; }
  d = el("dialog", { class: "pal" });
  const inp = el("input", {
    class: "pal-q", placeholder: "Type a command or jump to a notebook…", spellcheck: false, value: initial || "",
  });
  const box = el("div", { class: "pal-list" });
  d.append(inp, box);
  document.body.append(d);
  d.showModal();

  const build = () => {
    const q = inp.value.trim().toLowerCase();
    list = [];
    for (const c of COMMANDS)
      if (!q || c.n.toLowerCase().includes(q)) list.push({ t: c.n, s: c.k, f: c.f });
    for (const nb of [...S.notebooks].sort((a, b) => b.updatedAt - a.updatedAt)) {
      const t = titleOf(nb);
      if (!q || t.toLowerCase().includes(q) || nb.name.toLowerCase().includes(q) || (nb.tags || []).some((x) => x.includes(q)))
        list.push({ t, s: (nb.group || "") + (nb.group ? " / " : "") + nb.name, f: () => app().then((m) => m.openNotebookById(nb.id)) });
    }
    for (const [tag, n] of allTags())
      if (!q || tag.includes(q))
        list.push({ t: "#" + tag, s: n + " notebook" + (n === 1 ? "" : "s"), f: () => { S.tag = tag; app().then((m) => m.showView("tags")); } });
    sel = Math.min(sel, list.length - 1);
    if (sel < 0) sel = 0;
    draw();
  };

  const draw = () => {
    box.replaceChildren();
    if (!list.length) { box.append(el("div", { class: "pal-e dim small", text: "No matches." })); return; }
    list.forEach((it, i) =>
      box.append(el("div", {
        class: "pal-i" + (i === sel ? " on" : ""),
        onclick: () => { d.close(); it.f(); },
      }, el("span", { text: it.t }), el("span", { class: "sp" }), el("span", { class: "dim small", text: it.s || "" }))));
    box.children[sel]?.scrollIntoView?.({ block: "nearest" });
  };

  inp.addEventListener("input", () => { sel = 0; build(); });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(list.length - 1, sel + 1); draw(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === "Enter") { e.preventDefault(); if (list[sel]) { d.close(); list[sel].f(); } }
  });
  d.addEventListener("close", () => d.remove());
  build();
  inp.focus();
}
