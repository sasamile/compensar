import { Star, Send, MessageSquareQuote, ThumbsUp, FileSpreadsheet, Play } from "lucide-react";
import { all } from "@/lib/db";
import { requirePerm, requireUser } from "@/lib/auth";
import { Badge, EmptyState, Field, Flash, PageHeader, Section, Stat, Table, Tabs, Td } from "@/components/ui";
import { BarChart, Donut, HBarChart } from "@/components/charts";
import { fmtDate, jparse } from "@/lib/util";
import { ASPECTS, avg, canRunSurveyJob, KIND_LABEL, nps, summarize, SURVEY_JOINS, surveyFilter, surveyUrl } from "@/lib/surveys";
import { themes } from "@/lib/text-analysis";
import * as A from "./actions";

const npsTone = (n: number | null) => (n == null ? "slate" : n >= 50 ? "green" : n >= 0 ? "amber" : "red");

export default async function Encuestas({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  requirePerm(u, "surveys.view");
  const sp = await searchParams;
  const tab = ["respuestas", "analisis", "envios"].includes(sp.tab) ? sp.tab : "resultados";
  const f = surveyFilter(u);
  const where = [f.sql];
  const params: any[] = [...f.params];
  if (["servicio", "cierre", "evento"].includes(sp.kind)) { where.push("s.kind=?"); params.push(sp.kind); }
  if (Number(sp.aliado)) { where.push("COALESCE(s.aliado_id, sv.aliado_id)=?"); params.push(Number(sp.aliado)); }
  if (Number(sp.servicio)) { where.push("s.servicio_id=?"); params.push(Number(sp.servicio)); }
  const rows = all<any>(`SELECT s.*, sv.name service, al.name aliado, ev.title event, c.razon_social FROM surveys s ${SURVEY_JOINS}
    WHERE ${where.join(" AND ")} ORDER BY COALESCE(s.answered_at, s.sent_at) DESC`, ...params);
  const ans = rows.filter((r) => r.status === "respondida");
  const aliados = all<any>("SELECT id, name FROM aliados ORDER BY name");
  const servicios = all<any>("SELECT id, name FROM servicios ORDER BY name");
  const qs = new URLSearchParams(Object.entries({ kind: sp.kind, aliado: sp.aliado, servicio: sp.servicio }).filter(([, v]) => v) as any).toString();
  return (
    <>
      <PageHeader eyebrow="Experiencia del empresario" title="Encuestas de satisfacción"
        subtitle="Se envían automáticamente al aprobar el cierre de un servicio, al cerrar una remisión y a los asistentes de cada evento. Resultados por aliado y por servicio."
        actions={<>
          <a className="btn-ghost btn-sm" href={`/api/operacion/encuestas${qs ? `?${qs}` : ""}`}><FileSpreadsheet className="h-4 w-4" />Exportar Excel</a>
          {canRunSurveyJob(u) && <form action={A.runSurveysNow}><button className="btn btn-sm"><Play className="h-4 w-4" />Enviar pendientes ahora</button></form>}
        </>} />
      <Flash sp={sp} />
      <form method="get" className="card mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input type="hidden" name="tab" value={tab} />
        <Field label="Tipo"><select name="kind" defaultValue={sp.kind ?? ""} className="input"><option value="">Todos</option>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        {!u.aliado_id && <Field label="Aliado"><select name="aliado" defaultValue={sp.aliado ?? ""} className="input"><option value="">Todos</option>{aliados.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
        <Field label="Servicio"><select name="servicio" defaultValue={sp.servicio ?? ""} className="input"><option value="">Todos</option>{servicios.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <div className="flex items-end gap-2"><button className="btn">Filtrar</button><a className="btn-ghost" href={`/encuestas?tab=${tab}`}>Limpiar</a></div>
      </form>
      <Tabs tabs={[["resultados", "Resultados"], ["analisis", "Análisis de comentarios"], ["respuestas", `Respuestas (${ans.length})`], ["envios", `Envíos (${rows.length})`]]} active={tab} base={`/encuestas${qs ? `?${qs}` : ""}`} />
      {tab === "resultados" && <Resultados rows={rows} ans={ans} />}
      {tab === "analisis" && <Analisis ans={ans} />}
      {tab === "respuestas" && <Respuestas ans={ans} />}
      {tab === "envios" && <Envios rows={rows} />}
    </>
  );
}

function Resultados({ rows, ans }: { rows: any[]; ans: any[] }) {
  if (!rows.length) return <EmptyState title="Aún no hay encuestas">Se crean solas al aprobar cierres, cerrar remisiones y terminar eventos con asistentes.</EmptyState>;
  const n = nps(ans.map((r) => r.nps));
  const pro = ans.filter((r) => r.nps >= 9).length, pas = ans.filter((r) => r.nps >= 7 && r.nps <= 8).length, det = ans.filter((r) => r.nps <= 6).length;
  const aspects = ASPECTS.map(([k, l]) => ({ label: l, value: avg(ans.map((r) => jparse<any>(r.answers, {})[k]).filter((x) => x != null)) ?? 0 }));
  const byAliado = summarize(rows.filter((r) => r.aliado), (r) => r.aliado);
  const byServicio = summarize(rows.filter((r) => r.service), (r) => r.service);
  const byEvento = summarize(rows.filter((r) => r.event), (r) => r.event);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="NPS" value={n == null ? "—" : n} hint="% promotores − % detractores" icon={ThumbsUp} tone={npsTone(n) as any} />
        <Stat label="Satisfacción promedio" value={avg(ans.map((r) => r.satisfaction)) ?? "—"} hint="escala 1 a 5" icon={Star} tone="amber" />
        <Stat label="Respondidas" value={ans.length} hint={`de ${rows.length} enviadas (${rows.length ? Math.round((ans.length / rows.length) * 100) : 0}%)`} icon={Send} />
        <Stat label="Con comentario" value={ans.filter((r) => r.comment).length} icon={MessageSquareQuote} tone="violet" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="card"><h2 className="mb-3 font-semibold text-ink">Promotores y detractores</h2>
          <Donut label="Distribución NPS" data={[{ label: "Promotores (9-10)", value: pro, color: "#16a34a" }, { label: "Pasivos (7-8)", value: pas, color: "#f59e0b" }, { label: "Detractores (0-6)", value: det, color: "#dc2626" }]} /></div>
        <div className="card"><h2 className="mb-3 font-semibold text-ink">Distribución de recomendación (0-10)</h2>
          <BarChart height={170} data={Array.from({ length: 11 }, (_, i) => ({ label: String(i), value: ans.filter((r) => r.nps === i).length, color: i >= 9 ? "#16a34a" : i >= 7 ? "#f59e0b" : "#dc2626" }))} /></div>
        <div className="card"><h2 className="mb-3 font-semibold text-ink">Promedio por aspecto (1-5)</h2>
          <HBarChart data={aspects} max={5} />
          <h3 className="mb-2 mt-4 text-sm font-semibold text-ink">Satisfacción general</h3>
          <BarChart height={110} data={[1, 2, 3, 4, 5].map((i) => ({ label: `${i}★`, value: ans.filter((r) => r.satisfaction === i).length }))} />
        </div>
      </div>
      <Section title="Resultados por aliado"><GroupTable g={byAliado} first="Aliado" /></Section>
      <Section title="Resultados por servicio"><GroupTable g={byServicio} first="Servicio" /></Section>
      {byEvento.length > 0 && <Section title="Resultados por evento o curso"><GroupTable g={byEvento} first="Evento" /></Section>}
    </>
  );
}

function GroupTable({ g, first }: { g: ReturnType<typeof summarize>; first: string }) {
  return (
    <Table head={[first, "Enviadas", "Respondidas", "Tasa", "NPS", "Satisfacción", "Promotores / pasivos / detractores"]} empty="Sin datos">
      {g.map((x) => (
        <tr key={x.label}><Td className="font-medium">{x.label}</Td><Td>{x.sent}</Td><Td>{x.answered}</Td><Td>{x.rate}%</Td>
          <Td><Badge tone={npsTone(x.nps)}>{x.nps == null ? "—" : String(x.nps)}</Badge></Td><Td>{x.sat ?? "—"}</Td>
          <Td><div className="flex h-2.5 w-40 overflow-hidden rounded-full bg-slate-100" aria-label={`${x.promoters} promotores, ${x.passives} pasivos, ${x.detractors} detractores`}>
            {x.answered > 0 && <><span style={{ width: `${(x.promoters / x.answered) * 100}%` }} className="bg-emerald-500" /><span style={{ width: `${(x.passives / x.answered) * 100}%` }} className="bg-amber-400" /><span style={{ width: `${(x.detractors / x.answered) * 100}%` }} className="bg-red-500" /></>}
          </div><div className="mt-1 text-xs text-slate-500">{x.promoters} / {x.passives} / {x.detractors}</div></Td></tr>))}
    </Table>
  );
}

function Analisis({ ans }: { ans: any[] }) {
  const withC = ans.filter((r) => r.comment);
  if (!withC.length) return <EmptyState title="Sin comentarios para analizar">Cuando los empresarios dejen comentarios abiertos, aquí se agrupan los temas más mencionados.</EmptyState>;
  const comments = withC.map((r) => r.comment as string);
  const t = themes(comments, 12);
  const split = (docs: number[]) => ({ pro: docs.filter((i) => withC[i].nps >= 9).length, det: docs.filter((i) => withC[i].nps <= 6).length });
  const Block = ({ title, list, hint }: { title: string; list: ReturnType<typeof themes>["words"]; hint: string }) => (
    <div className="card">
      <h2 className="font-semibold text-ink">{title}</h2><p className="mb-3 text-xs text-slate-500">{hint}</p>
      {list.length ? (
        <ul className="space-y-3">
          {list.map((x) => { const s = split(x.docs); return (
            <li key={x.term}>
              <details>
                <summary className="cursor-pointer">
                  <div className="mb-0.5 flex items-center justify-between gap-2 text-sm"><span className="font-medium text-ink">{x.term}</span>
                    <span className="text-xs text-slate-500">{x.count} comentario(s){s.pro ? ` · ${s.pro} promotor` : ""}{s.det ? ` · ${s.det} detractor` : ""}</span></div>
                  <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand" style={{ width: `${(x.count / withC.length) * 100}%` }} /></div>
                </summary>
                <ul className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3 text-xs text-slate-600">
                  {x.docs.slice(0, 4).map((i) => <li key={i}>«{withC[i].comment}» <span className="text-slate-400">— NPS {withC[i].nps}</span></li>)}
                </ul>
              </details>
            </li>); })}
        </ul>) : <p className="text-sm text-slate-400">No hay frases que se repitan todavía.</p>}
    </div>
  );
  return (
    <>
      <p className="mb-4 text-sm text-slate-500">{withC.length} comentario(s) analizados. Se agrupan palabras y frases de dos palabras (sin tildes, sin palabras vacías del español y unificando plurales). Abre un tema para ver los comentarios que lo mencionan.</p>
      <div className="grid gap-5 lg:grid-cols-2">
        <Block title="Temas más mencionados (frases)" list={t.bigrams} hint="Frases de dos palabras que aparecen en al menos dos comentarios" />
        <Block title="Palabras más mencionadas" list={t.words} hint="Número de comentarios que mencionan cada palabra" />
      </div>
    </>
  );
}

function Respuestas({ ans }: { ans: any[] }) {
  return (
    <Table head={["Fecha", "Tipo", "Servicio / evento", "Aliado", "Empresa", "NPS", "Satisfacción", "Aspectos", "Comentario"]} empty="Sin respuestas">
      {ans.map((r) => { const a = jparse<any>(r.answers, {}); return (
        <tr key={r.id}><Td className="whitespace-nowrap text-xs">{fmtDate(r.answered_at, false)}</Td><Td>{KIND_LABEL[r.kind] ?? r.kind}</Td><Td>{r.event || r.service || "—"}</Td><Td>{r.aliado || "—"}</Td><Td>{r.razon_social || "—"}</Td>
          <Td><Badge tone={r.nps >= 9 ? "green" : r.nps >= 7 ? "amber" : "red"}>{String(r.nps)}</Badge></Td><Td>{r.satisfaction}★</Td>
          <Td className="whitespace-nowrap text-xs">{ASPECTS.map(([k, l]) => <div key={k}>{l.split(" ")[0]}: {a[k] ?? "—"}</div>)}</Td>
          <Td className="max-w-sm text-xs">{r.comment || <span className="text-slate-300">—</span>}</Td></tr>); })}
    </Table>
  );
}

function Envios({ rows }: { rows: any[] }) {
  return (
    <Table head={["Enviada", "Tipo", "Servicio / evento", "Empresa", "Estado", "Respondida", "Enlace público", ""]} empty="Sin encuestas enviadas">
      {rows.map((r) => (
        <tr key={r.id}><Td className="whitespace-nowrap text-xs">{fmtDate(r.sent_at)}</Td><Td>{KIND_LABEL[r.kind] ?? r.kind}</Td><Td>{r.event || r.service || "Acompañamiento"}{r.aliado && <div className="text-xs text-slate-400">{r.aliado}</div>}</Td>
          <Td>{r.razon_social || "—"}</Td><Td><Badge>{r.status}</Badge></Td><Td className="text-xs">{r.answered_at ? fmtDate(r.answered_at) : "—"}</Td>
          <Td className="text-xs">{r.status === "enviada" ? <a className="text-brand" href={surveyUrl(r.token)} target="_blank" rel="noopener">/encuesta/{r.token.slice(0, 8)}…</a> : <span className="text-slate-300">usado</span>}</Td>
          <Td>{r.status === "enviada" && <form action={A.resendSurvey}><input type="hidden" name="id" value={r.id} /><button className="btn-ghost btn-sm">Reenviar aviso</button></form>}</Td></tr>))}
    </Table>
  );
}
