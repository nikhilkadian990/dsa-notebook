// Markdown-ish inline rendering + a compact multi-language syntax highlighter.
// Ported from the original DSANotes.html; blocks render into a <pre> mirror that
// sits under a transparent textarea, so highlighting is live while you type.

const KW = new Set(
  ("abstract and as assert async await auto bool boolean break byte case catch char class const constexpr " +
    "continue def default del delete do double elif else enum except explicit export extends false final " +
    "finally float for from func function global goto if implements import in include instanceof int interface " +
    "is lambda let long namespace new nil none None not null or override package pass private protected public " +
    "raise return short signed sizeof static struct super switch template this throw throws true True False try " +
    "typedef typename union unsigned using var virtual void volatile while with yield").split(" "),
);

const REST =
  /("""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(\b\d[\w.]*)|([A-Za-z_]\w*)(?=\s*\()|([A-Za-z_]\w*)/;
const mkRe = (c) => new RegExp(c + "|" + REST.source, "g");
const RH = mkRe("(#.*|\\/\\*[\\s\\S]*?\\*\\/)"),
  RC = mkRe("(\\/\\/.*|\\/\\*[\\s\\S]*?\\*\\/)");
const HASH = /^(py|python|sh|bash|rb|ruby|yaml|yml|r|toml|ini|cfg)$/i;

const W = (c, s) =>
  String(s)
    .split("\n")
    .map((p) => (c ? `<span class="${c}">${esc(p)}</span>` : esc(p)))
    .join("\n");

export function code(src, lang) {
  const re = HASH.test(lang) ? RH : RC;
  re.lastIndex = 0;
  let o = "", i = 0, m;
  while ((m = re.exec(src))) {
    o += esc(src.slice(i, m.index));
    const c = m[1]
      ? "m"
      : m[2]
        ? "s"
        : m[3]
          ? "n"
          : m[4]
            ? KW.has(m[4]) ? "k" : "f"
            : KW.has(m[5]) ? "k" : /^[A-Z]/.test(m[5]) ? "t" : "";
    o += W(c, m[0]);
    i = re.lastIndex;
  }
  return o + esc(src.slice(i));
}

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escAttr(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const LINK_RE = /\[([^\]]*)\]\((@nb:[\w-]+|@h:\d+|https?:\/\/[^\s)]+)\)/;

/** Scan one already-escaped line for inline markup in a single left-to-right pass:
 *  `code` spans are atomic, so emphasis can never swallow one (pasted markdown
 *  like **Remember: `count == 0`** keeps its code span), and links keep any
 *  styling inside their text correctly nested. */
export function spans(s, nested) {
  let out = "";
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    // inline code: highest priority, never nested inside emphasis
    if (c === "`") {
      const j = s.indexOf("`", i + 1);
      if (j > i) {
        out += `<span class="ic">${s.slice(i + 1, j)}</span>`;
        i = j + 1;
        continue;
      }
    }
    // link: [text](target) — rendered here so styling inside the text stays
    // balanced instead of leaving a stray </span> after the anchor
    if (c === "[") {
      const m = LINK_RE.exec(s.slice(i));
      if (m && m.index === 0) {
        const target = m[2];
        const cls = target.startsWith("@nb:") || target.startsWith("@h:") ? "lk int" : "lk";
        out += `<a class="${cls}" data-href="${escAttr(target)}">${spans(m[1], false)}</a>`;
        i += m[0].length;
        continue;
      }
    }
    if (c === "*") {
      const bold = s[i + 1] === "*";
      if (bold && nested) { out += c; i++; continue; } // no bold inside bold
      const close = bold ? "**" : "*";
      const cls = bold ? "bd" : "it";
      // an emphasis opener must be followed by something other than a space,
      // so bullet lists ("* item") and "5 * 3" stay literal
      if (s[i + close.length] !== " ") {
        let j = i + close.length, found = 0;
        while (j < n) {
          if (s[j] === "`") { const k = s.indexOf("`", j + 1); if (k > j) { j = k + 1; continue; } }
          if (s.startsWith(close, j)) { found = j; break; }
          j++;
        }
        if (found > i + close.length) {
          out += `<span class="${cls}">${spans(s.slice(i + close.length, found), true)}</span>`;
          i = found + close.length;
          continue;
        }
      }
    }
    out += c;
    i++;
  }
  return out;
}

/** Render one line of a text block into highlighted HTML. */
export function md(ln) {
  let s = esc(ln);
  if (/^\s*&gt;/.test(s)) return `<span class="q">${spans(s, false)}</span>`;
  s = spans(s, false);
  return s.replace(/^(\s*)([-*+]|\d+\.)(\s)/, '$1<span class="mk">$2</span>$3');
}

/** Highlight a whole text-block value (markdown + fenced code). Returns HTML for the mirror. */
export function hl(t) {
  const out = [];
  let inC = false, lang = "", buf = [];
  const flush = () => {
    if (buf.length) {
      code(buf.join("\n"), lang)
        .split("\n")
        .forEach((x) => out.push(`<div class="l c">${x || "\u200b"}</div>`));
      buf = [];
    }
  };
  for (const ln of String(t).split("\n")) {
    const m = /^\s*```\s*(\w*)/.exec(ln);
    if (m) {
      if (inC) { flush(); inC = false; } else { inC = true; lang = m[1]; }
      out.push(`<div class="l c fe">${esc(ln) || "\u200b"}</div>`);
      continue;
    }
    if (inC) { buf.push(ln); continue; }
    out.push(`<div class="l">${md(ln) || "\u200b"}</div>`);
  }
  flush();
  return out.join("");
}

export const FENCE_RE = /^\s*```\s*(\w*)/;
