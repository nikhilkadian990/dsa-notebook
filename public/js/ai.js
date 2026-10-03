// Optional AI assistance. Deliberately modular: the notebook works completely
// without it, and every call degrades to a local, key-free behaviour.
//
// Multi-provider: Google AI Studio (Gemini), Groq, NVIDIA NIM, OpenAI or any
// OpenAI-compatible endpoint. Providers are stored as an ordered list and tried
// in that order — the first one that answers wins. If every provider fails, the
// user gets a clear report of what happened on each one.
//
// API keys are the user's own, kept in localStorage (never bundled in the app).

const LS = "dsa-nb-ai";

import { el, btn, toast } from "./util.js";
import { cur, mark, titleOf } from "./state.js";
import { save, STRENGTH_LABEL, STATUS_LABEL } from "./store.js";

/* ===================== provider presets ===================== */
// `kind` decides the wire format: "gemini" = native generateContent,
// "openai" = /chat/completions (Groq, NIM, OpenAI and anything compatible).
export const PRESETS = {
  gemini: {
    type: "gemini",
    label: "Google AI Studio (Gemini)",
    kind: "gemini",
    base: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"],
    keyHint: "Get a key at aistudio.google.com → API key",
  },
  groq: {
    type: "groq",
    label: "Groq",
    kind: "openai",
    base: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it", "qwen-2.5-32b", "deepseek-r1-distill-llama-70b"],
    keyHint: "Get a key at console.groq.com → API keys",
  },
  nim: {
    type: "nim",
    label: "NVIDIA NIM",
    kind: "openai",
    base: "https://integrate.api.nvidia.com/v1",
    model: "meta/llama-3.3-70b-instruct",
    models: ["meta/llama-3.3-70b-instruct", "meta/llama-4-scout-17b-16e-instruct", "mistralai/mistral-small-24b-instruct", "qwen/qwen2.5-coder-32b-instruct", "deepseek-ai/deepseek-r1"],
    keyHint: "Get a key at build.nvidia.com → API key",
  },
  openai: {
    type: "openai",
    label: "OpenAI",
    kind: "openai",
    base: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
    keyHint: "Get a key at platform.openai.com → API keys",
  },
  custom: {
    type: "custom",
    label: "Custom (OpenAI-compatible)",
    kind: "openai",
    base: "",
    model: "",
    models: [],
    keyHint: "Any endpoint that exposes POST /chat/completions",
  },
};

/* ===================== config ===================== */
function load() {
  let c;
  try { c = JSON.parse(localStorage.getItem(LS) || "{}"); } catch (e) { c = {}; }
  if (Array.isArray(c.providers)) return c;
  // one-time migration of the old single-provider shape
  if (c.key || c.base || c.model) {
    const base = c.base || "https://api.openai.com/v1";
    return {
      providers: [{
        id: "migrated",
        type: "custom",
        label: "Migrated provider",
        kind: /generativelanguage\.googleapis\.com/.test(base) ? "gemini" : "openai",
        base,
        model: c.model || "",
        key: c.key || "",
        enabled: true,
      }],
    };
  }
  return { providers: [] };
}
function persist(c) { localStorage.setItem(LS, JSON.stringify(c)); }

export function aiConfig() { return load(); }

/** Ordered list of providers that are actually usable (enabled + key + endpoint). */
export function providers() {
  return load().providers.filter((p) => p && p.enabled !== false && p.key && p.base && p.model);
}
export const aiEnabled = () => providers().length > 0;

export function setProviders(list) { persist({ providers: list }); }
export function addProvider(type) {
  const p = PRESETS[type] || PRESETS.custom;
  const c = load();
  c.providers.push({ ...p, id: "p" + Math.random().toString(36).slice(2, 9), enabled: true });
  persist(c);
  return c.providers;
}
export function updateProvider(id, patch) {
  const c = load();
  const p = c.providers.find((x) => x.id === id);
  if (p) Object.assign(p, patch);
  persist(c);
}
export function removeProvider(id) {
  const c = load();
  c.providers = c.providers.filter((x) => x.id !== id);
  persist(c);
}
/** Move a provider up (earlier = tried first) or down the fallback order. */
export function moveProvider(id, dir) {
  const c = load();
  const i = c.providers.findIndex((x) => x.id === id);
  const j = i + (dir === "up" ? -1 : 1);
  if (i < 0 || j < 0 || j >= c.providers.length) return;
  [c.providers[i], c.providers[j]] = [c.providers[j], c.providers[i]];
  persist(c);
}

/* ===================== per-feature prompts =====================
   Each feature carries its own system prompt and generation settings, and the
   relevant note/session context is attached automatically. */

export const STRUCTURE = [
  "Problem / Question", "Pattern / Trigger", "Key Observation", "Invariant / Why it works",
  "Approach", "Example / Dry Run", "Code", "Complexity", "Edge Cases",
  "Mistake / Pitfall", "Remember / Main takeaway", "Related Problems / Patterns",
];

const FEATURES = {
  note: {
    temperature: 0.35,
    maxTokens: 1800,
    system:
      "You write concise, revision-first DSA notes for a personal notebook. " +
      "Output markdown only — no preamble, no 'Sure!', no commentary. " +
      "Bullet points over prose. Terse and retrievable, never a tutorial.",
  },
  recall: {
    temperature: 0.5,
    maxTokens: 1000,
    system:
      "You build sharp active-recall questions for a DSA note. Prefer 'why', " +
      "'what would break if' and 'what signals this pattern' questions over " +
      "restating the problem. Exactly 5-7 pairs. " +
      "Output ONLY plain text in this exact format, nothing else:\n\n" +
      "Q: <one-line question>\nA: <2-3 line model answer>\n\n" +
      "Repeat that Q:/A: block for every question. No numbering, no markdown headings.",
  },
  check: {
    temperature: 0.3,
    maxTokens: 700,
    system:
      "You are a brief, kind Socratic DSA tutor judging a learner's answer against " +
      "a reference note. Reply in at most 4 short lines: whether the answer is " +
      "essentially right, what is missing or wrong, and one hint that points the " +
      "way without handing over the full solution unless the answer is already correct.",
  },
  sheet: {
    temperature: 0.4,
    maxTokens: 1500,
    system:
      "You design a focused one-day DSA revision sheet. Optimize for pattern " +
      "recognition and choosing an approach, not reciting memorized solutions. " +
      "Output clean markdown only: a short plan, an interleaved order that mixes " +
      "patterns (never several problems of the same pattern back to back), and for " +
      "each item one focus question to answer from memory. Keep the whole sheet " +
      "short enough to act on today.",
  },
  hint: {
    temperature: 0.4,
    maxTokens: 500,
    system:
      "You give a single, short nudge toward understanding why a DSA solution works. " +
      "Never hand over a full solution. At most 3 lines, ending with a question " +
      "the learner can answer themselves.",
  },
};

/** Compact, complete markdown of a notebook — the automatic context for AI calls. */
export function noteContext(nb, limit = 7000) {
  const body = (nb.blocks || [])
    .map((b) => {
      if (b.t === "text") return b.v;
      if (b.t === "h") return "#".repeat(Math.min(6, b.l || 2)) + " " + b.v;
      if (b.t === "code") return "```" + (b.lang || "") + "\n" + b.v + "\n```";
      if (b.t === "img") return "_(image: " + (b.name || "image") + ")_";
      if (b.t === "vis") return "_(visual block: " + (b.name || "visual") + ")_";
      return "";
    })
    .join("\n\n")
    .trim();
  const head = [
    "# " + titleOf(nb),
    "file: " + (nb.group ? nb.group + "/" : "") + nb.name,
    (nb.tags || []).length ? "tags: " + nb.tags.map((t) => "#" + t).join(" ") : null,
    nb.meta?.difficulty ? "difficulty: " + nb.meta.difficulty : null,
    nb.meta?.source ? "source: " + nb.meta.source : null,
    nb.meta?.url ? "problem: " + nb.meta.url : null,
    "knowledge: " + (STRENGTH_LABEL[nb.meta?.strength] || "Learning"),
  ].filter(Boolean).join("\n");
  return (head + "\n\n" + body).slice(0, limit);
}

/** Compact context for a whole review session (used by the revision-sheet feature).
 *  Items may be notebooks (legacy) or { nb, b } note items. */
export function sessionContext(list, limit = 6000) {
  const lines = list.map((item, i) => {
    const isNote = !!item?.b;
    const nb = isNote ? item.nb : item;
    const b = isNote ? item.b : null;
    const m = b ? b.meta : nb.meta;
    const last = m?.reviews?.length ? m.reviews[m.reviews.length - 1].at : (nb.reviews?.length ? nb.reviews[nb.reviews.length - 1].at : 0);
    const tags = m?.tags?.length ? m.tags : nb.tags;
    const title = b ? (b.v || "(untitled)") : titleOf(nb);
    return [
      i + 1 + ". " + title + (isNote ? "  (" + nb.name + ")" : ""),
      "   tags: " + ((tags || []).length ? tags.map((t) => "#" + t).join(" ") : "—"),
      "   knowledge: " + (STRENGTH_LABEL[m?.strength] || "Learning") +
      " · status: " + (STATUS_LABEL[m?.status] || "Unsolved") +
      (nb.group ? " · folder: " + nb.group : ""),
      last ? "   last reviewed: " + new Date(last).toISOString().slice(0, 10) : "   never reviewed",
      m?.mistakes?.length ? "   mistakes logged: " + m.mistakes.length : (nb.mistakes?.length ? "   mistakes logged: " + nb.mistakes.length : null),
    ].filter(Boolean).join("\n");
  });
  return lines.join("\n\n").slice(0, limit);
}

/* ===================== the ordered-fallback chat call ===================== */

export class AIError extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.name = "AIError";
    Object.assign(this, extra);
  }
}

/** Try every usable provider in order. Resolves to { text, provider }, or throws
 *  an AIError carrying the per-provider failure list. */
export async function chat(messages, opts = {}) {
  const list = providers();
  if (!list.length) {
    throw new AIError(
      "No AI provider is set up. Add an API key in Settings → AI (Google AI Studio, Groq or NVIDIA NIM).",
      { configMissing: true },
    );
  }
  const failures = [];
  for (const p of list) {
    try {
      const text = await callProvider(p, messages, opts);
      return { text, provider: p };
    } catch (e) {
      failures.push({ provider: p, error: e });
    }
  }
  throw new AIError("Every AI provider failed — nothing was generated.", { failures });
}

async function callProvider(p, messages, opts = {}) {
  const feat = FEATURES[opts.feature] || {};
  const temperature = opts.temperature ?? feat.temperature ?? 0.4;
  const maxTokens = opts.maxTokens || feat.maxTokens || 1200;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    if (p.kind === "gemini") return await gemini(p, messages, { temperature, maxTokens }, ctrl.signal);
    return await openaiStyle(p, messages, { temperature, maxTokens }, ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** Native Gemini generateContent (Google AI Studio). */
async function gemini(p, messages, gen, signal) {
  const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const url = p.base.replace(/\/$/, "") + "/models/" + encodeURIComponent(p.model) + ":generateContent?key=" + encodeURIComponent(p.key);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: { temperature: gen.temperature, maxOutputTokens: gen.maxTokens },
      ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}),
    }),
    signal,
  });
  if (!res.ok) throw new Error(httpMsg(p, res, await res.text().catch(() => "")));
  const j = await res.json();
  const blocked = j.promptFeedback?.blockReason;
  const txt = j.candidates?.[0]?.content?.parts?.map((x) => x.text || "").join("") || "";
  if (!txt.trim()) throw new Error(blocked ? "blocked (" + blocked + ")" : "empty response");
  return txt.trim();
}

/** OpenAI-compatible /chat/completions (Groq, NVIDIA NIM, OpenAI, custom). */
async function openaiStyle(p, messages, gen, signal) {
  const res = await fetch(p.base.replace(/\/$/, "") + "/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + p.key },
    body: JSON.stringify({
      model: p.model,
      messages,
      temperature: gen.temperature,
      max_tokens: gen.maxTokens,
      stream: false,
    }),
    signal,
  });
  if (!res.ok) throw new Error(httpMsg(p, res, await res.text().catch(() => "")));
  const j = await res.json();
  const txt = j.choices?.[0]?.message?.content || j.choices?.[0]?.text || "";
  if (!txt.trim()) throw new Error("empty response");
  return txt.trim();
}

function httpMsg(p, res, body) {
  let detail = "";
  try {
    const j = JSON.parse(body);
    detail = j?.error?.message || j?.message || j?.error?.code || "";
  } catch (e) { detail = String(body || "").slice(0, 180); }
  const status = res.status + " " + res.statusText;
  if (res.status === 401 || res.status === 403) return status + " — the API key looks wrong or is not authorized";
  if (res.status === 404) return status + " — wrong base URL or model id for this endpoint";
  if (res.status === 429) return status + " — rate limited, try again later or a slower model";
  return status + (detail ? " — " + detail : "");
}

/* ===================== feature calls (context + system prompt attached) ===================== */

/** Ask the AI to turn this note into a tight revision note. */
export async function aiNote(nb, extra = "") {
  return chat(
    [
      { role: "system", content: FEATURES.note.system },
      {
        role: "user",
        content:
          "Turn this notebook into a CONCISE revision note using exactly these sections, " +
          "in order, as markdown ### headings (skip a section only if there is genuinely " +
          "nothing to say):\n" +
          STRUCTURE.map((s) => "- " + s).join("\n") +
          "\n\nRules:\n- Code in a fenced block with the language tag, ≤ 25 lines, core idea only.\n" +
          "- Complexity as one line: `Time: O(...) | Space: O(...)` plus a 1-clause why.\n" +
          "- 'Remember' must be the single most forgettable insight.\n" +
          "- 'Mistake / Pitfall' must be the actual trap, not a generic warning." +
          (extra ? "\n- " + extra : "") +
          "\n\nReply with only the revision note in markdown.\n\n=== NOTEBOOK ===\n" +
          noteContext(nb) + "\n=== END ===",
      },
    ],
    { feature: "note" },
  );
}

/** Ask the AI to write recall questions for a note. Accepts either a notebook
 *  (legacy) or raw note text plus its notebook/heading (per-note scope). */
export async function aiRecallQuestions(nbOrText, nb, b) {
  const ctx = typeof nbOrText === "string"
    ? "Note: " + (b ? (b.v || "(untitled)") + "\nNotebook: " + nb.name + "\n\n" : "") + nbOrText
    : noteContext(nbOrText, 5000);
  const { text } = await chat(
    [
      { role: "system", content: FEATURES.recall.system },
      {
        role: "user",
        content: "Write active-recall questions for this note.\n\n=== NOTE ===\n" +
          ctx + "\n=== END ===",
      },
    ],
    { feature: "recall" },
  );
  return parseQA(text);
}

/** Parse the strict Q:/A: format the recall prompt asks for. */
export function parseQA(text) {
  const out = [];
  const re = /^[:*]?\s*(?:\*\*)?(?:Q|Question)[:：]?\s*\**\s*(.+?)\s*\n+[:*]?\s*(?:\*\*)?(?:A|Answer)[:：]?\s*\**\s*([\s\S]*?)(?=\n[:*]?\s*(?:\*\*)?(?:Q|Question)\b|$)/gim;
  let m;
  while ((m = re.exec(text))) out.push({ q: m[1].trim(), a: m[2].trim() });
  return out.filter((x) => x.q && x.a);
}

/** Judge a learner's answer against the note. Accepts a notebook or raw text. */
export async function aiCheck(nbOrText, question, answer) {
  const ctx = typeof nbOrText === "string" ? nbOrText : noteContext(nbOrText, 4000);
  return chat(
    [
      { role: "system", content: FEATURES.check.system },
      {
        role: "user",
        content:
          "Question the learner is answering:\n" + question +
          "\n\nLearner's answer:\n" + (answer || "(left blank)") +
          "\n\nReference note:\n" + ctx,
      },
    ],
    { feature: "check" },
  );
}

/** Ask the AI to design today's revision sheet for a set of notebooks. */
export async function aiSheet(list, extra = "") {
  return chat(
    [
      { role: "system", content: FEATURES.sheet.system },
      {
        role: "user",
        content:
          "Design today's revision sheet for these notebooks. Interleave patterns so no two " +
          "consecutive problems share a pattern, and give each item one focus question to " +
          "answer from memory.\n\n" +
          (extra ? extra + "\n\n" : "") +
          "=== TODAY'S QUEUE ===\n" + sessionContext(list) + "\n=== END ===",
      },
    ],
    { feature: "sheet" },
  );
}

/** A small nudge toward understanding why a solution works. */
export async function aiHint(nb, question) {
  return chat(
    [
      { role: "system", content: FEATURES.hint.system },
      {
        role: "user",
        content: "Question to reason about:\n" + question + "\n\nNotebook:\n" + noteContext(nb, 4000),
      },
    ],
    { feature: "hint" },
  );
}

/* ===================== key-free prompt generator (the primary AI feature) ===================== */

export function buildPrompt(nb, extra = "") {
  return [
    "You are helping me build a tight, revision-first DSA notebook.",
    "Below is a problem I just solved/understood (or notes about it).",
    "Turn it into a CONCISE revision note — not a tutorial. Optimize for fast retrieval and active recall.",
    "",
    "Use exactly these sections, in order, as markdown ### headings. Skip a section only if there is genuinely nothing to say:",
    STRUCTURE.map((s) => "- " + s).join("\n"),
    "",
    "Rules:",
    "- Be terse. Bullet points over prose. No preamble, no 'Sure!'.",
    "- Code in a fenced block with the language tag, ≤ 25 lines, only the core idea.",
    "- Complexity as one line: `Time: O(...) | Space: O(...)` with a 1-clause why.",
    "- 'Remember' must be the single most forgettable insight.",
    "- 'Mistake / Pitfall' must be the trap, not a generic warning.",
    extra ? "- " + extra : "",
    "=== PROBLEM / MY NOTES ===",
    noteContext(nb, 6000).replace(/^# .*$/m, "").trim() || "(no notes yet — generate a note for this problem from its title: " + (nb.name || "untitled") + ")",
    "=== END ===",
    "",
    "Reply with only the revision note in markdown.",
  ].filter(Boolean).join("\n");
}

export async function promptDialog(nb) {
  const d = el("dialog", { class: "rd" });
  const ta = el("textarea", { class: "ai-prompt", rows: 14, spellcheck: false });
  ta.value = buildPrompt(nb);
  d.append(
    el("h3", { text: "✦ AI note-generation prompt" }),
    el("p", { class: "dim small", text: aiEnabled()
      ? "Copy this into ChatGPT, Claude or Gemini — or let the notebook call your configured AI directly."
      : "Copy this into ChatGPT, Claude, Gemini or any AI, then paste the result straight into the notebook. Configure an API key in Settings to generate in place." }),
    ta,
    el("div", { class: "row" },
      el("span", { class: "sp small dim", text: aiEnabled() ? providers().length + " provider(s) ready" : "No API key — copy/paste mode" }),
      btn("Copy prompt", () => {
        navigator.clipboard?.writeText(ta.value).then(() => toast("Prompt copied"));
      }, "b"),
      aiEnabled()
        ? btn("Generate here", async () => {
            d.close();
            toast("Generating with " + providers()[0].label + "…");
            try {
              const { text } = await aiNote(nb);
              const f = cur();
              if (!f) return;
              f.blocks.push({ t: "text", v: text });
              mark(f); save(f);
              import("./editor.js").then((e) => e.render());
              toast("AI note inserted at the end of the notebook");
            } catch (e) { aiFail(e); }
          }, "b pri")
        : null,
      btn("Close", () => d.close()),
    ),
  );
  document.body.append(d);
  d.showModal();
  d.addEventListener("close", () => d.remove());
}

/* ===================== result / failure UI ===================== */

export function answerDialog(title, text, provider) {
  const d = el("dialog", { class: "rd" });
  d.append(
    el("h3", { text }),
    provider ? el("div", { class: "dim small", style: "margin-top:-6px;margin-bottom:8px", text: "via " + provider.label }) : null,
    el("div", { class: "ai-out", html: mdLite(text) }),
    el("div", { class: "row" }, el("span", { class: "sp" }),
      btn("Copy", () => navigator.clipboard?.writeText(text).then(() => toast("Copied"))),
      btn("Close", () => d.close())),
  );
  document.body.append(d);
  d.showModal();
  d.addEventListener("close", () => d.remove());
}

/** Surface an AI failure properly: a dialog listing what went wrong per provider,
 *  or a short toast when the problem is simple (no config, aborted request). */
export function aiFail(e) {
  if (e?.name === "AbortError") { toast("The AI request timed out — try again"); return; }
  if (e?.configMissing) {
    const d = el("dialog", { class: "rd" });
    d.append(
      el("h3", { text: "AI is not configured" }),
      el("p", { class: "dim small", text: String(e.message) }),
      el("div", { class: "row" }, el("span", { class: "sp" }),
        btn("Close", () => d.close()),
        btn("Open AI settings", () => { d.close(); import("./app.js").then((m) => m.showView("settings")); }, "b pri")),
    );
    document.body.append(d);
    d.showModal();
    d.addEventListener("close", () => d.remove());
    return;
  }
  const fails = e?.failures || [{ provider: null, error: e }];
  const d = el("dialog", { class: "rd" });
  const box = el("div", { class: "ai-fail" });
  for (const f of fails)
    box.append(el("div", { class: "ai-fail-i" },
      el("div", { class: "ai-fail-n", text: f.provider ? f.provider.label + " · " + (f.provider.model || "") : "request" }),
      el("div", { class: "dim small", text: String(f.error?.message || f.error) }),
    ));
  d.append(
    el("h3", { text: "AI request failed" }),
    el("p", { class: "dim small", text: "Every provider was tried in order and none succeeded. Check the keys, base URLs and model ids below." }),
    box,
    el("div", { class: "row" }, el("span", { class: "sp" }),
      btn("Close", () => d.close()),
      btn("Open AI settings", () => { d.close(); import("./app.js").then((m) => m.showView("settings")); }, "b pri")),
  );
  document.body.append(d);
  d.showModal();
  d.addEventListener("close", () => d.remove());
}

/* ===================== provider connectivity test (Settings) ===================== */

export async function testProvider(p) {
  try {
    const { text } = await callProviderDirect(p, [
      { role: "system", content: "Reply with exactly: OK" },
      { role: "user", content: "Reply with exactly: OK" },
    ], { temperature: 0, maxTokens: 10 });
    return { ok: !!text.trim(), message: text.trim().slice(0, 60) };
  } catch (e) {
    return { ok: false, message: String(e.message || e) };
  }
}
async function callProviderDirect(p, messages, gen) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    return p.kind === "gemini"
      ? { text: await gemini(p, messages, gen, ctrl.signal) }
      : { text: await openaiStyle(p, messages, gen, ctrl.signal) };
  } finally { clearTimeout(timer); }
}

/* ===================== tiny markdown renderer for AI output ===================== */

export function mdSheet(t) { return mdLite(t); }

function mdLite(t) {
  return String(t || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, l, c) => `<pre class="ai-code">${esc1(c)}</pre>`)
    .replace(/`([^`]+)`/g, '<span class="ic">`$1`</span>')
    .replace(/\*\*([^*]+)\*\*/g, '<span class="bd">**$1**</span>')
    .replace(/^#{1,4}\s+(.+)$/gm, '<div class="ai-h">$1</div>')
    .replace(/^- (.+)$/gm, '<div class="ai-li">• $1</div>')
    .replace(/\n/g, "<br>");
}
function esc1(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ===================== backwards-compatible helpers ===================== */

/** Legacy callback-style entry point. Prefer chat()/aiNote()/aiCheck()/aiSheet(). */
export function runChat(messages, onDone) {
  chat(messages).then(({ text }) => onDone(text)).catch(aiFail);
}

/** Check a recall answer, used by "Why does this work?" — keeps the old signature. */
export async function checkAnswer(nb, question, answer) {
  if (!aiEnabled()) {
    toast("No AI key configured — reveal the note and compare your answer against it. Add a key in Settings for a real check.");
    return;
  }
  try {
    const { text, provider } = await aiCheck(nb, question, answer);
    answerDialog("Answer check", text, provider);
  } catch (e) { aiFail(e); }
}
