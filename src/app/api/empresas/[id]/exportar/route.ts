import ExcelJS from "exceljs";
import { all, get } from "@/lib/db";
import { canSeeCompany, currentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fileResponse, toCsv, XLSX_TYPE, type Col } from "@/lib/xlsx";
import { fmtDate, slugify } from "@/lib/util";

/**
 * RF-SRV-06: resultados, indicadores e historial de servicios recibidos por una empresa, por periodo.
 *   GET /api/empresas/{id}/exportar?format=xlsx|csv&desde=YYYY-MM-DD&hasta=YYYY-MM-DD[&seccion=servicios|sesiones|indicadores|mediciones|cierres]
 * Excel: un libro con hojas Resumen, Servicios, Sesiones, Indicadores, Mediciones y Cierres. CSV: una sección.
 * Respeta el alcance (canSeeCompany) y queda en auditoría.
 */
const SECTIONS = ["servicios", "sesiones", "indicadores", "mediciones", "cierres"] as const;
type Sec = (typeof SECTIONS)[number];
const yes = (v: any) => (v ? "Sí" : "No");
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("No autenticado", { status: 401 });
  const id = Number((await params).id);
  if (!canSeeCompany(u, id)) return new Response("Sin acceso", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const format = sp.get("format") === "csv" ? "csv" : "xlsx";
  const desdeD = DAY.test(sp.get("desde") || "") ? sp.get("desde")! : "";
  const hastaD = DAY.test(sp.get("hasta") || "") ? sp.get("hasta")! : "";
  if (desdeD && hastaD && desdeD > hastaD)
    return Response.redirect(new URL(`/empresas/${id}?error=${encodeURIComponent("El periodo no es válido: «desde» es posterior a «hasta»")}#exportar`, req.url), 303);
  const from = desdeD ? new Date(desdeD + "T00:00:00-05:00").toISOString() : "0000";
  const to = hastaD ? new Date(hastaD + "T23:59:59.999-05:00").toISOString() : "9999";
  const c = get<any>("SELECT c.*, p.name program FROM companies c LEFT JOIN programs p ON p.id=c.program_id WHERE c.id=?", id);
  const periodo = `${desdeD ? fmtDate(from, false) : "inicio"} a ${hastaD ? fmtDate(to, false) : "hoy"}`;

  const data: Record<Sec, { name: string; cols: Col[]; rows: any[] }> = {
    servicios: {
      name: "Servicios",
      cols: [{ header: "Tipo", key: "tipo" }, { header: "Servicio / asignación", key: "servicio", width: 36 }, { header: "Aliado", key: "aliado", width: 24 }, { header: "Mentor", key: "mentor", width: 26 },
        { header: "Estado", key: "estado" }, { header: "Fecha", key: "fecha", width: 20 }, { header: "Aceptación de la empresa", key: "aceptacion", width: 24 },
        { header: "Sesiones realizadas (periodo)", key: "realizadas" }, { header: "Horas aceptadas (periodo)", key: "horas" }, { header: "Cierre", key: "cierre" }],
      rows: [
        ...all<any>(`SELECT r.*, sv.name servicio, a.name aliado, m.name mentor,
            (SELECT COUNT(*) FROM mentoring_sessions s WHERE s.referral_id=r.id AND s.status='realizada' AND s.scheduled_at BETWEEN ? AND ?) realizadas,
            (SELECT COALESCE(SUM(s.hours),0) FROM mentoring_sessions s WHERE s.referral_id=r.id AND s.status='realizada' AND s.accepted_at IS NOT NULL AND s.scheduled_at BETWEEN ? AND ?) horas,
            (SELECT status FROM closures cl WHERE cl.referral_id=r.id ORDER BY cl.id DESC LIMIT 1) cierre
          FROM referrals r JOIN servicios sv ON sv.id=r.servicio_id LEFT JOIN aliados a ON a.id=r.aliado_id LEFT JOIN users m ON m.id=r.mentor_id
          WHERE r.company_id=? AND r.created_at<=? AND (r.closed_at IS NULL OR r.closed_at>=?) ORDER BY r.created_at`, from, to, from, to, id, to, from)
          .map((r) => ({ tipo: "Remisión", servicio: r.servicio, aliado: r.aliado, mentor: r.mentor || "—", estado: r.status, fecha: fmtDate(r.created_at),
            aceptacion: r.accepted_at ? `${fmtDate(r.accepted_at)} · IP ${r.accepted_ip}` : "—", realizadas: r.realizadas, horas: r.horas, cierre: r.cierre || "—" })),
        ...all<any>("SELECT * FROM company_items WHERE company_id=? AND created_at BETWEEN ? AND ? ORDER BY created_at", id, from, to)
          .map((i) => ({ tipo: `Asignación (${i.kind})`, servicio: i.label, aliado: "—", mentor: "—", estado: i.status, fecha: fmtDate(i.created_at), aceptacion: "—", realizadas: "", horas: "", cierre: "—" })),
      ],
    },
    sesiones: {
      name: "Sesiones",
      cols: [{ header: "Fecha", key: "fecha", width: 20 }, { header: "Sesión", key: "title", width: 32 }, { header: "Mentor", key: "mentor", width: 26 }, { header: "Servicio", key: "servicio", width: 30 },
        { header: "Modalidad", key: "modality" }, { header: "Duración (min)", key: "duration_min" }, { header: "Estado", key: "status" }, { header: "Horas ejecutadas", key: "hours" },
        { header: "Aceptada", key: "aceptada" }, { header: "Aceptada por", key: "accepter", width: 26 }, { header: "Fecha de aceptación", key: "fecha_acept", width: 20 }, { header: "IP de aceptación", key: "accepted_ip" },
        { header: "Cuenta para pagos", key: "pagos" }, { header: "Temas", key: "topics", width: 40 }, { header: "Compromisos", key: "commitments", width: 40 }, { header: "Resultados", key: "results", width: 40 },
        { header: "Motivo de cancelación", key: "cancel_reason", width: 30 }],
      rows: all<any>(`SELECT s.*, m.name mentor, a.name accepter, sv.name servicio FROM mentoring_sessions s LEFT JOIN users m ON m.id=s.mentor_id LEFT JOIN users a ON a.id=s.accepted_by
          LEFT JOIN referrals r ON r.id=s.referral_id LEFT JOIN servicios sv ON sv.id=r.servicio_id WHERE s.company_id=? AND s.scheduled_at BETWEEN ? AND ? ORDER BY s.scheduled_at`, id, from, to)
        .map((s) => ({ ...s, fecha: fmtDate(s.scheduled_at), servicio: s.servicio || "Mentoría del programa", hours: s.status === "realizada" ? s.hours : "", aceptada: yes(s.accepted_at),
          fecha_acept: s.accepted_at ? fmtDate(s.accepted_at) : "", pagos: yes(s.status === "realizada" && s.accepted_at) })),
    },
    indicadores: {
      name: "Indicadores",
      cols: [{ header: "Indicador", key: "name", width: 32 }, { header: "Unidad", key: "unit" }, { header: "Línea base", key: "baseline" }, { header: "Meta", key: "goal" },
        { header: "Resultado", key: "final" }, { header: "Variación", key: "variacion" }, { header: "Avance hacia la meta (%)", key: "avance" }, { header: "Mediciones en el periodo", key: "n" },
        { header: "Último valor del periodo", key: "ultimo" }, { header: "Actualizado", key: "actualizado", width: 20 }],
      rows: all<any>(`SELECT i.*, (SELECT COUNT(*) FROM indicator_values v WHERE v.indicator_id=i.id AND v.recorded_at BETWEEN ? AND ?) n,
          (SELECT v.value FROM indicator_values v WHERE v.indicator_id=i.id AND v.recorded_at BETWEEN ? AND ? ORDER BY v.recorded_at DESC LIMIT 1) ultimo
        FROM indicators i WHERE i.company_id=? ORDER BY i.name`, from, to, from, to, id)
        .map((i) => ({ ...i, variacion: i.final != null && i.baseline != null ? +(i.final - i.baseline).toFixed(2) : "",
          avance: i.final != null && i.baseline != null && i.goal != null && i.goal !== i.baseline ? Math.round(((i.final - i.baseline) / (i.goal - i.baseline)) * 100) : "",
          ultimo: i.ultimo ?? "", actualizado: fmtDate(i.updated_at) })),
    },
    mediciones: {
      name: "Mediciones",
      cols: [{ header: "Fecha", key: "fecha", width: 20 }, { header: "Indicador", key: "indicador", width: 32 }, { header: "Valor", key: "value" }, { header: "Nota", key: "note", width: 40 },
        { header: "Registrado por", key: "who", width: 26 }, { header: "Sesión", key: "session_id" }],
      rows: all<any>(`SELECT v.*, i.name indicador, u.name who FROM indicator_values v JOIN indicators i ON i.id=v.indicator_id LEFT JOIN users u ON u.id=v.recorded_by
          WHERE i.company_id=? AND v.recorded_at BETWEEN ? AND ? ORDER BY v.recorded_at`, id, from, to).map((v) => ({ ...v, fecha: fmtDate(v.recorded_at), session_id: v.session_id ?? "" })),
    },
    cierres: {
      name: "Cierres",
      cols: [{ header: "Servicio", key: "servicio", width: 32 }, { header: "Resultado", key: "result", width: 50 }, { header: "Estado", key: "status" }, { header: "Registrado", key: "creado", width: 20 },
        { header: "Registrado por", key: "creator", width: 26 }, { header: "Aprobado por", key: "approver", width: 26 }, { header: "Fecha de aprobación", key: "aprobado", width: 20 }],
      rows: all<any>(`SELECT cl.*, sv.name servicio, cb.name creator, ab.name approver FROM closures cl LEFT JOIN referrals r ON r.id=cl.referral_id LEFT JOIN servicios sv ON sv.id=r.servicio_id
          LEFT JOIN users cb ON cb.id=cl.created_by LEFT JOIN users ab ON ab.id=cl.approved_by
          WHERE cl.company_id=? AND (cl.created_at BETWEEN ? AND ? OR cl.approved_at BETWEEN ? AND ?) ORDER BY cl.created_at`, id, from, to, from, to)
        .map((x) => ({ ...x, servicio: x.servicio || "Acompañamiento del programa", creado: fmtDate(x.created_at), aprobado: x.approved_at ? fmtDate(x.approved_at) : "" })),
    },
  };

  const ses = data.sesiones.rows;
  const summary: [string, any][] = [
    ["Empresa", c.razon_social], ["NIT", `${c.nit}-${c.dv}`], ["Programa", c.program], ["Periodo", periodo],
    ["Servicios / asignaciones en el periodo", data.servicios.rows.length],
    ["Sesiones programadas en el periodo", ses.length], ["Sesiones realizadas", ses.filter((s) => s.status === "realizada").length],
    ["Sesiones canceladas", ses.filter((s) => s.status === "cancelada").length],
    ["Horas ejecutadas", ses.filter((s) => s.status === "realizada").reduce((a, s) => a + (Number(s.hours) || 0), 0)],
    ["Horas aceptadas por la empresa (cuentan para pagos)", ses.filter((s) => s.status === "realizada" && s.aceptada === "Sí").reduce((a, s) => a + (Number(s.hours) || 0), 0)],
    ["Indicadores", data.indicadores.rows.length], ["Mediciones en el periodo", data.mediciones.rows.length], ["Cierres", data.cierres.rows.length],
    ["Generado", `${fmtDate(new Date().toISOString())} por ${u.email}`],
  ];
  const base = `historial-${slugify(c.razon_social)}-${desdeD || "inicio"}-${hastaD || "hoy"}`;

  if (format === "csv") {
    const sec = (SECTIONS as readonly string[]).includes(sp.get("seccion") || "") ? (sp.get("seccion") as Sec) : "sesiones";
    const d = data[sec];
    await audit(u, "exportar_historial", "company", id, null, { formato: "csv", seccion: sec, periodo, filas: d.rows.length });
    return fileResponse(toCsv(d.cols, d.rows), `${base}-${sec}.csv`, "text/csv; charset=utf-8");
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma de Fomento Empresarial";
  const style = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A6CFF" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };
  const rs = wb.addWorksheet("Resumen");
  rs.columns = [{ header: "Concepto", key: "k", width: 48 }, { header: "Valor", key: "v", width: 48 }];
  rs.addRows(summary.map(([k, v]) => ({ k, v })));
  style(rs);
  for (const sec of SECTIONS) {
    const d = data[sec];
    const ws = wb.addWorksheet(d.name);
    ws.columns = d.cols.map((x) => ({ ...x, width: x.width || Math.max(14, x.header.length + 4) }));
    ws.addRows(d.rows);
    if (!d.rows.length) ws.addRow({ [d.cols[0].key]: "Sin registros en el periodo" });
    style(ws);
  }
  await audit(u, "exportar_historial", "company", id, null, { formato: "xlsx", periodo, sesiones: ses.length, servicios: data.servicios.rows.length });
  return fileResponse(Buffer.from(await wb.xlsx.writeBuffer()), `${base}.xlsx`, XLSX_TYPE);
}
