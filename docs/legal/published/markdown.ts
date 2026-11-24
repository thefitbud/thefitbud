/**
 * A small markdown reader for the published legal documents (Z14-27). It
 * handles only what those documents use: headings, paragraphs, bullet and
 * numbered lists, tables, block quotes, rules, `<a id>` anchors and the inline
 * forms **bold**, *italic*, `code`, ==marked== (a value still "To be
 * confirmed"), [text](url) links, bare web addresses and email addresses.
 * Trainer web and the mobile apps each turn the result into their own views,
 * so the two read the same text the same way.
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "br" }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "mark"; children: Inline[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4; inline: Inline[]; text: string; id?: string }
  | { type: "paragraph"; inline: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] }
  | { type: "quote"; inline: Inline[] }
  | { type: "rule" };

const URL_RE = /^https?:\/\/[^\s)<>]+[^\s)<>.,;:!?]/;
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

function plain(inline: Inline[]): string {
  return inline
    .map((n) => {
      switch (n.type) {
        case "text":
        case "code":
          return n.value;
        case "br":
          return " ";
        default:
          return plain(n.children);
      }
    })
    .join("");
}

export function inlineText(inline: Inline[]): string {
  return plain(inline);
}

/** Parse one line or paragraph of inline markdown. `\n` becomes a line break. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) {
      out.push({ type: "text", value: buf });
      buf = "";
    }
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    const ch = src[i] ?? "";
    if (ch === "\n") {
      flush();
      out.push({ type: "br" });
      i += 1;
      continue;
    }
    if (rest.startsWith("**")) {
      const end = src.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ type: "strong", children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (rest.startsWith("==")) {
      const end = src.indexOf("==", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ type: "mark", children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (ch === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ type: "code", value: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (ch === "*" && !rest.startsWith("**")) {
      const end = src.indexOf("*", i + 1);
      if (end > i + 1 && src[i + 1] !== " ") {
        flush();
        out.push({ type: "em", children: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (ch === "[") {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
      if (m) {
        flush();
        out.push({ type: "link", href: m[2] ?? "", children: parseInline(m[1] ?? "") });
        i += m[0].length;
        continue;
      }
    }
    const prev = i === 0 ? " " : (src[i - 1] ?? " ");
    if (/[\s(*>]/.test(prev) || i === 0) {
      const url = URL_RE.exec(rest);
      if (url) {
        flush();
        const href = url[0];
        out.push({ type: "link", href, children: [{ type: "text", value: href }] });
        i += href.length;
        continue;
      }
      const email = EMAIL_RE.exec(rest);
      if (email) {
        flush();
        const addr = email[0];
        out.push({ type: "link", href: `mailto:${addr}`, children: [{ type: "text", value: addr }] });
        i += addr.length;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

/** Parse the published markdown into blocks. */
export function parseLegalMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let pendingAnchor: string | undefined;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    const anchor = /^<a id="([^"]+)"><\/a>\s*$/.exec(line.trim());
    if (anchor) {
      pendingAnchor = anchor[1];
      i += 1;
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const inline = parseInline((heading[2] ?? "").trim());
      blocks.push({
        type: "heading",
        level: (heading[1]?.length ?? 2) as 1 | 2 | 3 | 4,
        inline,
        text: plain(inline),
        ...(pendingAnchor ? { id: pendingAnchor } : {}),
      });
      pendingAnchor = undefined;
      i += 1;
      continue;
    }
    if (/^---+\s*$/.test(line)) {
      blocks.push({ type: "rule" });
      i += 1;
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith("|")) {
        rows.push(splitRow(lines[i] ?? ""));
        i += 1;
      }
      const [header = [], , ...body] = rows;
      blocks.push({
        type: "table",
        header: header.map(parseInline),
        rows: body.map((r) => r.map(parseInline)),
      });
      continue;
    }
    if (line.startsWith(">")) {
      const parts: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith(">")) {
        parts.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", inline: parseInline(parts.join("\n")) });
      continue;
    }
    const bullet = /^[-*]\s+/.test(line);
    const numbered = /^\d+\.\s+/.test(line);
    if (bullet || numbered) {
      const re = bullet ? /^[-*]\s+/ : /^\d+\.\s+/;
      const items: Inline[][] = [];
      while (i < lines.length && re.test(lines[i] ?? "")) {
        let text = (lines[i] ?? "").replace(re, "");
        i += 1;
        // A wrapped item continues on indented lines.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i] ?? "")) {
          text += ` ${(lines[i] ?? "").trim()}`;
          i += 1;
        }
        items.push(parseInline(text));
      }
      blocks.push({ type: "list", ordered: numbered, items });
      continue;
    }
    const parts: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() !== "" &&
      !/^(#{1,4}\s|---+\s*$|\||>|[-*]\s|\d+\.\s|<a id=)/.test(lines[i] ?? "")
    ) {
      parts.push((lines[i] ?? "").trimEnd());
      i += 1;
    }
    if (parts.length === 0) {
      // A line no rule above understood: keep it as text rather than loop.
      parts.push(line);
      i += 1;
    }
    blocks.push({ type: "paragraph", inline: parseInline(parts.join("\n")) });
  }
  return blocks;
}
