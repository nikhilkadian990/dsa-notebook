// Recall Mode: turn a note into a short self-test. The note's own structure
// (Problem / Pattern / Observation / Invariant / Approach / Complexity / Edge
// cases / Remember) supplies the questions; you answer first, reveal, then grade.
import { el, btn, toast, esc } from "./util.js";
import { cur, titleOf } from "./state.js";
import { recordReview } from "./store.js";
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

/** Pull each marked section out of the note text so recall answers can be checked. */
export function sections(nb) {
  const out = new Map();
  const text = (nb.blocks || [])
    .filter((b) => b.t === "text" || b.t === "code")
    .map((b) => b.v)
    .join("\n\n");
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

export function start(nb) {
  nb = nb || cur();
  if (!nb) return;
  const secs = sections(nb);
  const cards = [];
  for (const [name, q] of POINTS) {
    const body = secs.get(name.toLowerCase());
    if (body && body.trim()) cards.push({ name, q, a: body });
  }
  // always include the problem statement as context
  const problem = secs.get("problem") || titleOf(nb);

  const d = el("dialog", { class: "rd" });
  const ctr = { answered: 0, total: 0 }; // live recall-card counter
  const head = el("div", { class: "rc-head" },
    el("h3", { text: "Recall — " + titleOf(nb) }),
    el("div", { class: "dim small", text: cards.length + " recall point" + (cards.length === 1 ? "" : "s") + " · answer from memory, then reveal" }),
    el("span", { class: "sp" }),
    btn("✦ AI questions", () => aiQuestions(nb, d, list, ctr), "b sm"),
  );
  const list = el("div", { class: "rc-list" });
  if (!cards.length)
    list.append(el("div", { class: "dim pad", text: "This note has no recognizable sections (Problem / Pattern / Approach / Remember …). Add them and recall will pick them up automatically — or press ✦ AI questions to have the AI write some." }));

  const prog = el("div", { class: "rc-prog dim small" });
  const draw = () => (prog.textContent = ctr.answered + " / " + ctr.total + " revealed");
  ctr.bump = () => { ctr.answered++; draw(); };
  ctr.add = (n) => { ctr.total += n; draw(); };
  ctr.total = cards.length;
  ctr.answered = 0;
  cards.forEach((c, idx) => addCard(list, c, ctr, idx));
  draw();

  d.append(
    head,
    el("div", { class: "dim small rc-ctx", text: "Problem: " + (problem || "").slice(0, 220) }),
    list, prog,
    el("div", { class: "row" },
      el("span", { class: "sp" }),
      btn("Close", () => d.close()),
      cards.length ? btn("Mark all reviewed", () => { recordReview(nb, nb.meta.strength, "good"); d.close(); toast("Review recorded — " + nb.name); }, "b pri") : null,
    ),
  );
  document.body.append(d);
  d.showModal();
  d.addEventListener("close", () => d.remove());
}

/* Ask the configured AI to write extra recall questions for this note and append
   them as cards. Degrades to a clear message when no provider is set up. */
async function aiQuestions(nb, d, list, ctr) {
  if (!ai.aiEnabled()) {
    ai.aiFail(new ai.AIError("No AI provider is set up.", { configMissing: true }));
    return;
  }
  const holder = el("div", { class: "rc-card" }, el("div", { class: "dim small", text: "Asking " + ai.providers()[0].label + " for recall questions…" }));
  list.prepend(holder);
  try {
    const pairs = await ai.aiRecallQuestions(nb);
    holder.remove();
    if (!pairs.length) return toast("The AI did not return usable questions — try again");
    ctr.add(pairs.length);
    for (const p of pairs) addCard(list, { name: "AI", q: p.q, a: p.a }, ctr);
    toast(pairs.length + " AI recall questions added");
  } catch (e) {
    holder.remove();
    ai.aiFail(e);
  }
}


function grade(c, g, d) {
  c.box.classList.add("graded-" + g);
  c.box.querySelectorAll(".rc-grades .b").forEach((b) => (b.disabled = true));
  const f = cur();
  if (f) recordReview(f, f.meta.strength, g);
  toast(g === "again" ? "Flagged — this will come back sooner" : "Review recorded");
}

/* One answer-then-reveal card. Used both by the note's own sections and by the
   AI-generated questions. Each card can also ask the configured AI to judge the
   typed answer against the note. */
function addCard(list, c, ctr, idx) {
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
    btn("Again", () => grade(c, "again"), "b sm"),
    btn("Good", () => grade(c, "good"), "b sm"),
    btn("Easy", () => grade(c, "easy"), "b sm"),
  );
  const checkBtn = btn("✦ Check with AI", async () => {
    const f = cur();
    if (!f) return;
    if (!ai.aiEnabled()) { ai.aiFail(new ai.AIError("No AI provider is set up.", { configMissing: true })); return; }
    toast("Checking your answer…");
    try {
      const { text, provider } = await ai.aiCheck(f, c.q, ans.value);
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
