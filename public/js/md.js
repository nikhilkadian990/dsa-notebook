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

/** Internal link syntax: [text](@nb:notebookId) or [text](@h:blockIndex). */
export const LINK_RE = /\[([^\]]*)\]\((@nb:[\w-]+|@h:\d+|https?:\/\/[^\s)]+)\)/g;

function withLinks(s) {
  // runs after inline markdown so link text keeps its styling
  return s.replace(
    /(<span class="(?:ic|bd|it)">)?(\[[^\]]*\]\((?:@nb:[\w-]+|@h:\d+|https?:\/\/[^\s)]+)\))/g,
    (m, span, lnk) => {
      const [, txt, target] = /^\[([^\]]*)\]\((.*)\)$/.exec(lnk);
      const cls = target.startsWith("@nb:") || target.startsWith("@h:") ? "lk int" : "lk";
      return `<a class="${cls}" data-href="${esc(target)}">${span ? span : ""}${esc(txt)}${span ? "</span>" : ""}</a>`;
    },
  );
}

/** Render one line of a text block into highlighted HTML. */
export function md(ln) {
  let s = esc(ln);
  if (/^\s*&gt;/.test(s)) return `<span class="q">${withLinks(s)}</span>`;
  s = s.replace(/(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)/g, (m, a, b) => {
    const inner = m.slice(a ? 1 : b ? 2 : 1, a ? -1 : b ? -2 : -1);
    const cls = a ? "ic" : b ? "bd" : "it";
    return `<span class="${cls}">${esc(inner)}</span>`;
  });
  s = withLinks(s);
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
