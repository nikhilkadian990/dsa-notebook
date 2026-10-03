// Secondary views: the tag index and the lightweight dashboard.
import { $, el, btn, toast, when, DAY, plural } from "./util.js";
import { S, cur, nbById, titleOf, allTags, findByTag, openNotebook, notebooksIn, noteTitle } from "./state.js";
import { dueNow, notesOf, noteDue, noteHasBody } from "./store.js";

const go = (id) => import("./app.js").then((m) => m.openNotebookById(id));

/* ===================== tags ===================== */
export function renderTags() {
  const host = $("#view");
  if (!host) return;
  host.replaceChildren();
  const active = S.tag;
  host.append(el("h2", { class: "vh", text: "Tags" }),
    el("p", { class: "dim small vsub", text: "Revise by pattern, not only by folder. Tags come from each notebook's metadata strip." }));

  const tags = allTags();
  if (!tags.length) {
    host.append(el("div", { class: "vempty", text: "No tags yet. Open a notebook, expand the metadata strip and add tags like two-pointers, sliding-window, binary-search." }));
    return;
  }

  const cloud = el("div", { class: "tcloud" });
  for (const [t, n] of tags)
    cloud.append(el("button", {
      class: "tag-chip" + (active === t ? " on" : ""),
      text: "#" + t,
      title: n + " notebook" + (n === 1 ? "" : "s"),
      onclick: () => { S.tag = active === t ? null : t; renderTags(); },
    }, el("span", { class: "tag-n", text: String(n) })));
  host.append(cloud);

  const list = active ? findByTag(active) : [];
  if (active) {
    host.append(el("div", { class: "sr-head", text: "#" + active + " — " + list.length + " note" + (list.length === 1 ? "" : "s") }));
    for (const nb of [...list].sort((a, b) => b.updatedAt - a.updatedAt))
      host.append(noteRow(nb));
  } else {
    // untagged nudge
    const untagged = S.notebooks.filter((nb) => !nb.tags?.length);
    if (untagged.length)
      host.append(el("div", { class: "vnote dim small", text: plural(untagged.length, "notebook") + " have no tags yet — tag them to revise by pattern." }));
  }
}

function noteRow(nb) {
  return el("div", { class: "nrow", tabindex: 0, onclick: () => go(nb.id), onkeydown: (e) => e.key === "Enter" && go(nb.id) },
    el("div", { class: "nrow-t", text: titleOf(nb) }),
    el("div", { class: "nrow-s dim small", text: (nb.group ? nb.group + " / " : "") + nb.name + " · " + STRENGTH[nb.meta.strength] + " · edited " + when(nb.updatedAt) }),
    (nb.tags || []).length ? el("div", { class: "nrow-tags", text: nb.tags.map((t) => "#" + t).join(" ") }) : null,
  );
}
const STRENGTH = { learning: "Learning", familiar: "Getting familiar", strong: "Strong", mastered: "Mastered" };

/* ===================== dashboard ===================== */
export function renderDashboard() {
  const host = $("#view");
  if (!host) return;
  host.replaceChildren();
  const f = cur();
  const due = dueNotes();
  const weak = weakNotes();
  const mistakes = mistakeNotes();
  const recent = [...S.notebooks].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
  const totalNotes = S.notebooks.reduce((n, nb) => n + notesOf(nb).filter((b) => noteHasBody(nb, b)).length, 0);
  const mastered = S.notebooks.reduce((n, nb) => n + notesOf(nb).filter((b) => b.meta?.strength === "mastered").length, 0);
  const pct = totalNotes ? Math.round((mastered / totalNotes) * 100) : 0;

  host.append(el("h2", { class: "vh", text: "DSA Notebook" }),
    el("p", { class: "dim small vsub", text: totalNotes ? plural(totalNotes, "note") + " in " + plural(S.notebooks.length, "notebook") + " · " + pct + "% mastered" : "Welcome — start with your first notebook." }));

  const quick = el("div", { class: "dquick" },
    qBtn("＋ New notebook", "Alt+N", () => import("./sidebar.js").then((m) => m.newFile()), true),
    qBtn("↻ Review today", due.length + " due", () => import("./revise.js").then((m) => m.openRevise()), true),
    qBtn("◈ Recall a file", "whole-file self-test", () => import("./revise.js").then((m) => m.filePicker()), true),
    qBtn("⌕ Search", "Ctrl+F", () => import("./search.js").then((m) => m.openSearch())),
    qBtn("# Browse tags", allTags().length + " tags", () => import("./app.js").then((m) => m.showView("tags"))),
    qBtn("✦ AI prompt", "for this note", () => f && import("./ai.js").then((m) => m.promptDialog(f))),
    qBtn("⇩ Export", "backup all", () => import("./io.js").then((m) => m.exportDialog())),
    qBtn("⚙ Settings", "AI, backup, prefs", () => import("./app.js").then((m) => m.showView("settings"))),
  );
  host.append(quick);

  const grid = el("div", { class: "dgrid" });

  if (f)
    grid.append(card("Continue where you left off", el("div", {},
      el("div", { class: "nrow-t", text: titleOf(f) }),
      el("div", { class: "dim small", text: f.name + " · edited " + when(f.updatedAt) }),
      el("div", { style: "margin-top:8px" }, btn("Open", () => go(f.id), "b pri")),
    )));

  grid.append(card("Due today (" + due.length + ")",
    due.length ? listOfNotes(due, (it) => "due " + when(it.b.meta.dueAt)) : el("div", { class: "dim small", text: "Nothing due — you are caught up." }),
    due.length ? btn("Start review", () => import("./revise.js").then((m) => m.openRevise()), "b sm") : null));

  grid.append(card("Recently edited",
    recent.length ? listOf(recent, (nb) => when(nb.updatedAt)) : el("div", { class: "dim small", text: "No notebooks yet." })));

  if (weak.length)
    grid.append(card("Still learning (" + weak.length + ")", listOfNotes(weak, (it) => STRENGTH[it.b.meta?.strength] || "Learning")));

  if (mistakes.length)
    grid.append(card("Mistakes to review", listOfNotes(mistakes, (it) => plural(it.b.meta.mistakes.length, "mistake")),
      btn("Review mistakes", () => import("./revise.js").then((m) => m.openRevise()), "b sm")));

  host.append(grid);
}

/** Due / weak / mistake items are { nb, b } note pairs. */
function dueNotes() {
  const out = [];
  for (const nb of S.notebooks) for (const b of notesOf(nb)) if (noteDue(nb, b)) out.push({ nb, b });
  return out;
}
function weakNotes() {
  const out = [];
  for (const nb of S.notebooks) for (const b of notesOf(nb))
    if (noteHasBody(nb, b) && (b.meta?.strength === "learning" || b.meta?.strength === "familiar")) out.push({ nb, b });
  return out;
}
function mistakeNotes() {
  const out = [];
  for (const nb of S.notebooks) for (const b of notesOf(nb)) if (b.meta?.mistakes?.length) out.push({ nb, b });
  return out;
}

function listOfNotes(items, sub) {
  const box = el("div");
  for (const it of [...items].sort((a, b) => (a.b.meta?.dueAt || a.nb.updatedAt) - (b.b.meta?.dueAt || b.nb.updatedAt)).slice(0, 6))
    box.append(el("div", { class: "dli", tabindex: 0, onclick: () => go(it.nb.id), onkeydown: (e) => e.key === "Enter" && go(it.nb.id) },
      el("span", { class: "dli-n", text: noteTitle(it.b) }),
      el("span", { class: "dim small", text: (sub ? sub(it) : "") + " · " + it.nb.name }),
    ));
  return box;
}

function qBtn(text, sub, fn, primary) {
  return el("button", { class: "qb" + (primary ? " pri" : ""), onclick: fn },
    el("div", { class: "qb-t", text }), el("div", { class: "qb-s", text: sub }));
}

function card(title, body, action) {
  return el("div", { class: "dcard" },
    el("div", { class: "dcard-h" }, el("span", { class: "dcard-t", text: title }), el("span", { class: "sp" }), action || null),
    el("div", { class: "dcard-b" }, body),
  );
}

function listOf(nbs, sub) {
  const box = el("div");
  for (const nb of [...nbs].sort((a, b) => (a.dueAt || b.updatedAt) - (b.dueAt || a.updatedAt)).slice(0, 6))
    box.append(el("div", { class: "dli", tabindex: 0, onclick: () => go(nb.id), onkeydown: (e) => e.key === "Enter" && go(nb.id) },
      el("span", { class: "dli-n", text: titleOf(nb) }),
      el("span", { class: "dim small", text: sub(nb) }),
    ));
  return box;
}
