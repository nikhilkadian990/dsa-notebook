// Revision system: daily scheduled reviews, tag/state-based sessions, mixed
// (interleaved) sessions and mistake-focused sessions. Sessions run through the
// same answer-then-reveal flow as Recall Mode.
import { el, btn, toast, when, DAY } from "./util.js";
import { S, cur, nbById, titleOf, allTags, findByTag, mark } from "./state.js";
import { STRENGTHS, STRENGTH_LABEL, recordReview, dueNow, save, INTERVAL } from "./store.js";
import { hl } from "./md.js";
import * as recall from "./recall.js";
import * as ai from "./ai.js";

export { POINTS } from "./recall.js";

export function dueList() {
  return S.notebooks.filter((nb) => dueNow(nb));
}

export function openRevise() {
  const d = el("dialog", { class: "rd rv" });
  const due = dueList();
  const weak = S.notebooks.filter((nb) => nb.meta.strength === "learning" || nb.meta.strength === "familiar");
  const withMistakes = S.notebooks.filter((nb) => nb.mistakes?.length);
  const tags = allTags();

  const card = (title, sub, count, act, primary) =>
    el("div", { class: "rv-card" + (primary ? " pri" : "") },
      el("div", { class: "rv-t", text: title }),
      el("div", { class: "rv-s dim small", text: sub }),
      el("div", { class: "rv-row" },
        el("span", { class: "pill", text: count + " ready" }),
        el("span", { class: "sp" }),
        count ? btn("Start", act, "b pri") : btn("Nothing yet", () => toast("Nothing to review here right now")),
      ),
    );

  const list = el("div", { class: "rv-list" },
    card("Due today", "Notebooks whose scheduled review has come up.", due.length, () => session(due), true),
    card("AI study plan for today", "The AI looks at everything due and builds an interleaved, pattern-mixed sheet with a focus question per problem.", due.length + weak.length, () => aiSheet(due.length ? due : weak)),
    card("Mixed / interleaved", "A shuffled set across tags and states, so you practise choosing an approach rather than recalling one pattern.", Math.min(10, weak.length + due.length), () => sessionMixed()),
    card("By tag + knowledge state", "e.g. all Getting Familiar two-pointer problems.", tags.length ? Math.max(...tags.map((t) => findByTag(t[0]).length)) : 0, () => tagStateDialog(d)),
    card("Mistakes review", "Sessions built from your logged mistakes.", withMistakes.length, () => sessionMistakes()),
  );

  if (due.length) {
    const box = el("div", { class: "rv-due" });
    for (const nb of [...due].sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0)).slice(0, 8))
      box.append(el("div", { class: "rv-due-i" },
        el("span", { class: "rv-due-n", text: titleOf(nb) }),
        el("span", { class: "dim small", text: nb.name }),
        el("span", { class: "sp" }),
        el("span", { class: "dim small", text: "due " + when(nb.dueAt) }),
        btn("Open", () => { d.close(); import("./app.js").then((m) => m.openNotebookById(nb.id)); }),
      ));
    list.prepend(el("div", {}, el("div", { class: "sr-head", text: "Due today (" + due.length + ")" }), box));
  }

  d.append(el("h3", { text: "Revision" }), list,
    el("div", { class: "row" }, el("span", { class: "sp" }), btn("Close", () => d.close())));
  document.body.append(d);
  d.showModal();
  d.addEventListener("close", () => d.remove());
}

function tagStateDialog(parent) {
  const d = el("dialog", { class: "rd" });
  const tagSel = el("select", { class: "msel" });
  tagSel.append(el("option", { value: "", text: "any tag" }));
  for (const [t, n] of allTags()) tagSel.append(el("option", { value: t, text: "#" + t + " (" + n + ")" }));
  const stSel = el("select", { class: "msel" });
  stSel.append(el("option", { value: "", text: "any state" }));
  for (const s of STRENGTHS) stSel.append(el("option", { value: s, text: STRENGTH_LABEL[s] }));
  const foldSel = el("select", { class: "msel" });
  foldSel.append(el("option", { value: "", text: "any folder" }));
  for (const g of [...new Set(S.notebooks.map((n) => n.group).filter(Boolean))])
    foldSel.append(el("option", { value: g, text: g }));
  const lim = el("input", { class: "min", type: "number", value: 10, min: 1, max: 50, style: "width:70px" });

  const preview = el("div", { class: "rv-due" });
  const upd = () => {
    preview.replaceChildren();
    const hits = pick({ tag: tagSel.value, state: stSel.value, folder: foldSel.value, limit: +lim.value || 10 });
    if (!hits.length) preview.append(el("div", { class: "dim small pad", text: "No notebooks match — loosen the filters." }));
    for (const nb of hits.slice(0, 12))
      preview.append(el("div", { class: "rv-due-i" },
        el("span", { text: titleOf(nb) }),
        el("span", { class: "dim small", text: nb.name }),
        el("span", { class: "sp" }),
        el("span", { class: "dim small", text: STRENGTH_LABEL[nb.meta.strength] }),
      ));
    if (hits.length > 12) preview.append(el("div", { class: "dim small pad", text: "…and " + (hits.length - 12) + " more" }));
  };
  for (const s of [tagSel, stSel, foldSel, lim]) s.addEventListener("change", upd);
  upd();

  d.append(el("h3", { text: "Tag / state session" }),
    el("div", { class: "mgrid" },
      el("label", { class: "mfld" }, el("span", { text: "Tag" }), tagSel),
      el("label", { class: "mfld" }, el("span", { text: "Knowledge state" }), stSel),
      el("label", { class: "mfld" }, el("span", { text: "Folder" }), foldSel),
      el("label", { class: "mfld" }, el("span", { text: "How many" }), lim),
    ),
    preview,
    el("div", { class: "row" },
      el("span", { class: "sp" }),
      btn("Back", () => { d.close(); openRevise(); }),
      btn("Start session", () => {
        const hits = pick({ tag: tagSel.value, state: stSel.value, folder: foldSel.value, limit: +lim.value || 10 });
        d.close();
        if (!hits.length) return toast("Nothing matches those filters");
        session(hits);
      }, "b pri"),
    ),
  );
  document.body.append(d);
  d.showModal();
  d.addEventListener("close", () => d.remove());
}

/* Have the AI design today's revision sheet: it receives the due/weak queue with
   tags, knowledge states and review history as context, and returns an
   interleaved plan with a focus question per problem. */
async function aiSheet(pool) {
  if (!pool?.length) return toast("Nothing to build a sheet from — the queue is empty");
  if (!ai.aiEnabled()) {
    ai.aiFail(new ai.AIError("No AI provider is set up.", { configMissing: true }));
    return;
  }
  const d = el("dialog", { class: "rd" });
  d.append(el("h3", { text: "AI study plan for today" }),
    el("div", { class: "dim small pad", text: "Asking " + ai.providers()[0].label + " to build an interleaved sheet for " + pool.length + " notebook(s)…" }));
  document.body.append(d);
  d.showModal();
  d.addEventListener("close", () => d.remove());
  try {
    const { text, provider } = await ai.aiSheet(pool,
      "Goal for today: " + (S.prefs.dailyGoal || 5) + " reviews. Prefer interleaving different patterns back to back.");
    d.replaceChildren(
      el("h3", { text: "AI study plan for today" }),
      el("div", { class: "dim small", style: "margin-top:-6px;margin-bottom:8px", text: "via " + provider.label }),
      el("div", { class: "ai-out", html: ai.mdSheet(text) }),
      el("div", { class: "row" },
        el("span", { class: "sp" }),
        btn("Close", () => d.close()),
        btn("Start this session", () => { d.close(); session(pool); }, "b pri"),
      ),
    );
  } catch (e) {
    d.close();
    ai.aiFail(e);
  }
}

function pick({ tag, state, folder, limit }) {
  let hits = S.notebooks.filter((nb) =>
    (!tag || (nb.tags || []).includes(tag)) &&
    (!state || nb.meta.strength === state) &&
    (!folder || nb.group === folder));
  hits.sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));
  return hits.slice(0, limit || 10);
}

function sessionMixed(limit = 10) {
  const pool = dueList().concat(S.notebooks.filter((nb) => nb.meta.strength === "learning" || nb.meta.strength === "familiar"));
  // interleave: cycle through different tags/folders so consecutive cards differ
  const byKey = new Map();
  for (const nb of pool) {
    const k = (nb.tags?.[0] || nb.group || "other");
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(nb);
  }
  const keys = [...byKey.keys()].sort(() => Math.random() - 0.5);
  const out = [];
  for (let i = 0; out.length < limit; i++)
    for (const k of keys) {
      const arr = byKey.get(k);
      if (arr[Math.floor(i / keys.length)]) out.push(arr[Math.floor(i / keys.length)]);
      if (out.length >= limit) break;
    }
  if (out.length < 2) return toast("Not enough notebooks for a mixed session yet");
  session([...new Set(out)]);
}

function sessionMistakes() {
  const hits = S.notebooks.filter((nb) => nb.mistakes?.length);
  if (!hits.length) return toast("You have not logged any mistakes yet");
  session(hits);
}

function session(list) {
  if (!list?.length) return toast("Nothing to review");
  const d = el("dialog", { class: "rd" });
  let i = 0;
  const order = [...list].sort(() => Math.random() - 0.5);
  const counter = el("div", { class: "dim small" });
  const stage = el("div");

  const draw = () => {
    const nb = order[i];
    stage.replaceChildren();
    counter.textContent = `Notebook ${i + 1} of ${order.length} · knowledge: ${STRENGTH_LABEL[nb.meta.strength]}`;
    const secs = recall.sections(nb);
    const prob = secs.get("problem") || titleOf(nb);
    const points = [];
    for (const [name, q] of recall.POINTS) {
      const body = secs.get(name.toLowerCase());
      if (body?.trim()) points.push({ q, a: body });
    }
    if (!points.length) points.push({ q: "Explain this problem and its approach from memory.", a: (nb.blocks || []).map((b) => b.t === "text" || b.t === "code" ? b.v : b.t === "h" ? "## " + b.v : "").join("\n\n") });

    const shown = new Set();
    const cardBox = el("div", { class: "rc-card" },
      el("div", { class: "rc-q", text: titleOf(nb) }),
      el("div", { class: "dim small rc-ctx", text: "Problem: " + (prob || "").slice(0, 220) }),
    );
    const qa = el("div", { class: "rc-qa" });
    const revealAll = btn("Reveal all", () => {
      cardBox.querySelectorAll(".rc-ans").forEach((x) => x.classList.remove("hidden"));
      grades.classList.remove("hidden");
      revealAll.classList.add("hidden");
    });
    for (const [k, p] of points.entries()) {
      const ans = el("div", { class: "rc-ans hidden", html: hl(p.a) });
      shown.add(k);
      qa.append(el("div", { class: "rc-pt" },
        el("div", { class: "rc-q small", text: "• " + p.q }),
        el("div", { class: "rc-row" }, btn("Show", () => ans.classList.remove("hidden"))),
        ans,
      ));
    }
    cardBox.append(qa);
    const grades = el("div", { class: "rc-grades hidden" },
      btn("Again", () => grade("again"), "b sm"),
      btn("Good", () => grade("good"), "b sm"),
      btn("Easy", () => grade("easy"), "b sm"),
    );
    stage.append(cardBox, el("div", { class: "rc-row" }, revealAll, el("span", { class: "sp" }), grades),
      el("div", { class: "rc-row" },
        el("span", { class: "sp" }),
        btn("Skip", () => { i++; i < order.length ? draw() : done(); }),
        btn("Open notebook", () => { d.close(); import("./app.js").then((m) => m.openNotebookById(nb.id)); }),
      ),
    );
    function grade(g) {
      recordReview(nb, nb.meta.strength, g);
      i++;
      if (i < order.length) draw();
      else done();
    }
  };

  const done = () => {
    stage.replaceChildren();
    stage.append(el("div", { class: "pad", style: "text-align:center" },
      el("div", { style: "font-size:34px", text: "✓" }),
      el("div", { text: "Session complete — " + order.length + " notebooks reviewed" }),
      el("div", { class: "dim small", text: "Due dates were pushed forward by knowledge state." }),
    ));
  };

  d.append(el("h3", { text: "Review session" }), counter, stage,
    el("div", { class: "row" }, el("span", { class: "sp" }), btn("Close", () => d.close())));
  document.body.append(d);
  d.showModal();
  d.addEventListener("close", () => d.remove());
  draw();
}
