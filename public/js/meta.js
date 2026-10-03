// Per-note metadata. In this notebook every note starts with a heading, and that
// heading carries its own strip: problem link, difficulty, learning stage, tags,
// mistakes and the recall / AI actions. The strip is inline (no dialog): it opens
// above the note body from the ⋮ button on the heading.
import { $, el, btn, uid, toast, when } from "./util.js";
import { S, cur, mark, allTags, nbById, titleOf, noteTitle } from "./state.js";
import {
  STRENGTHS, STATUSES, STRENGTH_LABEL, STATUS_LABEL, save,
  recordNoteReview, freshNoteMeta, noteHasBody, noteBodyText,
} from "./store.js";
import { openSearch } from "./search.js";

const DIFFS = ["", "Easy", "Medium", "Hard"];
const SOURCES = ["", "LeetCode", "GeeksforGeeks", "Striver A2Z", "HackerRank", "Codeforces", "NeetCode", "Book", "Other"];

/** Render one note's toolbar into `host`. `changed` is called after any edit so
 *  the heading pills can be refreshed in place. */
export function renderNoteBar(nb, b, host, changed) {
  if (!nb || !b) return;
  if (!b.meta) b.meta = freshNoteMeta();
  const m = b.meta;
  host.replaceChildren();
  host.className = "nh-body";

  const setM = (k, v) => { m[k] = v; save(nb, { blocks: nb.blocks, updatedAt: Date.now() }); changed?.(); };

  const sel = (list, val, cb, placeholder) => {
    const s = el("select", { class: "msel" });
    for (const v of list)
      s.append(el("option", { value: v, text: v || placeholder, selected: v === val }));
    s.addEventListener("change", () => { cb(s.value); });
    return s;
  };
  const fld = (label, node) => el("label", { class: "mfld" }, el("span", { text: label }), node);

  const grid = el("div", { class: "mgrid" },
    fld("Status", sel(STATUSES, m.status, (v) => { setM("status", v); host.rerender?.(); }, "—")),
    fld("Stage", sel(STRENGTHS, m.strength, (v) => { setM("strength", v); host.rerender?.(); }, "—")),
    fld("Difficulty", sel(DIFFS, m.difficulty, (v) => setM("difficulty", v), "—")),
    fld("Source", sel(SOURCES, m.source, (v) => setM("source", v), "—")),
    fld("Problem link", el("input", {
      class: "min", value: m.url || "", placeholder: "https://leetcode.com/problems/…", spellcheck: false,
      oninput: (e) => { m.url = e.target.value; save(nb, { blocks: nb.blocks }); },
      onblur: () => { mark(nb); changed?.(); },
    })),
    fld("Tags (comma separated)", el("input", {
      class: "min", value: (m.tags || []).join(", "), placeholder: "two-pointers, merge-pattern", spellcheck: false,
      onchange: (e) => {
        m.tags = [...new Set(e.target.value.split(",").map((t) => t.trim().replace(/^#/, "").toLowerCase()).filter(Boolean))];
        setM("tags", m.tags);
        import("./app.js").then((x) => x.afterDataChange());
      },
    })),
    fld("Related questions", el("input", {
      class: "min", value: (m.related || []).join(", "), placeholder: "Merge Sorted Array, Sort Colors", spellcheck: false,
      onchange: (e) => {
        m.related = e.target.value.split(",").map((t) => t.trim()).filter(Boolean);
        setM("related", m.related);
      },
    })),
    fld("Last reviewed", el("span", { class: "mval", text: when(m.reviews?.length ? m.reviews[m.reviews.length - 1].at : 0) })),
    fld("Next due", el("span", { class: "mval", text: m.dueAt ? when(m.dueAt) : "not scheduled" })),
  );
  host.append(grid);

  const acts = el("div", { class: "mrow acts" },
    btn("◈ Recall this note", () => import("./recall.js").then((r) => r.startNote(nb, b)), "b"),
    btn("✦ AI prompt", () => import("./ai.js").then((a) => a.promptDialog(noteContext(nb, b))), "b"),
    btn("Why?", () => whyDialog(nb, b), "b"),
    btn("⚑ Mistake", () => mistakeDialog(nb, b, () => rerender()), "b"),
    btn("✕ Delete note", () => {
      const i = nb.blocks.indexOf(b);
      // remove the heading and everything up to the next note
      let j = i + 1;
      while (j < nb.blocks.length && nb.blocks[j].t !== "h") j++;
      nb.blocks.splice(i, j - i);
      mark(nb);
      import("./editor.js").then((e) => e.render());
      toast("Note deleted");
    }, "b"),
    m.url ? el("a", { class: "b sm", href: m.url, target: "_blank", rel: "noopener", text: "Open problem ↗" }) : null,
  );
  host.append(acts);

  if (m.mistakes?.length) {
    const list = el("div", { class: "mlist" });
    for (const ms of m.mistakes)
      list.append(el("div", { class: "mmis" },
        el("div", { class: "mmis-h", text: "⚑ " + new Date(ms.at).toLocaleDateString() },
          el("span", { class: "sp" }),
          el("button", {
            class: "ib", text: "✕", title: "Remove mistake",
            onclick: () => { m.mistakes = m.mistakes.filter((x) => x !== ms); setM("mistakes", m.mistakes); rerender(); },
          }),
        ),
        el("div", { text: "Wrong: " + ms.what }),
        ms.why ? el("div", { class: "dim", text: "Why: " + ms.why }) : null,
        ms.correct ? el("div", { text: "Correct idea: " + ms.correct }) : null,
        ms.remember ? el("div", { class: "dim", text: "Remember: " + ms.remember }) : null,
      ));
    host.append(el("div", { class: "pad", style: "padding-top:2px" }, el("div", { class: "sr-head", text: "Mistake log" }), list));
  }

  function rerender() { renderNoteBar(nb, b, host, changed); }
  host.rerender = rerender;
}

/* Compact markdown of one note, for the "AI prompt" action. */
export function noteContext(nb, b, limit = 6000) {
  const m = b.meta;
  const lines = [
    "Note: " + noteTitle(b),
    "Notebook: " + nb.name,
    m.difficulty ? "Difficulty: " + m.difficulty : null,
    m.url ? "Problem: " + m.url : null,
    (m.tags?.length ? "Tags: " + m.tags.map((t) => "#" + t).join(" ") : null),
    "",
    noteBodyText(nb, b),
  ];
  return lines.filter((x) => x !== null).join("\n").slice(0, limit);
}

export function whyDialog(nb, b) {
  const d = el("dialog", { class: "wd" });
  const prompts = [
    "Why does this pointer move the way it does?",
    "Why is the greedy / one-way choice here valid?",
    "Why does sorting help this problem?",
    "What invariant is being maintained?",
    "Why is the complexity what it is (O(n), O(log n)…)?",
    "What would break if the input were empty / reversed / huge?",
  ];
  d.append(el("h3", { text: "Why does this work?" }),
    el("p", { class: "dim small", text: "Explain the reasoning before you reveal the note. Answering in your own words is what makes it stick." }),
    ...prompts.map((p) => el("label", { class: "why-q" },
      el("input", { type: "radio", name: "why", value: p }),
      el("span", { text: p }),
    )),
    el("label", { class: "mfld", text: "Your answer" },
      el("textarea", { class: "why-a", rows: 4, placeholder: "Write the explanation from memory…" }),
    ),
    el("div", { class: "row" },
      el("span", { class: "sp" }),
      btn("Cancel", () => d.close()),
      btn("Check against the note", () => {
        const a = d.querySelector(".why-a").value.trim();
        const q = prompts.find((p) => d.querySelector("input[name=why]:checked")?.value === p) || prompts[0];
        d.close();
        if (!a) return toast("Write an answer first — that is the whole point.");
        import("./ai.js").then((m2) => m2.checkAnswer(noteContext(nb, b), q, a));
      }, "b pri"),
    ),
  );
  document.body.append(d);
  d.showModal();
  d.addEventListener("close", () => d.remove());
}

export function mistakeDialog(nb, b, done) {
  const d = el("dialog", { class: "wd" });
  const inp = (ph) => el("textarea", { class: "why-a", rows: 2, placeholder: ph });
  const what = inp("What I did wrong…"), why = inp("Why I think I made that mistake…"),
    correct = inp("What the correct idea was…"), remember = inp("What I should remember next time…");
  d.append(el("h3", { text: "⚑ Add a mistake — " + noteTitle(b) }),
    el("p", { class: "dim small", text: "Mistakes are attached to this note and drive focused revision sessions." }),
    el("label", { class: "mfld", text: "What I did wrong" }, what),
    el("label", { class: "mfld", text: "Why I made it" }, why),
    el("label", { class: "mfld", text: "The correct idea" }, correct),
    el("label", { class: "mfld", text: "Remember next time" }, remember),
    el("div", { class: "row" },
      el("span", { class: "sp" }),
      btn("Cancel", () => d.close()),
      btn("Save mistake", () => {
        if (!what.value.trim()) return toast("Describe what you did wrong.");
        if (!b.meta) b.meta = freshNoteMeta();
        b.meta.mistakes.push({ id: uid(), at: Date.now(), what: what.value.trim(), why: why.value.trim(), correct: correct.value.trim(), remember: remember.value.trim() });
        save(nb, { blocks: nb.blocks, updatedAt: Date.now() });
        d.close();
        done?.();
        toast("Mistake logged on this note");
      }, "b pri"),
    ),
  );
  document.body.append(d);
  d.showModal();
  d.addEventListener("close", () => d.remove());
}

/* Kept for the rare notebook-level action (export, dashboard). */
export { recordNoteReview };
