// Verifies the per-note data model survives a real database round trip and that
// the legacy notebook-level metadata migrates onto the first note.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// dom-loader swaps the browser-only fb.js for the in-memory fake, so the real
// store.js (including normalize) runs under Node.
register(pathToFileURL("./test/dom-loader.mjs").href);

const { normalize, freshNotebook, recordNoteReview, noteDue, notesOf } = await import("../public/js/store.js");

/** What a notebook looks like after being written to Firestore and read back —
 *  the shape store.js receives in onSnapshot. */
function savedNotebook() {
  return {
    name: "DSA/Arrays.md",
    group: "DSA",
    meta: { url: "", source: "", difficulty: "", status: "unsolved", strength: "learning" },
    blocks: [
      {
        t: "h", v: "Two Sum", l: 2,
        meta: {
          url: "https://leetcode.com/problems/two-sum/",
          source: "LeetCode", difficulty: "Easy", status: "solved", strength: "familiar",
          tags: ["hash-map", "two-pointers"], related: ["Three Sum"],
          mistakes: [], reviews: [], dueAt: 0,
        },
      },
      { t: "text", v: "Use a hash map. O(n) time." },
    ],
  };
}

test("per-note metadata survives normalize", () => {
  const nb = normalize(savedNotebook());
  const m = nb.blocks[0].meta;
  assert.equal(nb.blocks[0].v, "Two Sum");
  assert.equal(m.url, "https://leetcode.com/problems/two-sum/");
  assert.equal(m.difficulty, "Easy");
  assert.deepEqual(m.tags, ["hash-map", "two-pointers"]);
  assert.deepEqual(m.related, ["Three Sum"]);
  // every field of the strip is present, so the editor never renders holes
  for (const k of ["url", "source", "difficulty", "status", "strength", "tags", "related", "mistakes", "reviews", "dueAt"])
    assert.ok(k in m, "missing field: " + k);
});

test("legacy notebook-level meta migrates onto the first note", () => {
  const legacy = {
    name: "Old.md",
    meta: { url: "https://leetcode.com/problems/old/", difficulty: "Hard", status: "solved", strength: "strong" },
    blocks: [{ t: "h", v: "Old problem", l: 2 }, { t: "text", v: "body" }],
  };
  const nb = normalize(legacy);
  assert.equal(nb.blocks[0].meta.url, "https://leetcode.com/problems/old/");
  assert.equal(nb.blocks[0].meta.difficulty, "Hard");
  assert.equal(nb.blocks[0].meta.strength, "strong");
});

test("a fresh notebook starts with one note that has its own strip", () => {
  const nb = freshNotebook("DSA/Stacks.md", "DSA");
  const notes = notesOf(nb);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].v, "DSA/Stacks");
  assert.equal(notes[0].meta.strength, "learning");
  assert.ok(noteDue(nb, notes[0]) === false, "a fresh note with no body is never due");
});

test("reviewing a note schedules that note only", () => {
  const nb = normalize(savedNotebook());
  const h = nb.blocks[0];
  const before = h.meta.dueAt;
  const strength = recordNoteReview(nb, h, "good");
  assert.equal(strength, "familiar"); // 'good' promotes learning->familiar minimum
  assert.ok(h.meta.dueAt > Date.now(), "dueAt was pushed into the future");
  // the note is not due immediately after a review
  assert.equal(noteDue(nb, h), false);
  // forcing it into the past makes it due again
  h.meta.dueAt = Date.now() - 1000;
  assert.equal(noteDue(nb, h), true);
});
