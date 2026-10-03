// App shell: boot, view switching, sidebar state, sync indicator, shortcuts.
import { $, $$, el, btn, toast, debounce } from "./util.js";
import { S, cur, openNotebook, allFolders } from "./state.js";
import { start, saveNow, saveProfile, dueNow, pendingCount } from "./store.js";
import * as ed from "./editor.js";
import { renderFiles, newGroup } from "./sidebar.js";
import { runSearch, openSearch, closeSearch, step } from "./search.js";
import { renderTags, renderDashboard } from "./views.js";
import { renderSettings } from "./settings.js";
import { openPalette } from "./palette.js";
import { importFiles, exportDialog } from "./io.js";
import { auth, authReady } from "./fb.js";

/* ===================== boot ===================== */
let booted = false;
function boot() {
  if (booted) return;
  booted = true;
  start((nbs, err, meta, profile) => {
    if (err) { console.error(err); toast("Sync problem: " + err.message, 5000); }
    if (profile) {
      S.folders = profile.folders || [];
      S.prefs = profile.prefs || {};
      renderFiles();
    }
    if (nbs) {
      const had = S.notebooks.length;
      S.notebooks = nbs;
      if (!S.cur || !nbs.some((x) => x.id === S.cur)) S.cur = nbs[0]?.id || null;
      afterDataChange();
      if (!had && nbs.length) ed.render(); // first load of cloud data
    }
    if (meta) {
      S.online = !meta.fromCache || meta.hasPendingWrites === false ? !meta.fromCache : S.online;
      syncUI(meta);
    }
  });

  wire();
  sky();
  sideUI();
  ed.render();
  
  renderFiles();
  syncUI();
  syncInsertBar();

  // keep the sync pill honest: re-check pending writes after each debounce flush
  setInterval(() => { if (S.view === "editor") syncUI(); }, 5000);
  // flush pending edits when the tab is hidden or loses focus, so nothing is
  // left sitting in the 20s debounce window
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveNow(cur());
  });
}

/* Called after any structural data change (new/delete/import/tag edits). */
export function afterDataChange() {
  renderFiles();
  
  syncInsertBar();
  if (S.view === "tags") renderTags();
  if (S.view === "dashboard") renderDashboard();
}

/** The insert bar sits with the open notebook, so it only appears in the editor
 *  view and only when there is a notebook to insert into. */
export function syncInsertBar() {
  const bar = $("#insertbar");
  if (!bar) return;
  bar.classList.toggle("hidden", S.view !== "editor" || !cur());
}

/* ===================== views ===================== */
export function showView(v) {
  S.view = v;
  const main = $("#main");
  const editing = v === "editor";
  $("#docWrap").classList.toggle("hidden", !editing);
  $("#view").classList.toggle("hidden", editing);
  $$(".nav-b").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  if (v === "tags") renderTags();
  if (v === "dashboard") renderDashboard();
  if (v === "settings") renderSettings();
  if (editing) { ed.render(); }
  syncInsertBar();
}

export function showEditor() {
  if (S.view !== "editor") showView("editor");
  else { ed.render(); }
}

export function openNotebookById(id, after) {
  const nb = S.notebooks.find((x) => x.id === id);
  if (!nb) return;
  openNotebook(id);
  if (S.view !== "editor") showView("editor");
  else { ed.render(); renderFiles(); }
  if (after) setTimeout(after, 30);
  // mobile: close the drawer after picking a notebook
  if (innerWidth <= 900) closeDrawers();
}

/* ===================== sidebars (docked on desktop, drawers on small screens) ===================== */
export function toggleSide(w) {
  S.ui[w] = S.ui[w] ? 0 : 1;
  sideUI();
}
export function toggleBoth() {
  const any = S.ui.l || S.ui.r;
  S.ui.l = any ? 0 : 1;
  S.ui.r = any ? 0 : 1;
  sideUI();
}
function sideUI() {
  const a = $("#app");
  const wide = innerWidth > 1100;
  if (wide) {
    document.body.classList.remove("drawer");
    a.style.gridTemplateColumns = (S.ui.l ? "232px" : "28px") + " 1fr " + (S.ui.r ? "224px" : "28px");
  } else {
    document.body.classList.add("drawer");
    a.style.gridTemplateColumns = "1fr";
  }
  $("#files").classList.toggle("closed", !S.ui.l);
  $("#outline").classList.toggle("closed", !S.ui.r);
  $("#files").classList.toggle("open", wide ? false : !!S.ui.l && drawerOpen);
  $("#outline").classList.toggle("open", wide ? false : !!S.ui.r && drawerOpen);
}
let drawerOpen = false;
export function openDrawer(which) {
  drawerOpen = true;
  S.ui.l = which === "files" ? 1 : S.ui.l;
  S.ui.r = which === "outline" ? 1 : S.ui.r;
  sideUI();
}
export function closeDrawers() {
  drawerOpen = false;
  sideUI();
}

/* ===================== sync indicator ===================== */
function syncUI(meta) {
  const s = $("#st");
  if (!s) return;
  if (!auth.currentUser) { s.textContent = "● signing in…"; s.className = "pill warn"; return; }
  // edits waiting for the debounce count as pending, so the pill reflects reality
  if (pendingCount()) { s.textContent = "● saving…"; s.className = "pill warn"; return; }
  if (meta?.fromCache) { s.textContent = "◍ offline — queued locally"; s.className = "pill warn"; return; }
  s.textContent = "✓ synced"; s.className = "pill ok";
}

/* ===================== background: stars + forest ===================== */
function sky() {
  const c = $("#sky");
  if (!c) return;
  const x = c.getContext("2d");
  if (!x) return; // canvas unsupported (or blocked) — the app still works without the backdrop
  const w = (c.width = innerWidth),
    h = (c.height = innerHeight);
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#070d14");
  g.addColorStop(0.6, "#0b1512");
  g.addColorStop(1, "#0a120e");
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  let s = 7;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < (w * h) / 6000; i++) {
    x.fillStyle = `rgba(220,230,255,${0.15 + r() * 0.5})`;
    const z = r() < 0.1 ? 2 : 1;
    x.fillRect(r() * w, r() * h * 0.8, z, z);
  }
  for (let k = 0; k < 2; k++) {
    x.fillStyle = k ? "#0a1a14" : "#0d2119";
    for (let X = -20; X < w + 20; X += 18 + r() * 16) {
      const th = 60 + r() * (k ? 110 : 70),
        tw = th * 0.38;
      x.beginPath();
      x.moveTo(X, h + 10 - th);
      x.lineTo(X + tw, h + 10);
      x.lineTo(X - tw, h + 10);
      x.fill();
    }
  }
}

/* ===================== wiring ===================== */
function wire() {
  // insert actions live in the contextual insert bar above the open notebook
  $("#ibh").onclick = ed.insHeading;
  $("#ibc").onclick = () => ed.insCode();
  $("#ibl").onclick = () => ed.insertLink();
  $("#ibi").onclick = () => $("#imgf").click();
  $("#ibv").onclick = () => ed.visDlg(null);
  $("#ibai").onclick = () => import("./ai.js").then((m) => m.promptDialog(cur()));
  $("#ibrv").onclick = () => import("./recall.js").then((m) => m.start(cur()));
  $("#ibex").onclick = exportDialog;
  $("#bf").onclick = () => openSearch();
  $("#bai").onclick = () => import("./ai.js").then((m) => m.promptDialog(cur()));
  $("#brv").onclick = () => import("./revise.js").then((m) => m.openRevise());
  $("#bcp").onclick = () => openPalette();
  $("#bim").onclick = () => $("#impf").click();
  $("#bex").onclick = exportDialog;
  $("#bs").onclick = async () => {
    await saveNow(cur());
    toast("Synced to the cloud");
  };
  $("#bn").onclick = () => import("./sidebar.js").then((m) => m.newFile());
  $("#bng").onclick = newGroup;
  $("#bcf").onclick = () => toggleSide("l");
  $("#fopen").onclick = () => toggleSide("l");
  $("#bco").onclick = () => toggleSide("r");
  $("#oopen").onclick = () => toggleSide("r");
  $("#sx").onclick = closeSearch;

  // navigation
  $$(".nav-b").forEach((b) =>
    (b.onclick = () =>
      b.dataset.v === "revise"
        ? import("./revise.js").then((m) => m.openRevise())
        : showView(b.dataset.v)));

  // narrow-screen drawer buttons
  $("#bfiles").onclick = () => openDrawer("files");
  $("#boutline").onclick = () => openDrawer("outline");

  // search bar
  $("#sq").oninput = () => runSearch();
  $("#sq").onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
  };

  // visual dialog
  $("#vo").onclick = () => {
    const c = $("#vc").value;
    if (!c.trim()) return;
    $("#vd").close();
    const vName = $("#vn").dataset.name || "";
    ed.insertBlock({ t: "vis", code: c, name: vName || undefined, h: vName ? 480 : 320 });
  };
  $("#vx").onclick = () => $("#vd").close();
  $("#vif").onclick = () => $("#visf").click();
  $("#vc").onkeydown = (e) => {
    if (e.key === "Tab") { e.preventDefault(); document.execCommand("insertText", false, "  "); }
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $("#vo").click(); }
  };

  // file inputs
  $("#imgf").onchange = (e) => {
    const fl = e.target.files[0];
    if (fl) {
      const r = new FileReader();
      r.onload = () => ed.insertBlock({ t: "img", src: r.result, name: fl.name });
      r.readAsDataURL(fl);
    }
    e.target.value = "";
  };
  $("#visf").onchange = (e) => {
    const fl = e.target.files[0];
    if (!fl) return;
    const r = new FileReader();
    r.onload = () => {
      $("#vc").value = r.result;
      $("#vn").dataset.name = fl.name;
      $("#vn").textContent = "Loaded " + fl.name + " — press Run to insert it as a visual block";
    };
    r.readAsText(fl);
    e.target.value = "";
  };
  $("#impf").onchange = (e) => { importFiles([...e.target.files]); e.target.value = ""; };

  // links inside rendered text (Alt/Ctrl+Click to follow)
  $("#page").addEventListener("click", ed.handleLinkClick);
  $("#page").addEventListener("click", (e) => {
    if (e.target.id === "page") ed.focusAt($("#page").children.length - 1, 1e9);
  });

  addEventListener("resize", () => { sky(); ed.fit(); sideUI(); });

  // global shortcuts
  addEventListener("keydown", (e) => {
    const m = e.ctrlKey || e.metaKey, k = e.code;
    const typing = /^(TEXTAREA|INPUT|SELECT)$/.test(document.activeElement?.tagName || "");
    if (m && k === "KeyK") {
      e.preventDefault();
      openPalette(typing ? document.activeElement.value.slice(document.activeElement.selectionStart, document.activeElement.selectionEnd) : "");
      return;
    }
    if (m && k === "KeyS") { e.preventDefault(); $("#bs").click(); return; }
    if (m && k === "KeyF" && !e.shiftKey) { e.preventDefault(); openSearch(); return; }
    if (k === "F3" || (m && k === "KeyG")) { e.preventDefault(); step(e.shiftKey ? -1 : 1); return; }
    if (e.altKey && !m) {
      const a = {
        KeyN: () => import("./sidebar.js").then((x) => x.newFile()),
        KeyH: ed.insHeading,
        KeyV: () => ed.visDlg(null),
        KeyC: () => ed.insCode(),
        KeyI: () => $("#imgf").click(),
        KeyE: exportDialog,
        KeyO: () => $("#impf").click(),
        Digit1: () => toggleSide("l"),
        Digit2: () => toggleSide("r"),
        Digit3: toggleBoth,
      }[k];
      if (a) { e.preventDefault(); a(); return; }
      if (k === "ArrowUp" || k === "ArrowDown") { e.preventDefault(); ed.navH(k === "ArrowUp" ? -1 : 1); return; }
    }
    if (e.key === "Escape") {
      if (document.querySelector("dialog[open]")) return;
      if (!$("#sb").classList.contains("hidden")) { closeSearch(); return; }
      if (S.view !== "editor") showView("editor");
    }
  });

  // click on the dimmed backdrop of a drawer closes it
  $("#scrim").addEventListener("click", closeDrawers);
}

/* ===================== legacy-migration first-run helper =====================
   If Firestore has no notebooks but the page was opened with ?migrate=1 and a
   legacy file was dropped, importFiles handles it. A one-time banner is shown by
   renderFiles when there is nothing yet. */
export function migrateFromLegacy(file) {
  return importFiles([file]);
}

authReady.then(() => boot());
setTimeout(() => { if (!booted) boot(); }, 2500); // safety net if auth is slow
