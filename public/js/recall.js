// Recall Mode: turn a note into a short self-test. The note's own structure
// (Problem / Pattern / Observation / Invariant / Approach / Complexity / Edge
// cases / Remember) supplies the questions; you answer first, reveal, then grade.
//
// Recall works at two scopes:
//   startNote(nb, b)  — one note, from the ⋮ toolbar on its heading
//   start(nb)         — whole-notebook recall; if the notebook has several notes
//                       a picker lists them first
import { el, btn, toast, esc } from "./util.js";
import { S, cur, titleOf, noteTitle } from "./state.js";
import { notesOf, noteBodyText, recordNoteReview, recordReview } from "./store.js";
import { hl } from "./md.js";
import * as ai from "./ai.js";

export const POINTS = [
  ["Pattern / Trigger", "What pattern or trigger signals this approach?"],
  ["Observation", "What is the key observation?"],
  ["Invariant", "What invariant or reasoning makes this work?"],
  ["Approach", "What is the approach, step by step?"],
  ["Complexity", "What is the time and space complexity, and why?"],
  ["Edge Cases", "What edge cases matter?"],
  ["Remember", "What is the main thing to remember?"],
  ["Mistake", "What pitfall should you avoid?"],
];

/** Pull each marked section out of a text so recall answers can be checked. */
export function sections(text) {
  const out = new Map();
  const re = /^#{1,4}\s*(.+?)\s*$/gm;
  let m, last = null;
  const chunks = [];
  while ((m = re.exec(text))) {
    if (last) chunks.push([last, text.slice(re.lastIndex - m[0].length, m.index)]);
    last = m[1];
  }
  if (last) chunks.push([last, text.slice(text.lastIndexOf("\n" + last))]);
  for (const [h, body] of chunks) out.set(h.toLowerCase(), body.trim());
  return out;
}

const sectionsOf = (text) => sections(text);

/** Whole-notebook recall. Opens a picker when there is more than one note. */
export function start(nb) {
  nb = nb || cur();
  if (!nb) return;
  const list = notesOf(nb);
  if (!list.length) return toast("This notebook has no notes yet — insert a heading to start one.");
  if (list.length === 1) return startNote(nb, list[0]);
  // several notes: choose which to recall (the whole file or one note)
  const d = el("dialog", { class: "rd" });
  d.append(el("h3", { text: "Recall — " + nb.name }),
    el("p", { class: "dim small", text: "Pick a note to self-test on, or recall the whole file." }));
  const box = el("div", { class: "rv-due" });
  for (const b of list) {
    const m = b.meta || {};
    box.append(el("div", { class: "rv-due-i" },
      el("span", { class: "rv-due-n", text: noteTitle(b) }),
      el("span", { class: "dim small", text: (m.difficulty || "") + (m.url ? " · has problem link" : "") }),
      el("span", { class: "sp" }),
      btn("Recall", () => { d.close(); startNote(nb, b); }, "b sm"),
    ));
  }
  d.append(box,
    el("div", { class: "row" },
      el("span", { class: "sp" }),
      btn("Close", () => d.close()),
      btn("Recall all " + list.length + " notes", () => { d.close(); startNotes(nb, list); }, "b pri"),
    ),
  );
  document.body.append(d);
  d.showModal();
  d.addEventListener("close", () => d.remove());
}

/** Recall a single note. */
export function startNote(nb, b) {
  if (!nb || !b) return;
  if (!b.meta) b.meta = {};
  run(nb, [{ b, cards: cardsFor(noteBodyText(nb, b)) }]);
}

/** Recall several notes as one session (whole-file recall). */
export function startNotes(nb, blocks) {
  if (!nb || !blocks?.length) return;
  run(nb, blocks.map((b) => ({ b, cards: cardsFor(noteBodyText(nb, b)) })));
}

function cardsFor(text) {
  const secs = sectionsOf(text);
  const cards = [];
  for (const [name, q] of POINTS) {
    const body = secs.get(name.toLowerCase());
    if (body && body.trim()) cards.push({ name, q, a: body });
  }
  return cards;
}

/** Core session. `items` is one entry per note, each with its recall cards. */
function run(nb, items) {
  const flat = [];
  for (const it of items) for (const c of it.cards) flat.push({ ...c, nb, b: it.b });
  const d = el("dialog", { class: "rd" });
  const ctr = { answered: 0, total: 0 };
  const head = el("div", { class: "rc-head" },
    el("h3", { text: "Recall — " + (items.length === 1 ? noteTitle(items[0].b) : nb.name) }),
    el("div", { class: "dim small", text: flat.length + " recall point" + (flat.length === 1 ? "" : "s") + " · answer from memory, then reveal" }),
    el("span", { class: "sp" }),
    btn("✦ AI questions", () => aiQuestions(nb, items[0].b, d, list, ctr), "b sm"),
  );
  const list = el("div", { class: "rc-list" });
  if (!flat.length)
    list.append(el("div", { class: "dim pad", text: "This note has no recognizable sections (Problem / Pattern / Approach / Remember …). Add them and recall will pick them up automatically — or press ✦ AI questions to have the AI write some." }));

  const prog = el("div", { class: "rc-prog dim small" });
  const draw = () => (prog.textContent = ctr.answered + " / " + ctr.total + " revealed");
  ctr.bump = () => { ctr.answered++; draw(); };
  ctr.add = (n) => { ctr.total += n; draw(); };
  ctr.total = flat.length;
  ctr.answered = 0;
  flat.forEach((c, idx) => addCard(list, c, ctr, idx, nb));
  draw();

  d.append(
    head,
    list, prog,
    el("div", { class: "row" },
      el("span", { class: "sp" }),
      btn("Close", () => d.close()),
      flat.length ? btn("Mark all reviewed", () => {
        for (const it of items) recordNoteReview(nb, it.b, "good");
        d.close();
        toast("Review recorded on " + items.length + " note" + (items.length === 1 ? "" : "s"));
      }, "b pri") : null,
    ),
  );
  document.body.append(d);
  d.showModal();
  d.addEventListener("close", () => d.remove());
}

/* Ask the configured AI to write extra recall questions for this note and append
   them as cards. Degrades to a clear message when no provider is set up. */
async function aiQuestions(nb, b, d, list, ctr) {
  if (!ai.aiEnabled()) {
    ai.aiFail(new ai.AIError("No AI provider is set up.", { configMissing: true }));
    return;
  }
  const holder = el("div", { class: "rc-card" }, el("div", { class: "dim small", text: "Asking " + ai.providers()[0].label + " for recall questions…" }));
  list.prepend(holder);
  try {
    const pairs = await ai.aiRecallQuestions(noteBodyText(nb, b), nb, b);
    holder.remove();
    if (!pairs.length) return toast("The AI did not return usable questions — try again");
    ctr.add(pairs.length);
    for (const p of pairs) addCard(list, { name: "AI", q: p.q, a: p.a }, ctr, null, nb);
    toast(pairs.length + " AI recall questions added");
  } catch (e) {
    holder.remove();
    ai.aiFail(e);
  }
}

function grade(c, g, nb) {
  c.box.classList.add("graded-" + g);
  c.box.querySelectorAll(".rc-grades .b").forEach((b) => (b.disabled = true));
  if (c.b) recordNoteReview(nb, c.b, g);
  else if (nb) recordReview(nb, nb.meta.strength, g);
  toast(g === "again" ? "Flagged — this will come back sooner" : "Review recorded");
}

/* One answer-then-reveal card. Used both by the note's own sections and by the
   AI-generated questions. Each card can also ask the configured AI to judge the
   typed answer against the note. */
function addCard(list, c, ctr, idx, nb) {
  const ans = el("textarea", { class: "rc-a", rows: 3, placeholder: "Your answer…" });
  const reveal = btn("Reveal answer", () => {
    ans.disabled = true;
    box.classList.add("shown");
    grades.classList.remove("hidden");
    reveal.classList.add("hidden");
    checkBtn.classList.remove("hidden");
    ctr.bump();
  });
  const grades = el("div", { class: "rc-grades hidden" },
    btn("Again", () => grade(c, "again", nb), "b sm"),
    btn("Good", () => grade(c, "good", nb), "b sm"),
    btn("Easy", () => grade(c, "easy", nb), "b sm"),
  );
  const checkBtn = btn("✦ Check with AI", async () => {
    if (!ai.aiEnabled()) { ai.aiFail(new ai.AIError("No AI provider is set up.", { configMissing: true })); return; }
    toast("Checking your answer…");
    try {
      const { text, provider } = await ai.aiCheck(c.nb || nb, c.q, ans.value);
      ai.answerDialog("Answer check — " + c.q.slice(0, 60), text, provider);
    } catch (e) { ai.aiFail(e); }
  }, "b sm hidden");
  const box = el("div", { class: "rc-card" },
    el("div", { class: "rc-q", text: (idx != null ? idx + 1 + ". " : "• ") + c.q }),
    ans,
    el("div", { class: "rc-row" }, reveal, el("span", { class: "sp" }), grades),
    el("div", { class: "rc-row", style: "margin-top:6px" }, checkBtn),
    el("div", { class: "rc-ans", html: hl(c.a) }),
  );
  c.box = box;
  list.append(box);
}
