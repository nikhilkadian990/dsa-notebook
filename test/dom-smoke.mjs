// Boots the real app under jsdom (with fb.js stubbed) and exercises the paths
// reported broken: sidebar listing, editor rendering, settings, find, dashboard,
// revision. Prints a per-check report and exits non-zero on any failure.

import fs from "node:fs";
import { JSDOM } from "jsdom";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const dom = new JSDOM(html, { url: "https://dsa-notebook.test/", runScripts: "outside-only" });

// globals the app expects
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.history = dom.window.history;
globalThis.localStorage = dom.window.localStorage;
globalThis.innerWidth = 1400;
globalThis.innerHeight = 900;
globalThis.alert = () => {};
globalThis.prompt = () => {};
globalThis.addEventListener = (...a) => dom.window.addEventListener(...a);
globalThis.removeEventListener = (...a) => dom.window.removeEventListener(...a);
dom.window.HTMLCanvasElement.prototype.getContext = () => null;
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };

register(pathToFileURL("./test/dom-loader.mjs").href);

const results = [];
const check = (label, ok, extra) => {
  results.push((ok ? "PASS  " : "FAIL  ") + label + (extra ? "  — " + extra : ""));
};

// capture console errors from the app
const errors = [];
dom.window.addEventListener("error", (e) => errors.push(e.error?.message || e.message));

const flush = () => new Promise((r) => setTimeout(r, 60));

// import the app entrypoint; app.js auto-boots on authReady
await import("../public/js/app.js");
await flush();

const $ = (s) => dom.window.document.querySelector(s);
const $$ = (s) => [...dom.window.document.querySelectorAll(s)];

/* ---------- boot ---------- */
check("app booted without fatal errors", errors.length === 0, errors.join(" | "));

/* ---------- sidebar ---------- */
const flist = $("#flist");
check("sidebar list container exists", !!flist);
check("sidebar renders an empty-state hint", !!flist && flist.textContent.length > 0);

/* ---------- create a notebook via the store path ---------- */
const { S } = await import("../public/js/state.js");
const { freshNotebook, save } = await import("../public/js/store.js");
const nb = freshNotebook("DSA/Arrays.md", "DSA");
nb.blocks = [
  { t: "h", v: "Two Sum", l: 2 },
  { t: "text", v: "Use a **hash map**. `O(n)` time." },
];
S.notebooks.push(nb);
S.cur = nb.id;
save(nb);
const { renderFiles } = await import("../public/js/sidebar.js");
renderFiles();
await flush();

check("sidebar lists the created notebook", $$("#flist .fi").length >= 1, $$("#flist .fi").length + " rows");
check("sidebar shows the folder DSA", $$("#flist .gh").some((g) => g.textContent.includes("DSA")));

/* ---------- editor ---------- */
const ed = await import("../public/js/editor.js");
ed.render();
await flush();
const page = $("#page");
check("editor renders the page container", !!page);
check("editor renders the heading block", !!page && !!page.querySelector("input.hd"));
check("editor renders the text block", !!page && !!page.querySelector(".tb textarea"));
check("heading input carries the title", page?.querySelector("input.hd")?.value === "Two Sum");

/* ---------- metadata strip is gone; notes carry their own toolbar ---------- */
const meta = await import("../public/js/meta.js");
const heads = $$("#page .nh");
check("heading renders as a note with a toggle button", heads.length >= 1 && !!heads[0].querySelector(".nh-btn"));
check("note toolbar starts closed", heads.length >= 1 && !!heads[0].querySelector(".nh-body.hidden"));
heads[0].querySelector(".nh-btn").click();
await flush();
{
  const body = heads[0].querySelector(".nh-body");
  check("opening the toggle reveals the inline toolbar", !body.classList.contains("hidden"));
  check("toolbar has the problem-link field", !!body.querySelector("input.min"));
  check("toolbar offers per-note recall", [...body.querySelectorAll("button")].some((b) => b.textContent.includes("Recall")));
}
// toggling closed again must actually close it
heads[0].querySelector(".nh-btn").click();
await flush();
check("clicking the toggle again closes the toolbar", heads[0].querySelector(".nh-body").classList.contains("hidden"));

/* ---------- link blocks: slim, own line, opens in a new tab ---------- */
{
  const before = $$("#page .lblk").length;
  ed.insertBlock({ t: "link", v: "https://leetcode.com/problems/two-sum/", label: "Two Sum" });
  await flush();
  const lblk = $$("#page .lblk").pop();
  check("inserting a link renders a slim one-line box", !!lblk && $$("#page .lblk").length === before + 1);
  check("link box shows the label", lblk?.textContent.includes("Two Sum"));
  check("link box shows the url", lblk?.textContent.includes("leetcode.com/problems/two-sum"));
  let opened = null;
  const win = dom.window.open;
  dom.window.open = (u) => { opened = u; };
  lblk.click();
  dom.window.open = win;
  check("clicking the link opens the url in a new tab", opened === "https://leetcode.com/problems/two-sum/", String(opened));
  ed.rm($$("#page").length ? ed.pageEl().children.length - 1 : 0);
}

/* ---------- search ---------- */
const search = await import("../public/js/search.js");
search.openSearch();
$("#sq").value = "hash map";
search.runSearch();
await flush();
const sres = $("#sresults");
check("search opens the results panel", !sres.classList.contains("hidden"));
check("search finds a match", sres.querySelectorAll(".sr").length >= 1, sres.querySelectorAll(".sr").length + " hits");
check("search reports the count", /1\/1|1/.test($("#scount")?.textContent || ""), $("#scount")?.textContent);
search.closeSearch();

/* ---------- dashboard ---------- */
const app = await import("../public/js/app.js");
app.showView("dashboard");
await flush();
const view = $("#view");
check("dashboard renders into #view", !view.classList.contains("hidden"));
check("dashboard shows quick actions", $$("#view .qb").length >= 4, $$("#view .qb").length + " buttons");
check("dashboard offers export", $$("#view .qb").some((b) => b.textContent.includes("Export")));
check("dashboard offers settings", $$("#view .qb").some((b) => b.textContent.includes("Settings")));
check("dashboard shows cards", $$("#view .dcard").length >= 1, $$("#view .dcard").length + " cards");
check("dashboard names the current notebook", view.textContent.includes("Two Sum") || view.textContent.includes("Arrays.md"));

/* ---------- tags view ---------- */
app.showView("tags");
await flush();
check("tags view renders", !$("#view").classList.contains("hidden"));

/* ---------- settings ---------- */
const settings = await import("../public/js/settings.js");
app.showView("settings");
await flush();
check("settings view renders", !$("#view").classList.contains("hidden"));
check("settings shows the AI providers card", $("#view").textContent.includes("AI providers"));
check("settings shows the account card", $("#view").textContent.includes("Account"));

/* ---------- insert bar (contextual, only with an open notebook) ---------- */
check("insert bar is hidden on the dashboard", $("#insertbar").classList.contains("hidden"));
app.showView("editor");
await flush();
check("insert bar appears in the editor with a notebook open", !$("#insertbar").classList.contains("hidden"));
check("insert bar has the insert actions", $$("#insertbar .b").length >= 5, $$("#insertbar .b").length + " buttons");
check("sidebar no longer shows the shortcuts hint", !$("#files .hint"));

/* ---------- revision excludes empty notebooks ---------- */
const empty = freshNotebook("Empty.md", null);
S.notebooks.push(empty);
const revise = await import("../public/js/revise.js");
const due = revise.dueNotes();
check("revision queue excludes empty notebooks", !due.some((x) => x.nb.id === empty.id),
  "due list: " + due.map((d) => d.b.v || d.nb.name).join(","));

/* ---------- note-level scheduling: a reviewed note becomes due ---------- */
{
  const nb = S.notebooks.find((x) => x.name === "DSA/Arrays.md");
  const h = nb.blocks.find((b) => b.t === "h");
  const { recordNoteReview, noteDue } = await import("../public/js/store.js");
  recordNoteReview(nb, h, "good");
  check("reviewing a note schedules its own due date", !!h.meta.dueAt && h.meta.dueAt > Date.now());
  check("reviewed note is not due yet", !noteDue(nb, h));
  h.meta.dueAt = Date.now() - 1000;
  check("a lapsed note becomes due", noteDue(nb, h));
}

/* ---------- recall: whole-file picker and single-note ---------- */
{
  const nb = S.notebooks.find((x) => x.name === "DSA/Arrays.md");
  const recall = await import("../public/js/recall.js");
  recall.start(nb);
  await flush();
  const dialog = $$(".rd").pop();
  check("multi-note recall opens a file picker", !!dialog && dialog.textContent.includes("Recall —"));
  dialog?.close();
  recall.startNote(nb, nb.blocks.find((b) => b.t === "h"));
  await flush();
  const single = $$(".rd").pop();
  check("single-note recall opens directly", !!single && single.textContent.includes("Recall — Two Sum"));
  single?.close();
}

/* ---------- search groups by notebook, highlights, and lands on the hit ---------- */
{
  const search = await import("../public/js/search.js");
  search.openSearch();
  $("#sq").value = "hash map";
  search.runSearch();
  await flush();
  const sres = $("#sresults");
  check("search groups results by notebook", !!sres.querySelector(".sr-grp"));
  check("search highlights the matched term", !!sres.querySelector("mark"));
  // clicking a result must focus the block that contains the match
  sres.querySelector(".sr").click();
  await flush();
  const focused = dom.window.document.activeElement;
  const focusedText = focused?.value || "";
  check("clicking a result focuses the matched block", focused?.tagName === "TEXTAREA" && focusedText.toLowerCase().includes("hash map"),
    focused ? focused.tagName + ": " + focusedText.slice(0, 30) : "nothing focused");
  search.closeSearch();
}

/* ---------- AI provider chain: add, reorder, remove ---------- */
const ai = await import("../public/js/ai.js");
localStorage.clear();
check("AI is off with no providers", !ai.aiEnabled());
ai.addProvider("groq");
ai.addProvider("gemini");
// providers() only lists fully-configured ones; the raw chain is aiConfig()
let chain = ai.aiConfig().providers;
check("adding two providers yields a 2-step chain", chain.length === 2, chain.length + " providers");
check("first added is tried first", chain[0].type === "groq", chain.map((p) => p.type).join(","));
check("unconfigured providers are excluded from the active chain", ai.providers().length === 0 && !ai.aiEnabled());
// fill the second one in: it becomes usable and the fallback chain is live
ai.updateProvider(chain[1].id, { key: "k1", base: "https://a.test/v1", model: "m1" });
check("a configured provider enters the active chain", ai.providers().length === 1 && ai.aiEnabled());
ai.moveProvider(chain[1].id, "up");
chain = ai.aiConfig().providers;
check("move-up reorders the fallback chain", chain[0].type === "gemini", chain.map((p) => p.type).join(","));
check("provider survives a config update", (() => {
  ai.updateProvider(chain[0].id, { key: "test-key" });
  return ai.aiConfig().providers.find((p) => p.id === chain[0].id)?.key === "test-key";
})());
check("disabling a provider drops it from the active chain", (() => {
  ai.updateProvider(chain[0].id, { enabled: false });
  const ok = ai.providers().length === 0;
  ai.updateProvider(chain[0].id, { enabled: true });
  return ok;
})());
ai.removeProvider(chain[0].id);
check("remove shrinks the chain", ai.aiConfig().providers.length === 1, ai.aiConfig().providers.length + " providers");
check("keys persist in localStorage", (() => {
  const cfg = JSON.parse(localStorage.getItem("dsa-nb-ai") || "{}");
  return Array.isArray(cfg.providers) && cfg.providers.length === 1;
})());
localStorage.clear();

/* ---------- AI failure reporting: per-provider list in a dialog ---------- */
{
  // two configured providers that both fail -> dialog lists each one
  ai.addProvider("groq");
  ai.addProvider("gemini");
  const raw = ai.aiConfig().providers;
  ai.updateProvider(raw[0].id, { key: "bad", base: "https://groq.fail/v1", model: "m" });
  ai.updateProvider(raw[1].id, { key: "bad", base: "https://gemini.fail/v1", model: "m" });
  const errs = new ai.AIError("Every AI provider failed — nothing was generated.", {
    failures: [
      { provider: raw[0], error: new Error("401 — the API key looks wrong or is not authorized") },
      { provider: raw[1], error: new Error("404 — wrong base URL or model id for this endpoint") },
    ],
  });
  ai.aiFail(errs);
  await flush();
  const failDlg = $$(".ai-fail").pop();
  check("failure dialog lists each provider that was tried", !!failDlg && failDlg.querySelectorAll(".ai-fail-i").length === 2,
    failDlg ? failDlg.querySelectorAll(".ai-fail-i").length + " rows" : "no dialog");
  check("failure dialog reports the specific errors", !!failDlg && failDlg.textContent.includes("401") && failDlg.textContent.includes("404"));
  check("failure dialog offers a path to settings", !!$$("dialog").find((d) => d.textContent.includes("Open AI settings")));
localStorage.clear();

/* ---------- sidebar drag & drop: move a notebook between folders ---------- */
{
  const { S } = await import("../public/js/state.js");
  const { freshNotebook, save } = await import("../public/js/store.js");
  const mover = freshNotebook("Stacks.md", null);
  S.notebooks.push(mover);
  const { renderFiles } = await import("../public/js/sidebar.js");
  renderFiles();
  await flush();
  check("a root notebook renders in the sidebar", $$("#flist .fi").some((r) => r.textContent.includes("Stacks.md")));
  // jsdom has no DataTransfer; the handlers only touch currentTarget + the
  // module-level drag target set by dragstart, so a plain custom event works
  const fire = (el, type) => {
    const row = $$("#flist .fi").find((r) => r.textContent.includes("Stacks.md"));
    const tgt = type === "drop" ? el : row;
    tgt.dispatchEvent(new dom.window.Event(type, { bubbles: true }));
  };
  const grp = $$("#flist .gh").find((g) => g.textContent.includes("DSA"));
  fire(null, "dragstart");
  fire(grp, "drop");
  await flush();
  const moved = S.notebooks.find((x) => x.id === mover.id);
  check("dropping on a folder moves the notebook into it", moved && moved.group === "DSA", moved ? moved.group : "null");
  renderFiles();
  await flush();
  // and back out to the root via the top-level drop zone
  const root = $("#flist .drop-root");
  fire(null, "dragstart");
  fire(root, "drop");
  await flush();
  const back = S.notebooks.find((x) => x.id === mover.id);
  check("dropping on the root zone moves the notebook out", back && back.group === null, back ? String(back.group) : "null");
}
}

/* ---------- outline ---------- */
const out = $("#olist");
check("outline lists the heading", out && out.textContent.includes("Two Sum"));

/* ---------- palette ---------- */
const pal = await import("../public/js/palette.js");
pal.openPalette("");
await flush();
check("command palette opens", !!dom.window.document.querySelector("dialog.pal"));
check("palette lists commands", $$(".pal-i").length >= 5, $$(".pal-i").length + " commands");

console.log(results.join("\n"));
console.log("\n" + (results.every((r) => r.startsWith("PASS"))
  ? "ALL SMOKE CHECKS PASSED"
  : "SMOKE CHECKS FAILED"));
process.exitCode = results.some((r) => r.startsWith("FAIL")) ? 1 : 0;
process.exit(process.exitCode);
