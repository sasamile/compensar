/**
 * Análisis de respuestas abiertas (RF-ANA-03 · FUN-95): agrupa los temas más mencionados por
 * frecuencia de palabras y bigramas, sin tildes, sin palabras vacías en español y con una
 * normalización simple de plurales para que "herramienta" y "herramientas" cuenten como un tema.
 */
export const STOPWORDS = new Set(`a al algo algun alguna algunas alguno algunos ante antes aqui asi aun aunque bajo bien cada casi como con contra cual cuales cuando de del desde donde dos e el ella ellas ello ellos en entre era eran es esa esas ese eso esos esta estaba estaban estamos estan estar este esto estos fue fueron fui ha habia han hasta hay he la las le les lo los mas me mi mis mucha muchas mucho muchos muy nada ni no nos nosotros o os otra otras otro otros para pero poco por porque que quien se sea segun ser si sido siempre sin sobre solo son su sus tal tambien tan tanto te tener tiene tienen todo todos tu tus un una uno unos usted ustedes y ya yo me nos les fue ser son sera seria hace hacer hizo puede pueden debe deben gracias cosa cosas vez veces asi tipo the and of to en el muy mas menos mejor bueno buena buenos buenas excelente gusto gustaria seria estuvo estuvieron fueron tuvimos tuve hubo creo parece ahora luego despues entonces porque cual cuales donde quiero queremos podria podrian sesion sesiones`.split(/\s+/).filter(Boolean));

/** Palabras que no son temas por sí solas pero sí dentro de un bigrama (p. ej., "más sesiones"). */
const WEAK = new Set(["mejor", "bueno", "buena", "excelente", "sesion", "sesiones", "mas", "menos", "gustaria"]);

export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ñ/g, "n");

/** Normalización de plural muy simple (español). */
function stem(w: string) {
  let s = w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w; // clientes → cliente, mentores → mentore
  if (s.length > 5 && /[bcdfgjklmnprtvz]e$/.test(s)) s = s.slice(0, -1); // cliente/client, mentore/mentor
  return s;
}

export type Theme = { term: string; count: number; docs: number[]; kind: "palabra" | "bigrama" };

/**
 * Devuelve los temas más mencionados (palabras y bigramas) con el número de comentarios que
 * los mencionan y los índices de esos comentarios (para mostrar ejemplos y cruzar con el NPS).
 */
export function themes(comments: string[], top = 12): { words: Theme[]; bigrams: Theme[] } {
  const display = new Map<string, Map<string, number>>(); // clave -> forma original (con tildes) -> veces
  const w = new Map<string, Set<number>>();
  const b = new Map<string, Set<number>>();
  const see = (k: string, orig: string) => { const d = display.get(k) ?? new Map(); d.set(orig, (d.get(orig) ?? 0) + 1); display.set(k, d); };
  comments.forEach((c, idx) => {
    if (!c) return;
    for (const sentence of c.toLowerCase().split(/[.;:!?\n()]+/)) {
      // palabras con su posición; las de menos de 3 letras («de», «y») no cortan la frase: «flujo de caja»
      const content: ({ s: string; a: number; z: number } | null)[] = [];
      for (const m of sentence.matchAll(/[\p{L}\p{N}]+/gu)) {
        const orig = m[0], t = norm(orig);
        if (t.length < 3 || /^\d+$/.test(t)) continue;
        const s = stem(t);
        if (STOPWORDS.has(t) && !WEAK.has(t)) { content.push(null); continue; }
        content.push({ s, a: m.index!, z: m.index! + orig.length });
        if (!WEAK.has(t)) { see(s, orig); const set = w.get(s) ?? new Set(); set.add(idx); w.set(s, set); }
      }
      for (let i = 0; i < content.length - 1; i++) {
        const x = content[i], y = content[i + 1];
        if (!x || !y || x.s === y.s) continue;
        if (WEAK.has(x.s) && WEAK.has(y.s)) continue;
        const k = x.s + " " + y.s;
        see(k, sentence.slice(x.a, y.z).replace(/\s+/g, " "));
        const set = b.get(k) ?? new Set(); set.add(idx); b.set(k, set);
      }
    }
  });
  const show = (k: string) => {
    const d = display.get(k);
    return d ? Array.from(d.entries()).sort((x, y) => y[1] - x[1])[0][0] : k;
  };
  const rank = (m: Map<string, Set<number>>, kind: Theme["kind"], min: number) =>
    Array.from(m.entries()).filter(([, v]) => v.size >= min)
      .map(([k, v]) => ({ term: show(k), count: v.size, docs: Array.from(v), kind }))
      .sort((x, y) => y.count - x.count || x.term.localeCompare(y.term)).slice(0, top);
  return { words: rank(w, "palabra", 1), bigrams: rank(b, "bigrama", 2) };
}
