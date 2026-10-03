// Regression tests for the snapshot-echo data-loss bug: a Firestore snapshot
// can land mid-edit (inside the save debounce window, or between a flush and its
// write acknowledgement) and must not replace the editor's live copy, orphan
// its closures, or drop a freshly-created notebook.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(pathToFileURL("./test/dom-loader.mjs").href);

const { mergeSnapshots, freshNotebook, tombstone } = await import("../public/js/store.js");

const mk = (id, name, updatedAt, blocks) =>
  Object.assign(freshNotebook(name, null), { id, updatedAt, blocks });

const H = (v) => ({ t: "h", v, l: 2, meta: null });

test("a snapshot echo keeps the live copy when writes are still queued", () => {
  // the user has typed notes + a second heading that the debounce has not flushed
  const live = mk("a1", "Arrays.md", 1000, [
    H("Arrays"),
    { t: "text", v: "notes about arrays" },
    H("Two Pointers"),
    { t: "text", v: "" },
  ]);
  // the server snapshot predates those edits (the create write only)
  const snap = [mk("a1", "Arrays.md", 900, [H("Arrays"), { t: "text", v: "" }])];

  const { list, changed } = mergeSnapshots([live], snap, [live.id]);
  const kept = list.find((x) => x.id === live.id);
  assert.equal(kept, live, "the editor's live object is kept, not swapped out");
  assert.equal(kept.blocks[2].v, "Two Pointers", "the second headline survives");
  assert.equal(kept.blocks[1].v, "notes about arrays", "the notes survive");
  assert.deepEqual(changed, [], "no view refresh is needed");
});

test("a live copy newer than the snapshot wins even with an empty queue", () => {
  // edits landed after the last flush but the write's acknowledgement snapshot
  // still carries the older field set
  const live = mk("s1", "Stacks.md", 1000, [H("Stacks")]);
  const snap = [mk("s1", "Stacks.md", 999, [H("Old title")])];

  const { list } = mergeSnapshots([live], snap, []);
  assert.equal(list.find((x) => x.id === live.id), live);
});

test("a genuinely newer server copy replaces the local one and is reported", () => {
  const live = mk("q1", "Queues.md", 1000, [H("Queues")]);
  const newer = mk("q1", "Queues.md", 5000, [H("Queues (edited on another device)")]);

  const { list, changed } = mergeSnapshots([live], [newer], []);
  assert.equal(list.find((x) => x.id === live.id), newer);
  assert.deepEqual(changed, [live.id], "the view knows to refresh");
});

test("an identical server copy is accepted without flagging a refresh", () => {
  const live = mk("h1", "Heaps.md", 1000, [H("Heaps")]);
  const echo = mk("h1", "Heaps.md", 1000, [H("Heaps")]);

  const { changed } = mergeSnapshots([live], [echo], []);
  assert.deepEqual(changed, [], "a no-op echo must not re-render and drop the caret");
});

test("a brand-new local notebook with a queued write is not dropped", () => {
  const live = mk("g1", "Greedy.md", 1000, [H("Greedy")]);
  const other = mk("o1", "Other.md", 1000, [H("Other")]);

  const { list } = mergeSnapshots([live, other], [other], [live.id]);
  assert.ok(list.some((x) => x.id === live.id), "the un-flushed new notebook survives");
  assert.ok(list.some((x) => x.id === other.id));
});

test("a notebook deleted locally is not resurrected by a stale echo", () => {
  const gone = mk("d1", "Deleted.md", 1000, [H("Deleted")]);
  const stale = mk("d1", "Deleted.md", 500, [H("Deleted")]);
  tombstone("d1");

  const { list } = mergeSnapshots([gone], [stale], []); // no queued write for it
  assert.ok(!list.some((x) => x.id === gone.id), "stays deleted");
});
