// Left sidebar: IDE-style notebook tree inside folders, plus the tag index.
import { $, el, btn, uid, toast, ask } from "./util.js";
import { S, cur, openNotebook, allFolders, notebooksIn, nbById, mark, allTags, findByTag, persistFolders } from "./state.js";
import { freshNotebook, remove, save, normalize, untombstone } from "./store.js";

export function renderFiles() {
  const L = $("#flist");
  if (!L) return;
  L.replaceChildren();
  const x = S.ui.x;

  const row = (f) =>
    el("div", {
      class: "fi" + (f.id === S.cur ? " on" : "") + (f.group ? " ind" : ""),
      tabIndex: 0,
      draggable: "true",
      "data-nb": f.id,
      onclick: () => open(f.id),
      onkeydown: (e) => e.key === "Enter" && open(f.id),
      ondragstart: (e) => { drag = f; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", f.id); e.currentTarget.classList.add("drag"); },
      ondragend: (e) => e.currentTarget.classList.remove("drag"),
      ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add("drop"); },
      ondragleave: (e) => e.currentTarget.classList.remove("drop"),
      ondrop: (e) => {
        e.preventDefault(); e.stopPropagation();
        e.currentTarget.classList.remove("drop");
        dropOnto(f);
      },
    },
      el("span", { class: "nm", text: f.name, title: f.name }),
      strengthDot(f),
      el("button", {
        class: "ib", title: "Rename — Folder/Name.md moves it into that folder; /Name.md moves it to top level", text: "✎",
        onclick: (e) => { e.stopPropagation(); renF(f); },
      }),
      el("button", {
        class: "ib", title: "Delete", text: "✕",
        onclick: (e) => { e.stopPropagation(); delF(f); },
      }),
    );

  for (const g of allFolders()) {
    const open = x[g] !== 0;
    const kids = notebooksIn(g);
    L.append(el("div", {
      class: "gh", tabIndex: 0,
      draggable: "true",
      "data-folder": g,
      onclick: () => togG(g),
      onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); togG(g); } },
      ondragstart: (e) => { dragFolder = g; e.dataTransfer.effectAllowed = "move"; },
      ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add("drop"); },
      ondragleave: (e) => e.currentTarget.classList.remove("drop"),
      ondrop: (e) => {
        e.preventDefault(); e.stopPropagation();
        e.currentTarget.classList.remove("drop");
        dropInFolder(g);
      },
    },
      el("span", { class: "tw", text: open ? "▾" : "▸" }),
      el("span", { class: "gnm", text: g }),
      el("button", { class: "ib", title: "New notebook in " + g, text: "+", onclick: (e) => { e.stopPropagation(); newFile(g); } }),
      el("button", { class: "ib", title: "Rename folder", text: "✎", onclick: (e) => { e.stopPropagation(); renG(g); } }),
      el("button", { class: "ib", title: "Delete folder — its notebooks are kept", text: "✕", onclick: (e) => { e.stopPropagation(); delG(g); } }),
    ));
    if (open) {
      if (kids.length) kids.forEach((f) => L.append(row(f)));
      else L.append(el("div", { class: "empty-note", text: "empty — click + to add a notebook" }));
    }
  }
  // a drop target for the top level (drag a file out of any folder)
  const root = el("div", {
    class: "drop-root",
    text: "Top level — drop here to move out of a folder",
    ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add("drop"); },
    ondragleave: (e) => e.currentTarget.classList.remove("drop"),
    ondrop: (e) => { e.preventDefault(); e.currentTarget.classList.remove("drop"); dropInFolder(null); },
  });
  root.classList.toggle("hidden", !S.notebooks.some((f) => f.group));
  notebooksIn(null).forEach((f) => L.append(row(f)));
  L.append(root);

  if (!S.notebooks.length)
    L.append(el("div", { class: "pad dim small", text: "No notebooks yet — press Alt+N or the + New button." }));
}

let drag = null;      // notebook being dragged
let dragFolder = null;

function dropInFolder(g) {
  const f = drag;
  drag = null;
  if (!f) return;
  if (f.group === g) return;
  f.group = g;
  if (g) { if (!S.folders.includes(g)) S.folders.push(g); S.ui.x[g] = 1; persistFolders(); }
  save(f, { group: g });
  renderFiles();
  import("./app.js").then((m) => m.afterDataChange());
  toast(g ? 'Moved "' + f.name + '" into ' + g : 'Moved "' + f.name + '" to the top level');
}

/** Drop onto a file: move into its folder, and order it right after that file. */
function dropOnto(target) {
  const f = drag;
  drag = null;
  if (!f || f === target) return;
  const g = target.group;
  if (f.group !== g) {
    f.group = g;
    if (g) { if (!S.folders.includes(g)) S.folders.push(g); S.ui.x[g] = 1; persistFolders(); }
  }
  // keep order stable: place the dragged notebook right after the target
  const all = [...S.notebooks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const from = all.indexOf(f);
  all.splice(from, 1);
  all.splice(all.indexOf(target) + 1, 0, f);
  all.forEach((n, i) => { n.order = (i + 1) * 1000; save(n, { order: n.order }); });
  renderFiles();
  import("./app.js").then((m) => m.afterDataChange());
  toast(g ? 'Moved "' + f.name + '" into ' + g + ', after "' + target.name + '"' : 'Reordered "' + f.name + '" after "' + target.name + '"');
}

function strengthDot(f) {
  const s = f.meta?.strength;
  const c = { learning: "lrn", familiar: "fam", strong: "str", mastered: "mst" }[s] || "";
  const lbl = { learning: "Learning", familiar: "Getting familiar", strong: "Strong", mastered: "Mastered" }[s] || "";
  return el("span", { class: "sdot " + c, title: lbl ? "Knowledge state: " + lbl : "" });
}

function open(id) {
  const nf = nbById(id);
  if (!nf) return;
  openNotebook(id);
  import("./app.js").then((m) => m.showEditor());
}

function togG(g) {
  S.ui.x[g] = S.ui.x[g] === 0 ? 1 : 0;
  renderFiles();
}

const uniq = (n, ex) => {
  n = (n || "").trim() || "Untitled.md";
  if (!/\.(md|txt)$/i.test(n)) n += ".md";
  const b = n;
  let k = 1;
  while (S.notebooks.some((f) => f !== ex && f.name.toLowerCase() === n.toLowerCase()))
    n = b.replace(/(\.\w+)$/, ` (${k++})$1`);
  return n;
};

export function newFile(g) {
  const v = ask(
    g ? "New notebook in " + g : "New notebook — name it DSA/Stacks.md to file it inside a folder",
    "Untitled.md",
  );
  if (v === null) return;
  let s = v.trim(), ng = g || null;
  const i = s.lastIndexOf("/");
  if (i >= 0) { ng = s.slice(0, i).trim() || null; s = s.slice(i + 1).trim() || "Untitled.md"; }
  if (ng) { if (!S.folders.includes(ng)) S.folders.push(ng); S.ui.x[ng] = 1; persistFolders(); }
  const f = freshNotebook(uniq(s), ng);
  S.notebooks.push(f);
  S.cur = f.id;
  save(f);
  import("./app.js").then((m) => { m.showEditor(); m.afterDataChange(); });
  import("./editor.js").then((e) => { e.render(); setTimeout(() => e.focusAt(0, 0), 0); });
  toast('Notebook "' + f.name + '" created');
}

function newGroup() {
  const v = ask("New folder name (a subject, e.g. DSA or DBMS)", "");
  if (v === null || !v.trim()) return;
  const n = v.trim();
  if (n.includes("/")) return toast("Folder names cannot contain /");
  if (S.folders.some((g) => g.toLowerCase() === n.toLowerCase())) return toast("A folder with that name already exists");
  S.folders.push(n);
  S.ui.x[n] = 1;
  persistFolders();
  renderFiles();
  toast('Folder "' + n + '" created — its + button adds notebooks to it');
}

function renG(g) {
  const v = ask("Rename folder", g);
  if (v === null || !v.trim() || v.trim() === g) return;
  const n = v.trim();
  if (n.includes("/")) return toast("Folder names cannot contain /");
  if (S.folders.some((x) => x.toLowerCase() === n.toLowerCase())) return toast("A folder with that name already exists");
  S.folders[S.folders.indexOf(g)] = n;
  for (const f of S.notebooks) if (f.group === g) { f.group = n; save(f, { group: n }); }
  if (g in S.ui.x) { S.ui.x[n] = S.ui.x[g]; delete S.ui.x[g]; }
  persistFolders();
  renderFiles();
}

function delG(g) {
  const n = notebooksIn(g).length;
  if (!confirm(`Delete folder "${g}"? Its ${n} notebook${n === 1 ? "" : "s"} stay — they just move to the top level.`)) return;
  S.folders = S.folders.filter((x) => x !== g);
  for (const f of S.notebooks) if (f.group === g) { f.group = null; save(f, { group: null }); }
  delete S.ui.x[g];
  persistFolders();
  renderFiles();
}

function renF(f) {
  const v = ask("Rename — prefix Folder/ to move it into that folder, or / for top level", f.group ? f.group + "/" + f.name : f.name);
  if (v === null) return;
  let s = v.trim();
  if (!s) return;
  let g = f.group;
  const i = s.lastIndexOf("/");
  if (i >= 0) { g = s.slice(0, i).trim() || null; s = s.slice(i + 1).trim() || "Untitled.md"; }
  if (g && !S.folders.includes(g)) { S.folders.push(g); S.ui.x[g] = 1; persistFolders(); }
  f.group = g;
  f.name = uniq(s, f);
  save(f, { name: f.name, group: g });
  renderFiles();
  import("./app.js").then((m) => m.afterDataChange());
}

function delF(f) {
  if (!confirm(`Delete "${f.name}"? This cannot be undone.`)) return;
  const undo = JSON.parse(JSON.stringify(f));
  S.notebooks = S.notebooks.filter((x) => x.id !== f.id);
  remove(f.id);
  if (S.cur === f.id) S.cur = S.notebooks[0]?.id || null;
  renderFiles();
  import("./app.js").then((m) => m.afterDataChange());
  toast("Deleted — ", 6000);
  // lightweight undo: keep the delete but offer restore within the toast window
  setTimeout(() => {
    const t = $("#toast");
    if (!t || t.classList.contains("hidden")) return;
    t.append(el("button", { class: "b sm", text: "Undo", onclick: () => {
      const nb = normalize(undo);
      untombstone(nb.id);
      S.notebooks.push(nb);
      save(nb);
      S.cur = nb.id;
      renderFiles();
      import("./app.js").then((m) => m.afterDataChange());
      toast('Restored "' + nb.name + '"');
    } }));
  }, 0);
}

export { newGroup };
