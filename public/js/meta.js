// Per-notebook problem metadata: status, knowledge state, difficulty, source,
// problem link, tags, related notebooks, mistakes and the "why does this work?" prompt.
// Kept deliberately compact — one collapsible strip above the page.
import { el, btn, uid, toast, when, DAY } from "./util.js";
import { S, cur, mark, allTags, nbById, titleOf } from "./state.js";
import { STRENGTHS, STATUSES, STRENGTH_LABEL, STATUS_LABEL, save, recordReview, dueNow } from "./store.js";
import { openSearch } from "./search.js";

const DIFFS = ["", "Easy", "Medium", "Hard"];
const SOURCES = ["", "LeetCode", "GeeksforGeeks", "Striver A2Z", "HackerRank", "Codeforces", "NeetCode", "Book", "Other"];

let open = false;

export function renderMeta() {
  const bar = $("#metabar");
  if (!bar) return;
  const f = cur();
  if (!f) { bar.replaceChildren(); return; }
  bar.replaceChildren();
  bar.className = "metabar" + (open ? " open" : "");

  const m = f.meta;
  const head = el("div", { class: "mrow" },
    el("button", { class: "b sm mtoggle", text: open ? "▾" : "▸", title: "Show / hide problem metadata", onclick: () => { open = !open; renderMeta(); } }),
    el("span", { class: "mtitle", text: f.name }),
    pill(STATUS_LABEL[m.status] || "Unsolved", "st-" + m.status),
    pill(STRENGTH_LABEL[m.strength] || "Learning", "kr-" + m.strength),
    (f.tags || []).length ? el("span", { class: "mtags", text: f.tags.map((t) => "#" + t).join(" ") }) : null,
    el("span", { class: "sp" }),
    dueNow(f) ? pill("Due now", "due") : null,
    (f.mistakes?.length ? pill(f.mistakes.length + " mistake" + (f.mistakes.length === 1 ? "" : "s"), "mis") : null),
  );
  bar.append(head);
  if (!open) return;

  const sel = (list, val, cb, placeholder) => {
    const s = el("select", { class: "msel" });
    for (const v of list)
      s.append(el("option", { value: v, text: v || placeholder, selected: v === val }));
    s.addEventListener("change", () => { cb(s.value); });
    return s;
  };

  const fld = (label, node) => el("label", { class: "mfld" }, el("span", { text: label }), node);

  const setMeta = (k, v) => { m[k] = v; mark(f); save(f, { meta: m }); renderMeta(); };

  const grid = el("div", { class: "mgrid" },
    fld("Status", sel(STATUSES, m.status, (v) => setMeta("status", v), "—")),
    fld("Knowledge", sel(STRENGTHS, m.strength, (v) => setMeta("strength", v), "—")),
    fld("Difficulty", sel(DIFFS, m.difficulty, (v) => setMeta("difficulty", v), "—")),
    fld("Source", sel(SOURCES, m.source, (v) => setMeta("source", v), "—")),
    fld("Problem link", el("input", {
      class: "min", value: m.url || "", placeholder: "https://leetcode.com/problems/…", spellcheck: false,
      oninput: (e) => { m.url = e.target.value; save(f, { meta: m }); },
      onblur: () => mark(f),
    })),
    fld("Tags (comma separated)", el("input", {
      class: "min", value: (f.tags || []).join(", "), placeholder: "two-pointers, sliding-window", spellcheck: false,
      onchange: (e) => {
        f.tags = [...new Set(e.target.value.split(",").map((t) => t.trim().replace(/^#/, "").toLowerCase()).filter(Boolean))];
        mark(f); save(f, { tags: f.tags }); renderMeta();
        import("./app.js").then((x) => x.afterDataChange());
      },
    })),
    fld("Last reviewed", el("span", { class: "mval", text: when(f.reviews?.length ? f.reviews[f.reviews.length - 1].at : 0) })),
    fld("Next due", el("span", { class: "mval", text: f.dueAt ? when(f.dueAt) : "not scheduled" })),
  );
  bar.append(grid);

  const acts = el("div", { class: "mrow acts" },
    btn("✦ AI prompt", () => import("./ai.js").then((m) => m.promptDialog(f)), "b"),
    btn("◈ Recall mode", () => import("./recall.js").then((m) => m.start(f)), "b"),
    btn("Why does this work?", () => whyDialog(f), "b"),
    btn("⚑ Add mistake", () => mistakeDialog(f), "b"),
    btn("Related", () => relatedDialog(f), "b"),
    m.url ? el("a", { class: "b sm", href: m.url, target: "_blank", rel: "noopener", text: "Open problem ↗" }) : null,
  );
  bar.append(acts);

  if (f.mistakes?.length) {
    const list = el("div", { class: "mlist" });
    for (const ms of f.mistakes)
      list.append(el("div", { class: "mmis" },
        el("div", { class: "mmis-h", text: "⚑ " + new Date(ms.at).toLocaleDateString() },
          el("span", { class: "sp" }),
          el("button", { class: "ib", text: "✕", title: "Remove mistake", onclick: () => { f.mistakes = f.mistakes.filter((x) => x !== ms); mark(f); save(f, { mistakes: f.mistakes }); renderMeta(); } }),
        ),
        el("div", { text: "Wrong: " + ms.what }),
        ms.why ? el("div", { class: "dim", text: "Why: " + ms.why }) : null,
        ms.correct ? el("div", { text: "Correct idea: " + ms.correct }) : null,
        ms.remember ? el("div", { class: "dim", text: "Remember: " + ms.remember }) : null,
      ));
    bar.append(el("div", { class: "pad" }, el("div", { class: "sr-head", text: "Mistake log" }), list));
  }
}

function pill(text, cls) {
  return el("span", { class: "pill " + (cls || ""), text });
}

export function whyDialog(f) {
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
        d.close();
        if (!a) return toast("Write an answer first — that is the whole point.");
        import("./ai.js").then((m) => m.checkAnswer(f, prompts.find((p) => d.querySelector("input[name=why]:checked")?.value === p) || prompts[0], a));
      }, "b pri"),
    ),
  );
  document.body.append(d);
  d.showModal();
  d.addEventListener("close", () => d.remove());
}

export function mistakeDialog(f) {
  const d = el("dialog", { class: "wd" });
  const inp = (ph) => el("textarea", { class: "why-a", rows: 2, placeholder: ph });
  const what = inp("What I did wrong…"), why = inp("Why I think I made that mistake…"),
    correct = inp("What the correct idea was…"), remember = inp("What I should remember next time…");
  d.append(el("h3", { text: "⚑ Add a mistake" }),
    el("p", { class: "dim small", text: "Mistakes are reviewable separately and can drive a focused revision session." }),
    el("label", { class: "mfld", text: "What I did wrong" }, what),
    el("label", { class: "mfld", text: "Why I made it" }, why),
    el("label", { class: "mfld", text: "The correct idea" }, correct),
    el("label", { class: "mfld", text: "Remember next time" }, remember),
    el("div", { class: "row" },
      el("span", { class: "sp" }),
      btn("Cancel", () => d.close()),
      btn("Save mistake", () => {
        if (!what.value.trim()) return toast("Describe what you did wrong.");
        f.mistakes.push({ id: uid(), at: Date.now(), what: what.value.trim(), why: why.value.trim(), correct: correct.value.trim(), remember: remember.value.trim() });
        mark(f); save(f, { mistakes: f.mistakes });
        d.close();
        renderMeta();
        toast("Mistake logged");
      }, "b pri"),
    ),
  );
  document.body.append(d);
  d.showModal();
  d.addEventListener("close", () => d.remove());
}

function relatedDialog(f) {
  const d = el("dialog", { class: "wd" });
  const box = el("div", { class: "rel-list" });
  const others = S.notebooks.filter((x) => x.id !== f.id);
  const chosen = new Set(f.meta.related || []);
  for (const o of others) {
    const cb = el("input", { type: "checkbox" });
    cb.checked = chosen.has(o.id);
    cb.addEventListener("change", () => { cb.checked ? chosen.add(o.id) : chosen.delete(o.id); });
    box.append(el("label", { class: "rel-i" }, cb, el("span", { text: o.name }), el("span", { class: "dim small", text: " · " + titleOf(o) })));
  }
  if (!others.length) box.append(el("div", { class: "dim small pad", text: "No other notebooks yet." }));
  d.append(el("h3", { text: "Related notebooks" }),
    el("p", { class: "dim small", text: "Linked problems and patterns show up here and in the outline." }), box,
    el("div", { class: "row" },
      el("span", { class: "sp" }),
      btn("Cancel", () => d.close()),
      btn("Save", () => {
        f.meta.related = [...chosen];
        mark(f); save(f, { meta: f.meta });
        d.close(); renderMeta(); toast("Related notebooks updated");
      }, "b pri"),
    ),
  );
  document.body.append(d);
  d.showModal();
  d.addEventListener("close", () => d.remove());
}

export { recordReview };
