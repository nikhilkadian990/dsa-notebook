// Settings: AI providers, revision preferences, backup, interface prefs,
// keyboard shortcuts, and the account section that makes an anonymous notebook
// recoverable.
import { $, el, btn, toast } from "./util.js";
import { S } from "./state.js";
import {
  aiConfig, providers, aiEnabled, PRESETS,
  addProvider, updateProvider, removeProvider, moveProvider, testProvider,
} from "./ai.js";
import { exportDialog } from "./io.js";
import { INTERVAL } from "./store.js";
import { auth, linkEmail } from "./fb.js";
import { saveProfile } from "./store.js";

export function renderSettings() {
  const host = $("#view");
  if (!host) return;
  host.replaceChildren();

  host.append(el("h2", { class: "vh", text: "Settings" }));

  /* ---------- account ---------- */
  const u = auth.currentUser;
  const acct = el("div", { class: "dcard" },
    el("div", { class: "dcard-t", text: "Account" }),
    el("p", { class: "dim small", text: "This notebook uses invisible anonymous sign-in, so there is no login wall. Your notes are tied to this browser. Link an email + password to open them on other devices or after clearing browser data." }),
    el("div", { class: "mfld", text: "Your anonymous account id" },
      el("code", { class: "uid", text: u ? u.uid : "—" })),
    el("div", { class: "mrow acts" },
      el("input", { class: "min", id: "lk-email", type: "email", placeholder: "email@example.com" }),
      el("input", { class: "min", id: "lk-pass", type: "password", placeholder: "password (6+ chars)" }),
      btn("Link account", () => doLink(), "b pri"),
    ),
  );
  if (u && !u.isAnonymous)
    acct.replaceChildren(el("div", { class: "dcard-t", text: "Account" }),
      el("p", { class: "dim small", text: "Signed in as " + (u.email || u.uid) + ". Your notebooks follow this account on any device." }));
  host.append(acct);

  async function doLink() {
    const em = $("#lk-email").value.trim(), pw = $("#lk-pass").value;
    if (!em || pw.length < 6) return toast("Enter an email and a password of at least 6 characters.");
    try {
      await linkEmail(em, pw);
      toast("Account linked — you can now sign in on other devices");
      renderSettings();
    } catch (e) {
      toast("Link failed: " + (e.message || e.code), 5000);
    }
  }

  host.append(aiCard());

  /* ---------- revision preferences ---------- */
  const p = S.prefs;
  const dailyGoal = el("input", { class: "min", type: "number", min: "1", max: "50", value: p.dailyGoal || 5, style: "width:70px" });
  const shuffle = el("input", { type: "checkbox", checked: p.shuffle !== false });
  host.append(el("div", { class: "dcard" },
    el("div", { class: "dcard-t", text: "Revision" }),
    el("div", { class: "mgrid" },
      el("label", { class: "mfld" }, el("span", { text: "Reviews per day (goal)" }), dailyGoal),
      el("label", { class: "mfld" }, el("span", { text: "Shuffle mixed sessions" }), shuffle),
    ),
    el("p", { class: "dim small", text: "Intervals by knowledge state: Learning " + INTERVAL.learning + "d · Getting familiar " + INTERVAL.familiar + "d · Strong " + INTERVAL.strong + "d · Mastered " + INTERVAL.mastered + "d." }),
    el("div", { class: "mrow acts" },
      btn("Save preferences", () => {
        S.prefs.dailyGoal = Math.max(1, +dailyGoal.value || 5);
        S.prefs.shuffle = shuffle.checked;
        saveProfile({ prefs: S.prefs });
        toast("Revision preferences saved");
      }, "b pri"),
    ),
  ));

  /* ---------- backup ---------- */
  host.append(el("div", { class: "dcard" },
    el("div", { class: "dcard-t", text: "Backup" }),
    el("p", { class: "dim small", text: "Everything is in Firestore and synced when online. Export keeps a local Markdown copy of every notebook." }),
    el("div", { class: "mrow acts" },
      btn("Export / backup", () => exportDialog(), "b pri"),
      btn("Import notebooks", () => document.getElementById("impf")?.click()),
    ),
  ));

  /* ---------- shortcuts ---------- */
  const rows = [
    ["Ctrl/⌘ + K", "Command palette"],
    ["Ctrl/⌘ + F", "Search all notebooks"],
    ["F3 / Ctrl+G", "Next search result"],
    ["Ctrl/⌘ + S", "Force sync (offline changes flush too)"],
    ["Alt + N", "New notebook"],
    ["Alt + H / C / I / V", "Insert heading / code / image / visual"],
    ["Alt + O / E", "Import / export"],
    ["Alt + 1 / 2 / 3", "Toggle notebooks / outline / both"],
    ["Alt + ↑ / ↓", "Previous / next heading"],
    ["Esc", "Close search, dialogs, palette"],
  ];
  const sc = el("div", { class: "sc-list" });
  for (const [k, d] of rows)
    sc.append(el("div", { class: "sc-i" }, el("kbd", { text: k }), el("span", { class: "sp" }), el("span", { class: "dim small", text: d })));
  host.append(el("div", { class: "dcard" },
    el("div", { class: "dcard-t", text: "Keyboard shortcuts" }), sc));
}

/* ===================== AI providers card =====================
   Providers are an ordered list: the first one that answers wins, the rest are
   fallbacks. Add from the presets (Google AI Studio / Groq / NVIDIA NIM / OpenAI)
   or define a custom OpenAI-compatible endpoint. */

function aiCard() {
  const cfg = aiConfig();
  const list = cfg.providers || [];

  const box = el("div", { class: "prov-list" });
  const draw = () => {
    box.replaceChildren();
    const cur = aiConfig().providers || [];
    if (!cur.length)
      box.append(el("div", { class: "dim small pad", text: "No providers yet. Add Google AI Studio, Groq or NVIDIA NIM below — they are tried in order until one succeeds." }));
    cur.forEach((pv, i) => box.append(providerRow(pv, i, cur.length, draw)));
  };
  draw();

  const addSel = el("select", { class: "msel" });
  for (const key of Object.keys(PRESETS))
    addSel.append(el("option", { value: key, text: "+ " + PRESETS[key].label }));

  const card = el("div", { class: "dcard" },
    el("div", { class: "dcard-t", text: "AI providers (optional)" }),
    el("p", { class: "dim small", text: "The notebook works without AI. With at least one key, Recall Mode gets generated questions and answer checking, and Revision gets AI-built sessions. Keys are stored only in this browser and sent only to the endpoints you configure." }),
    el("div", { class: "prov-order dim small", text: "Order = fallback order — providers are tried top to bottom until one succeeds. If all fail, you get a report of what went wrong on each." }),
    box,
    el("div", { class: "mrow acts" },
      addSel,
      btn("Add", () => { addProvider(addSel.value); draw(); toast("Provider added — fill in its API key"); }),
      el("span", { class: "sp" }),
      el("span", { class: "pill " + (aiEnabled() ? "ok" : "warn"), text: aiEnabled() ? providers().length + " ready" : "AI off" }),
    ),
  );
  return card;
}

function providerRow(pv, i, total, redraw) {
  const preset = PRESETS[pv.type] || PRESETS.custom;
  const models = preset.models || [];

  const keyIn = el("input", {
    class: "min", type: "password", value: pv.key || "", spellcheck: false,
    placeholder: "API key",
    title: preset.keyHint || "API key",
    oninput: (e) => updateProvider(pv.id, { key: e.target.value.trim() }),
  });
  const baseIn = el("input", {
    class: "min", value: pv.base || "", spellcheck: false,
    placeholder: "https://… (base URL)",
    title: "Base URL of the API",
    oninput: (e) => updateProvider(pv.id, { base: e.target.value.trim() }),
  });
  const modelIn = el("input", {
    class: "min", value: pv.model || "", spellcheck: false,
    placeholder: "model id", list: "dl-" + pv.id,
    title: "Model id, e.g. " + (pv.model || preset.model || "llama-3.3-70b-versatile"),
    oninput: (e) => updateProvider(pv.id, { model: e.target.value.trim() }),
  });
  const dl = el("datalist", { id: "dl-" + pv.id });
  for (const m of models) dl.append(el("option", { value: m }));

  const head = el("div", { class: "prov-head" },
    el("span", { class: "prov-idx", text: String(i + 1) }),
    el("span", { class: "prov-nm", text: pv.label || preset.label }),
    el("span", { class: "tag-dot", text: pv.kind === "gemini" ? "Gemini API" : "OpenAI-compatible" }),
    el("span", { class: "sp" }),
    el("button", {
      class: "ib", title: "Move up (tried earlier)", text: "↑",
      onclick: () => { moveProvider(pv.id, "up"); redraw(); },
    }),
    el("button", {
      class: "ib", title: "Move down (tried later)", text: "↓",
      onclick: () => { moveProvider(pv.id, "down"); redraw(); },
    }),
    el("button", {
      class: "ib", title: "Remove provider", text: "✕",
      onclick: () => { removeProvider(pv.id); redraw(); toast("Provider removed"); },
    }),
  );

  const onBox = el("input", {
    type: "checkbox", checked: pv.enabled !== false, title: "Include this provider in the fallback chain",
    onchange: (e) => { updateProvider(pv.id, { enabled: e.target.checked }); redraw(); },
  });

  const testOut = el("span", { class: "dim small prov-test" });
  const row = el("div", { class: "prov" + (pv.enabled === false ? " off" : "") },
    head,
    el("div", { class: "mgrid" },
      el("label", { class: "mfld" }, el("span", { text: "API key" }), keyIn),
      el("label", { class: "mfld" }, el("span", { text: "Base URL" }), baseIn),
      el("label", { class: "mfld" }, el("span", { text: "Model id" }), modelIn, dl),
    ),
    el("div", { class: "mrow acts" },
      el("label", { class: "mfld inline" }, onBox, el("span", { text: "enabled" })),
      btn("Test", async () => {
        if (!pv.key || !pv.base || !pv.model) { testOut.textContent = "fill in key, base URL and model first"; return; }
        testOut.textContent = "testing…";
        const r = await testProvider(pv);
        testOut.textContent = r.ok ? "✓ OK — " + r.message : "✕ " + r.message;
        testOut.className = "small prov-test " + (r.ok ? "ok-t" : "err-t");
      }),
      el("span", { class: "sp" }),
      testOut,
    ),
  );
  return row;
}
