// In-memory application state + derived helpers.
import { $ } from "./util.js";
import { save, saveProfile, STRENGTH_LABEL, STATUS_LABEL, notesOf, noteBlocks } from "./store.js";

export const S = {
  uid: null,
  notebooks: [],          // all notebooks (source of truth: Firestore)
  cur: null,              // open notebook id
  folders: [],            // folder names that may exist even when empty
  prefs: {},              // interface preferences
  ui: { l: 1, r: 1, x: {} }, // sidebar open/closed + expanded folders
  view: "editor",         // editor | dashboard | tags | revise | settings
  tag: null,              // active tag filter (tags view)
  reading: false,         // focus / reading mode
  online: true,
  dirty: false,
};

export const cur = () => S.notebooks.find((f) => f.id === S.cur) || S.notebooks[0];

export function openNotebook(id, scroll = true) {
  const nf = S.notebooks.find((f) => f.id === id);
  if (!nf) return;
  if (nf.group) S.ui.x[nf.group] = 1;
  if (S.cur !== id) {
    S.cur = id;
    saveProfile({ last: id });
  }
  if (scroll) setTimeout(() => { const d = $("#doc"); if (d) d.scrollTop = 0; }, 0);
}

export const folderOf = (nb) => nb?.group || null;

/** Folder list = explicit folders ∪ folders actually in use. */
export function allFolders() {
  const set = new Set(S.folders);
  for (const nb of S.notebooks) if (nb.group) set.add(nb.group);
  return [...set];
}

export function notebooksIn(folder) {
  return S.notebooks.filter((f) => folderOf(f) === folder);
}

export function mark(nb) {
  S.dirty = true;
  save(nb);
}

export function persistFolders() {
  saveProfile({ folders: [...S.folders] });
}

export function persistPrefs() {
  saveProfile({ prefs: { ...S.prefs } });
}

/** All tags across every notebook and note, alphabetically. */
export function allTags() {
  const m = new Map();
  const bump = (t) => m.set(t, (m.get(t) || 0) + 1);
  for (const nb of S.notebooks) {
    for (const t of nb.tags || []) bump(t);
    for (const b of notesOf(nb)) for (const t of b.meta?.tags || []) bump(t);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function findByTag(tag) {
  return S.notebooks.filter(
    (f) => (f.tags || []).includes(tag) || notesOf(f).some((b) => (b.meta?.tags || []).includes(tag)),
  );
}

/** Title of a single note (its heading text). */
export function noteTitle(b) {
  return (b?.v || "").trim() || "(untitled note)";
}

export function nbById(id) {
  return S.notebooks.find((f) => f.id === id);
}

export const strengthLabel = (s) => STRENGTH_LABEL[s] || "Learning";
export const statusLabel = (s) => STATUS_LABEL[s] || "Unsolved";

/** Plain-text of a notebook, used for search indexing and snippets. */
export function plainText(nb) {
  return (nb.blocks || [])
    .map((b) => (b.t === "text" || b.t === "code" ? b.v : b.t === "h" ? b.v : b.t === "vis" ? b.name || "visual" : ""))
    .join("\n");
}

/** First heading of a notebook (its problem/title). */
export function titleOf(nb) {
  const h = (nb.blocks || []).find((b) => b.t === "h" && b.v.trim());
  return h ? h.v.trim() : (nb.name || "").replace(/\.(md|txt)$/i, "");
}
