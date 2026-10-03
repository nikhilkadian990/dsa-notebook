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

/** Empty per-note metadata (problem link, difficulty, learning state, tags…). */
export function freshNoteMeta() {
  return {
    url: "", source: "", difficulty: "", status: "unsolved", strength: "learning",
    tags: [], related: [], mistakes: [], reviews: [], dueAt: 0,
  };
}

export function freshNotebook(name = "Untitled.md", group = null) {
  // A notebook opens with its first note already started: a heading carries the
  // problem title and its own metadata strip.
  const title = name.replace(/\.(md|txt)$/i, "");
  return {
    id: uid(),
    name,
    group,
    order: Date.now(),
    tags: [],
    meta: freshNoteMeta(),
    mistakes: [],
    reviews: [],
    dueAt: 0,
    blocks: [
      { t: "h", v: title, l: 2, meta: freshNoteMeta() },
      { t: "text", v: "" },
    ],
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
      freshNoteMeta(),
      { related: undefined },
      n.meta || {},
      { related: Array.isArray(n.meta?.related) ? n.meta.related : [] },
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
    if (b.t === "h") {
      b.v = String(b.v ?? "");
      b.l = Math.min(6, Math.max(1, b.l || 2));
      // each note (heading) owns its metadata strip
      b.meta = b.meta && typeof b.meta === "object" ? Object.assign(freshNoteMeta(), b.meta) : null;
    }
    if (b.t === "img") { b.src = b.src || ""; b.name = b.name || "image"; }
    if (b.t === "vis") { b.code = b.code || ""; b.name = b.name || ""; b.h = b.h || 320; }
    if (b.t === "code") { b.v = String(b.v ?? ""); b.lang = b.lang || ""; b.open = b.open ?? true; }
    if (b.t === "link") { b.v = String(b.v ?? ""); b.label = String(b.label ?? ""); }
  }
  // one-time migration: legacy notebook-level meta lands on the first note
  const firstH = nb.blocks.find((b) => b.t === "h");
  if (firstH && !firstH.meta && (nb.meta.url || nb.meta.difficulty || nb.meta.status !== "unsolved" || nb.meta.strength !== "learning"))
    firstH.meta = Object.assign(freshNoteMeta(), nb.meta);
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

const pending = new Map(); // nbId -> {fields, timer, resolve}
// Firestore's free tier allows 20k writes/day. A 20s debounce keeps an intensive
// full-day writing session comfortably inside that budget: even one write every
// 20s for 16 hours is under 3k writes, while edits during normal typing coalesce
// into a single write per notebook per pause.
export const SAVE_MS = 20000;

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

/** Number of notebooks with unsaved edits waiting for the debounce. */
export const pendingCount = () => pending.size;

/** Ids of notebooks with writes still queued in the debounce window. A server
 *  snapshot arriving now cannot possibly contain these edits yet. */
export const pendingIds = () => [...pending.keys()];

/** True when the live copy and the server copy carry the same visible content.
 *  Used to decide whether an incoming snapshot actually changes what the editor
 *  is showing (a no-op replacement must not re-render and drop the caret). */
function sameContent(a, b) {
  return (
    a.name === b.name &&
    a.group === b.group &&
    JSON.stringify(a.blocks) === JSON.stringify(b.blocks) &&
    JSON.stringify(a.tags) === JSON.stringify(b.tags) &&
    JSON.stringify(a.meta) === JSON.stringify(b.meta) &&
    JSON.stringify(a.mistakes) === JSON.stringify(b.mistakes) &&
    JSON.stringify(a.reviews) === JSON.stringify(b.reviews)
  );
}

/** Ids deleted locally this session. A snapshot echo that still carries one
 *  (the delete is still queued, or the echo is stale) must not bring it back. */
const tombstones = new Set();
export const tombstone = (id) => tombstones.add(id);
export const untombstone = (id) => tombstones.delete(id);

/** Fold a Firestore snapshot into the live list without discarding editor edits.
 *
 * A snapshot can land at any moment — inside the save debounce window, or in the
 * breath between a flush and its write acknowledgement — so replacing the list
 * outright would silently throw away what the user just typed and leave the
 * editor's closures writing into an orphaned object (the "my note went blank
 * when I added a second headline" bug).
 *
 * The live copy wins while writes are queued, and also whenever the server copy
 * is not strictly newer: our own write echoes back with the same timestamp, and
 * swapping in that echo would orphan the editor for no benefit. Only a genuinely
 * newer server copy replaces the local one, and `changed` reports those so the
 * view can refresh safely. Returns `{ list, changed }`. */
export function mergeSnapshots(local, incoming, liveIds) {
  const live = new Set(liveIds);
  const out = [];
  const changed = [];
  for (const inc of incoming) {
    if (tombstones.has(inc.id)) continue; // deleted locally: stays deleted
    const loc = local.find((x) => x.id === inc.id);
    if (loc && (live.has(inc.id) || (inc.updatedAt || 0) <= (loc.updatedAt || 0))) {
      out.push(loc);
      continue;
    }
    if (loc && !sameContent(loc, inc)) changed.push(inc.id);
    out.push(inc);
  }
  // a brand-new local notebook whose queued write the server has not echoed yet
  for (const loc of local)
    if (live.has(loc.id) && !out.some((x) => x.id === loc.id)) out.push(loc);
  // a snapshot that no longer mentions a tombstoned notebook means the delete
  // was acknowledged, so the tombstone can go
  for (const id of tombstones)
    if (!incoming.some((x) => x.id === id)) tombstones.delete(id);
  return { list: out, changed };
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
  tombstone(nbId); // a stale snapshot echo must not resurrect it
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

/** Same, but for one note (a heading block) instead of the whole notebook. */
export function recordNoteReview(nb, b, grade) {
  if (!b?.meta) return null;
  const m = b.meta;
  const s = m.strength;
  m.reviews.push({ at: Date.now(), strength: s, grade });
  m.strength = grade === "again" ? "learning" : STRENGTHS[Math.max(STRENGTHS.indexOf(s), grade === "good" ? 1 : 0)];
  if (grade === "easy" && m.strength !== "mastered")
    m.strength = STRENGTHS[Math.min(3, STRENGTHS.indexOf(m.strength) + 1)];
  m.dueAt = Date.now() + (INTERVAL[m.strength] || 1) * DAY;
  m.status = m.status === "unsolved" ? "solved" : m.status;
  save(nb, { blocks: nb.blocks, updatedAt: Date.now() });
  return m.strength;
}

/** A notebook is due when any of its notes is due. Empty notebooks never show up
 *  in revision. */
export function dueNow(nb) {
  if (!nb || !hasContent(nb)) return false;
  return notesOf(nb).some((b) => noteDue(nb, b));
}

/** Blocks of one note: from its heading up to (not including) the next heading. */
export function noteBlocks(nb, b) {
  const i = nb.blocks.indexOf(b);
  if (i < 0) return [];
  const out = [];
  for (let k = i; k < nb.blocks.length; k++) {
    if (k > i && nb.blocks[k].t === "h") break;
    out.push(nb.blocks[k]);
  }
  return out;
}

/** Plain text of one note, used for search snippets and AI context. */
export function noteBodyText(nb, b) {
  return noteBlocks(nb, b)
    .map((x) => (x.t === "text" || x.t === "code" ? x.v : x.t === "h" ? x.v : ""))
    .join("\n");
}

/** Does this note carry anything beyond its title? */
export function noteHasBody(nb, b) {
  if (!b) return false;
  return noteBlocks(nb, b)
    .slice(1)
    .some((x) => (x.t === "text" || x.t === "code" ? x.v : "").trim().length > 0);
}

/** A note is due when its own scheduled review has come up and it has a body. */
export function noteDue(nb, b) {
  if (!b || !b.meta || !noteHasBody(nb, b)) return false;
  return b.meta.dueAt ? b.meta.dueAt <= Date.now() : b.meta.status === "revised" || b.meta.status === "strong";
}

/** All notes (heading blocks) of a notebook, in document order. */
export function notesOf(nb) {
  return (nb.blocks || []).filter((b) => b.t === "h");
}

/** Does this notebook contain anything worth reviewing? */
export function hasContent(nb) {
  return (nb.blocks || []).some((b) =>
    (b.t === "text" || b.t === "code" ? b.v : b.t === "h" ? b.v : "").trim().length > 0);
}
