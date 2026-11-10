import React from "react";

/**
 * Descripción enriquecida (RF-CON-06) con un formato simple tipo Markdown, sin HTML:
 *   **negrita**  *cursiva* o _cursiva_  [texto](https://enlace)  enlaces sueltos https://…
 *   - viñetas / * viñetas   1. listas numeradas   ## subtítulos   línea en blanco = párrafo, salto = salto de línea
 * Seguridad: nunca se interpreta HTML. Todo se construye como elementos React (que escapan el texto) y los
 * enlaces solo admiten http(s) y mailto (se descartan javascript:, data:, etc.).
 */

const SAFE_URL = /^(https?:\/\/|mailto:)[^\s<>"']+$/i;
const safeHref = (u: string) => (SAFE_URL.test(u.trim()) ? u.trim() : null);

// token en línea: **negrita** | *cursiva* | _cursiva_ | [texto](url) | url suelta
const INLINE = /(\*\*([^*]+?)\*\*)|(\*([^*\s][^*]*?)\*)|(\b_([^_]+?)_\b)|(\[([^\]]+)\]\(([^)\s]+)\))|(https?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?])/g;

function inline(text: string, key: string, linkClass: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0, i = 0, m: RegExpExecArray | null;
  const re = new RegExp(INLINE.source, "g");
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1]) out.push(<strong key={k}>{inline(m[2], k, linkClass)}</strong>);
    else if (m[3]) out.push(<em key={k}>{inline(m[4], k, linkClass)}</em>);
    else if (m[5]) out.push(<em key={k}>{m[6]}</em>);
    else if (m[7]) {
      const href = safeHref(m[9]);
      out.push(href ? <a key={k} href={href} target="_blank" rel="noopener noreferrer nofollow" className={linkClass}>{m[8]}</a> : m[8]);
    } else if (m[10]) out.push(<a key={k} href={m[10]} target="_blank" rel="noopener noreferrer nofollow" className={linkClass}>{m[10]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function withBreaks(lines: string[], key: string, linkClass: string) {
  return lines.flatMap((l, i) => (i ? [<br key={`${key}-br${i}`} />, ...inline(l, `${key}-${i}`, linkClass)] : inline(l, `${key}-${i}`, linkClass)));
}

type Block = { t: "p" | "ul" | "ol" | "h"; lines: string[] };
function blocks(src: string): Block[] {
  const out: Block[] = [];
  let cur: Block | null = null;
  for (const raw of String(src ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) { cur = null; continue; }
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line), ol = /^\s*\d{1,3}[.)]\s+(.*)$/.exec(line), h = /^\s*#{1,3}\s+(.*)$/.exec(line);
    if (h) { out.push({ t: "h", lines: [h[1]] }); cur = null; continue; }
    const t = ul ? "ul" : ol ? "ol" : "p";
    const text = ul ? ul[1] : ol ? ol[1] : line.trim();
    if (!cur || cur.t !== t) { cur = { t, lines: [] }; out.push(cur); }
    cur.lines.push(text);
  }
  return out;
}

export function RichText({ text, className = "", linkClass = "font-medium text-brand underline underline-offset-2" }: { text?: string | null; className?: string; linkClass?: string }) {
  if (!text?.trim()) return null;
  return (
    <div className={`space-y-3 leading-relaxed ${className}`}>
      {blocks(text).map((b, i) => {
        const k = `b${i}`;
        if (b.t === "h") return <h3 key={k} className="pt-1 text-base font-semibold text-ink">{inline(b.lines[0], k, linkClass)}</h3>;
        if (b.t === "ul") return <ul key={k} className="list-disc space-y-1 pl-5">{b.lines.map((l, j) => <li key={j}>{inline(l, `${k}-${j}`, linkClass)}</li>)}</ul>;
        if (b.t === "ol") return <ol key={k} className="list-decimal space-y-1 pl-5">{b.lines.map((l, j) => <li key={j}>{inline(l, `${k}-${j}`, linkClass)}</li>)}</ol>;
        return <p key={k}>{withBreaks(b.lines, k, linkClass)}</p>;
      })}
    </div>
  );
}

/** Texto plano (sin marcas) para resúmenes, tarjetas y calendario. */
export function plainText(src?: string | null, max = 0): string {
  const s = String(src ?? "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/\b_([^_]+)_\b/g, "$1")
    .replace(/^\s*(#{1,3}|[-*•]|\d{1,3}[.)])\s+/gm, "").replace(/\s+/g, " ").trim();
  return max && s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

export const RICH_HINT = "Formato: **negrita**, *cursiva*, líneas con «- » para viñetas o «1. » numeradas, ## subtítulo, [texto](https://enlace). No se admite HTML.";
