// Data layer. Notebooks live in memory and are written straight through to
// Firestore; when offline the SDK queues the writes in IndexedDB and flushes them
// on reconnect. One document per notebook (never one giant document for all).

import { db, auth, authReady, collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch, query, orderBy } from "./fb.js";
import { uid, DAY } from "./util.js";

export const STRENGTHS = ["learning", "familiar", "strong", "mastered"];
export const STATUSES = ["unsolved", "solved", "revised", "strong"];
export const STRENGTH_LABEL = { learning: "Learning", familiar: "Getting Familiar", strong: "Strong", mastered: "Mastered" };
export const STATUS_LABEL = { unsolved: "Unsolved", solved: "Solved", revised: "Revised", strong: "Strong" };

/** Days until the next review, per knowledge state. Grows as you get stronger. */
export const INTERVAL = { learning: 1, familiar: 3, strong: 7, mastered: 21 };

export function freshNotebook(name = "Untitled.md", group = null) {
  return {
    id: uid(),
    name,
    group,
    order: Date.now(),
    tags: [],
    meta: { url: "", source: "", difficulty: "", status: "unsolved", strength: "learning", related: [] },
    mistakes: [],
    reviews: [],
    dueAt: 0,
    blocks: [{ t: "text", v: "" }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** Normalize whatever came in (legacy import, older saves) into a valid notebook. */
export function normalize(n) {
  n = n || {};
  const nb = {
    id: n.id || uid(),
    name: n.name || "Untitled.md",
    group: n.group || null,
    order: n.order ?? n.createdAt ?? Date.now(),
    tags: Array.isArray(n.tags) ? n.tags : [],
    meta: Object.assign(
      { url: "", source: "", difficulty: "", status: "unsolved", strength: "learning", related: [] },
      n.meta || {},
    ),
    mistakes: Array.isArray(n.mistakes) ? n.mistakes : [],
    reviews: Array.isArray(n.reviews) ? n.reviews : [],
    dueAt: n.dueAt || 0,
    blocks: Array.isArray(n.blocks) ? n.blocks : [{ t: "text", v: "" }],
    createdAt: n.createdAt || Date.now(),
    updatedAt: n.updatedAt || Date.now(),
  };
  // block shape sanity
  for (const b of nb.blocks) {
    if (!b || !b.t) continue;
    if (b.t === "text") b.v = String(b.v ?? "");
    if (b.t === "h") { b.v = String(b.v ?? ""); b.l = Math.min(6, Math.max(1, b.l || 2)); }
    if (b.t === "img") { b.src = b.src || ""; b.name = b.name || "image"; }
    if (b.t === "vis") { b.code = b.code || ""; b.name = b.name || ""; b.h = b.h || 320; }
    if (b.t === "code") { b.v = String(b.v ?? ""); b.lang = b.lang || ""; b.open = b.open ?? true; }
  }
  return nb;
}

export const path = (nbId) => doc(db, "users", uid0(), "notebooks", nbId);
function uid0() {
  const u = auth.currentUser;
  if (!u) throw new Error("not signed in");
  return u.uid;
}

let started = false;
export function start(cb) {
  if (started) return;
  started = true;
  authReady.then((u) => {
    if (!u) { cb(null, new Error("no auth")); return; }
    // profile = folder list + interface prefs, kept in the user document itself
    onSnapshot(doc(db, "users", u.uid), (d) => {
      const p = d.exists ? d.data() : {};
      cb(null, null, null, { folders: p.folders || [], prefs: p.prefs || {} });
    });
    const q = query(collection(db, "users", u.uid, "notebooks"), orderBy("order"));
    onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      cb(
        snap.docs
          .filter((d) => d.exists)
          .map((d) => normalize(d.data())),
        null,
        snap.metadata,
      );
    }, (err) => cb(null, err));
  });
}

export async function saveProfile(patch) {
  const u = auth.currentUser;
  if (!u) return;
  try {
    await setDoc(doc(db, "users", u.uid), patch, { merge: true });
  } catch (e) { /* offline queue */ }
}

const pending = new Map(); // nbId -> {fields, timer}
const SAVE_MS = 900;

/** Debounced write-through of the dirty fields of one notebook. */
export function save(nb, fields = null) {
  if (!nb || !nb.id) return;
  nb.updatedAt = Date.now();
  const f = fields || { ...nb, id: nb.id };
  let p = pending.get(nb.id);
  if (!p) { p = { fields: {}, timer: 0 }; pending.set(nb.id, p); }
  Object.assign(p.fields, f);
  clearTimeout(p.timer);
  p.timer = setTimeout(() => flush(nb.id), SAVE_MS);
}

async function flush(nbId) {
  const p = pending.get(nbId);
  if (!p) return;
  pending.delete(nbId);
  try {
    await setDoc(path(nbId), p.fields, { merge: true });
  } catch (e) {
    // likely offline: re-queue and let the SDK retry
    const q = { fields: p.fields, timer: setTimeout(() => flush(nbId), 4000) };
    pending.set(nbId, q);
  }
}

export async function saveNow(nb) {
  const p = pending.get(nb?.id);
  if (p) { clearTimeout(p.timer); await flush(nb.id); }
}

export async function remove(nbId) {
  const p = pending.get(nbId);
  if (p) { clearTimeout(p.timer); pending.delete(nbId); }
  try { await deleteDoc(path(nbId)); } catch (e) { /* offline: gone locally */ }
}

export async function writeAll(list) {
  const u = auth.currentUser;
  if (!u) throw new Error("no auth");
  let batch = writeBatch(db);
  let n = 0;
  for (const nb of list) {
    batch.set(doc(db, "users", u.uid, "notebooks", nb.id), normalize(nb), { merge: true });
    if (++n % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
  }
  if (n % 400) await batch.commit();
}

/** Record a review and schedule the next due date from the knowledge state. */
export function recordReview(nb, strengthBefore, grade) {
  const s = nb.meta.strength;
  nb.reviews.push({ at: Date.now(), strength: s, grade });
  nb.meta.strength = grade === "again" ? "learning" : STRENGTHS[Math.max(STRENGTHS.indexOf(s), grade === "good" ? 1 : 0)];
  if (grade === "easy" && nb.meta.strength !== "mastered")
    nb.meta.strength = STRENGTHS[Math.min(3, STRENGTHS.indexOf(nb.meta.strength) + 1)];
  nb.dueAt = Date.now() + (INTERVAL[nb.meta.strength] || 1) * DAY;
  save(nb, { reviews: nb.reviews, meta: nb.meta, dueAt: nb.dueAt, updatedAt: Date.now() });
  return nb.meta.strength;
}

export const dueNow = (nb) => nb.dueAt ? nb.dueAt <= Date.now() : true;
