// Small DOM + misc helpers shared by every module.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/** Create an element: el("div", {class:"x", text:"hi", onclick:fn}, child1, child2) */
export function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [a, v] of Object.entries(props)) {
    if (a === "class") e.className = v;
    else if (a === "text") e.textContent = v;
    else if (a === "html") e.innerHTML = v;
    else if (a.startsWith("on")) e.addEventListener(a.slice(2), v);
    else if (v === true) e.setAttribute(a, "");
    else if (v !== false && v != null) e[a] = v;
  }
  e.append(...kids);
  return e;
}

export const btn = (t, f, cls = "b sm") =>
  el("button", { class: cls, text: t, onclick: f });

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10));

export const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export const debounce = (fn, ms) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

let tt = 0;
export function toast(msg, ms = 2600) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.add("hidden"), ms);
}

/** Confirm, but with a typed default so it never throws. */
export const ask = (msg, def = "") => {
  const v = prompt(msg, def);
  return v === null ? null : v;
};

/** Relative-ish date label for dashboards and review history. */
export function when(ts) {
  if (!ts) return "never";
  const d = new Date(ts),
    now = new Date(),
    day = 864e5;
  const dd = Math.floor((+now - +d) / day);
  if (dd <= 0) return "today";
  if (dd === 1) return "yesterday";
  if (dd < 7) return dd + "d ago";
  if (dd < 30) return Math.floor(dd / 7) + "w ago";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export const DAY = 864e5;
export const todayKey = (d = new Date()) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

/** URL-safe slug for a notebook name (used for stable public markdown links). */
export function slug(name) {
  return String(name || "untitled")
    .toLowerCase()
    .replace(/\.(md|txt)$/i, "")
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "note";
}

/** Download a blob as a file. */
export function dl(name, blob) {
  const a = el("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 6000);
}

/** Pluralize helper. */
export const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
