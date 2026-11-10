/**
 * Brechas transversales del módulo plataforma:
 *  RF-ACC-03 bloqueo tras 5 códigos errados · RF-EMP-03 contactos multiempresa y empresa activa ·
 *  RF-INT-06 importación xlsx/csv/json con validación fila por fila · RNF-REN-07 cargue en segundo plano ·
 *  RF-PAR-02 renombrar sin perder historial · RF-NOT-04 mensajes con la marca.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { cleanupDb, ctx, demoUser, form, loginAs, redirectOf, setupDb } from "./helpers";

let db: typeof import("@/lib/db");
let login: typeof import("@/app/login/actions");
let P: typeof import("@/lib/jobs/plataforma");
let util: typeof import("@/lib/util");

before(async () => {
  await setupDb();
  db = await import("@/lib/db");
  login = await import("@/app/login/actions");
  P = await import("@/lib/jobs/plataforma");
  util = await import("@/lib/util");
});
after(cleanupDb);

/** NIT válido de 9 dígitos con su DV. */
const nit = (n: number) => { const x = String(910000000 + n); return { nit: x, dv: util.nitDv(x) }; };

describe("RF-ACC-03: bloqueo temporal tras 5 códigos errados", () => {
  const email = "empresa1@laespiga.test";
  const codeOf = (url: string) => new URL("http://x" + url).searchParams.get("demo") || "";

  test("ingreso con código: 4 errores avisan, el 5.º bloquea y ni el código correcto entra", async () => {
    ctx.token = "";
    const code = codeOf(await redirectOf(() => login.requestOtp(form({ email, purpose: "login" }))));
    assert.match(code, /^\d{6}$/);
    for (let i = 1; i <= 4; i++) {
      const url = await redirectOf(() => login.verifyOtp(form({ email, code: "000000", purpose: "login" })));
      assert.match(url, new RegExp(`Te queda.? ${5 - i} intento`), `intento ${i}`);
    }
    const blocked = await redirectOf(() => login.verifyOtp(form({ email, code: "000000", purpose: "login" })));
    assert.match(blocked, /bloqueada 15 minutos/);
    const still = await redirectOf(() => login.verifyOtp(form({ email, code, purpose: "login" })));
    assert.match(still, /bloqueada temporalmente/);
    assert.equal(ctx.token, "", "no se abrió sesión");
    // tampoco se emiten códigos nuevos mientras dura el bloqueo
    assert.match(await redirectOf(() => login.requestOtp(form({ email, purpose: "login" }))), /bloqueada temporalmente/);
    assert.ok(db.get("SELECT 1 x FROM audit_log WHERE action='bloqueo_codigo' AND user_email=?", email));
    assert.ok(db.get("SELECT 1 x FROM security_events WHERE kind='bloqueo_codigo' AND email=?", email));
  });

  test("vencido el bloqueo, un código nuevo correcto entra y reinicia el contador", async () => {
    db.run("UPDATE rate_limits SET window_start=? WHERE key=?", Date.now() - 16 * 60000, `codigo_fallido:${email}`);
    const code = codeOf(await redirectOf(() => login.requestOtp(form({ email, purpose: "login" }))));
    assert.equal(await redirectOf(() => login.verifyOtp(form({ email, code, purpose: "login" }))), "/");
    assert.ok(ctx.token, "se abrió sesión");
    assert.equal(db.get("SELECT 1 x FROM rate_limits WHERE key=?", `codigo_fallido:${email}`), undefined);
  });

  test("recuperación de clave: también bloquea al 5.º código errado", async () => {
    const e2 = "empresa2@textiles.test";
    const code = codeOf(await redirectOf(() => login.requestOtp(form({ email: e2, purpose: "reset" }))));
    for (let i = 1; i <= 4; i++) await redirectOf(() => login.verifyOtp(form({ email: e2, code: "111111", purpose: "reset", password: "ClaveNueva2026" })));
    assert.match(await redirectOf(() => login.verifyOtp(form({ email: e2, code: "111111", purpose: "reset", password: "ClaveNueva2026" }))), /^\/recuperar.*bloqueada/);
    assert.match(await redirectOf(() => login.verifyOtp(form({ email: e2, code, purpose: "reset", password: "ClaveNueva2026" }))), /bloqueada temporalmente/);
  });

  test("un correo inexistente recibe la misma respuesta (no revela si existe)", async () => {
    for (let i = 0; i < 5; i++) await redirectOf(() => login.verifyOtp(form({ email: "nadie@ejemplo.co", code: "123456", purpose: "login" })));
    assert.match(await redirectOf(() => login.verifyOtp(form({ email: "nadie@ejemplo.co", code: "123456", purpose: "login" }))), /bloqueada temporalmente/);
  });
});

describe("RF-INT-06: importación en Excel, CSV y JSON con validación fila por fila", () => {
  const header = ["NIT (sin DV)", "DV", "Razón social", "Sector", "Tamaño", "Ciudad", "Programa", "Representante", "Correo representante", "Celular"];
  const sample = () => {
    const a = nit(1), b = nit(2);
    return [
      [a.nit, a.dv, "Alfa SAS", "Comercio", "Micro", "Bogotá", "Territorio MIPYME", "Ana Alfa", "ana@alfa.co", "3001112233"],
      [b.nit, String((Number(b.dv) + 1) % 10), "Beta SAS", "Servicios", "Micro", "Bogotá", "Territorio MIPYME", "Beto Beta", "beto@beta.co", ""],
      [a.nit, a.dv, "Alfa duplicada", "", "", "", "Territorio MIPYME", "Otra", "otra@alfa.co", ""],
      ["", "", "Sin NIT", "", "", "", "Territorio MIPYME", "X", "x@x.co", ""],
    ];
  };
  const xlsx = async (rows: any[][]) => { const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Empresas"); ws.addRow(header); rows.forEach((r) => ws.addRow(r)); return Buffer.from(await wb.xlsx.writeBuffer()); };
  const csv = (rows: any[][], sep = ";") => Buffer.from("﻿" + [header, ...rows].map((r) => r.map((v: any) => (String(v).includes(sep) ? `"${v}"` : v)).join(sep)).join("\r\n"));
  const json = (rows: any[][]) => Buffer.from(JSON.stringify(rows.map((r) => ({ nit: r[0], dv: r[1], razon_social: r[2], sector: r[3], tamano: r[4], ciudad: r[5], programa: r[6], representante: r[7], correo: r[8], celular: r[9] }))));

  test("los tres formatos producen las mismas filas y los mismos errores por fila", async () => {
    const admin = await demoUser("admin@compensar.test");
    const opts = { activate: true, source: "propulsor_empresarial" };
    const results: Record<string, any> = {};
    for (const [name, buf] of [["e.xlsx", await xlsx(sample())], ["e.csv", csv(sample())], ["e.json", json(sample())]] as const) {
      const p = await P.parseCompanyFile(name, buf);
      assert.equal(p.error, undefined, name);
      assert.equal(p.rows.length, 4, name);
      const v = P.validateCompanyRows(p.rows, admin, opts);
      results[name] = v.errors.map((e) => e.msg);
      assert.equal(v.errors.length, 3, `${name}: ${JSON.stringify(v.errors)}`);
    }
    assert.deepEqual(results["e.csv"], results["e.xlsx"]);
    assert.deepEqual(results["e.json"], results["e.xlsx"]);
    assert.match(results["e.xlsx"][0], /dígito de verificación correcto/);
    assert.match(results["e.xlsx"][1], /duplicado/);
    assert.match(results["e.xlsx"][2], /Faltan campos obligatorios/);
  });

  test("las filas se numeran como en el archivo (Excel/CSV: encabezado = fila 1; JSON: elemento 1)", async () => {
    const admin = await demoUser("admin@compensar.test");
    const x = P.validateCompanyRows((await P.parseCompanyFile("a.xlsx", await xlsx(sample()))).rows, admin, { activate: false, source: "dei" });
    assert.deepEqual(x.errors.map((e) => e.row), [3, 4, 5]);
    const j = P.validateCompanyRows((await P.parseCompanyFile("a.json", json(sample()))).rows, admin, { activate: false, source: "dei" });
    assert.deepEqual(j.errors.map((e) => e.row), [2, 3, 4]);
  });

  test("todo o nada: con un error no se guarda ninguna empresa", async () => {
    const admin = await demoUser("admin@compensar.test");
    const before = db.get<any>("SELECT COUNT(*) n FROM companies").n;
    const out = await P.importCompanyRows((await P.parseCompanyFile("e.csv", csv(sample()))).rows, admin, { activate: true, source: "dei" });
    assert.equal(out.ok, false);
    assert.equal(db.get<any>("SELECT COUNT(*) n FROM companies").n, before);
  });

  test("formato no admitido, JSON inválido y CSV con coma también funcionan como se espera", async () => {
    assert.match((await P.parseCompanyFile("e.txt", Buffer.from("x"))).error!, /Formato no admitido/);
    assert.match((await P.parseCompanyFile("e.json", Buffer.from("{no"))).error!, /JSON válido/);
    const ok = sample().slice(0, 1);
    assert.equal((await P.parseCompanyFile("e.csv", csv(ok, ","))).rows[0].razon, "Alfa SAS");
  });

  test("cargue válido guarda el ORIGEN en companies.source", async () => {
    const admin = await demoUser("admin@compensar.test");
    const n = nit(10);
    const rows = [[n.nit, n.dv, "Gamma DEI SAS", "", "Micro", "Bogotá", "Territorio MIPYME", "Gina Gamma", "gina@gamma.co", ""]];
    const out = await P.importCompanyRows((await P.parseCompanyFile("e.json", json(rows))).rows, admin, { activate: false, source: "universidad_empresa" });
    assert.ok(out.ok, JSON.stringify(out.errors));
    assert.equal(db.get<any>("SELECT source FROM companies WHERE nit=?", n.nit).source, "universidad_empresa");
    assert.equal(P.sourceLabel("universidad_empresa"), "Universidad-Empresa");
  });
});

describe("RF-EMP-03: un contacto que ya es usuario queda vinculado a la nueva empresa", () => {
  test("cargue: correo de usuario de empresa se vincula; correo de usuario interno se rechaza", async () => {
    const admin = await demoUser("admin@compensar.test");
    const a = nit(20), b = nit(21);
    const interno = await P.parseCompanyFile("i.json", Buffer.from(JSON.stringify([{ nit: b.nit, dv: b.dv, razon_social: "Interna SAS", programa: "Territorio MIPYME", representante: "Mentor", correo: "mentor1@compensar.test" }])));
    const bad = await P.importCompanyRows(interno.rows, admin, { activate: false, source: "cargue_masivo" });
    assert.equal(bad.ok, false);
    assert.match(bad.errors[0].msg, /usuario interno/);
    const p = await P.parseCompanyFile("c.json", Buffer.from(JSON.stringify([{ nit: a.nit, dv: a.dv, razon_social: "Segunda de Laura SAS", programa: "Territorio MIPYME", representante: "Laura", correo: "EMPRESA1@laespiga.test" }])));
    const out = await P.importCompanyRows(p.rows, admin, { activate: true, source: "cargue_masivo" });
    assert.ok(out.ok, JSON.stringify(out.errors));
    assert.equal(out.linked, 1);
    const cid = db.get<any>("SELECT id FROM companies WHERE nit=?", a.nit).id;
    const uid = db.get<any>("SELECT id FROM users WHERE email='empresa1@laespiga.test'").id;
    assert.ok(db.get("SELECT 1 x FROM company_contacts WHERE company_id=? AND user_id=?", cid, uid));
    assert.equal(db.get<any>("SELECT COUNT(*) n FROM users WHERE email='empresa1@laespiga.test'").n, 1, "no se duplica el usuario");
    assert.ok(db.get("SELECT 1 x FROM notifications WHERE template_key='vinculacion_empresa' AND user_id=?", uid));
  });

  test("selector de empresa: currentUser devuelve la empresa activa y el cambio queda auditado", async () => {
    const auth = await import("@/lib/auth");
    const cid = db.get<any>("SELECT id FROM companies WHERE razon_social='Segunda de Laura SAS'").id;
    const espiga = db.get<any>("SELECT id FROM companies WHERE nit='900111222'").id;
    await loginAs("empresa1@laespiga.test");
    assert.equal((await auth.currentUser())!.company_id, espiga);
    assert.deepEqual(auth.userCompanies((await auth.currentUser())!.id).map((c) => c.id).sort(), [espiga, cid].sort());
    assert.equal(await redirectOf(() => login.switchCompany(cid)), "/");
    const u = (await auth.currentUser())!;
    assert.equal(u.company_id, cid);
    assert.ok(u.grants.every((g) => g.scope_type !== "company" || g.scope_id === cid));
    assert.ok(db.get("SELECT 1 x FROM audit_log WHERE action='cambiar_empresa_activa' AND entity_id=?", String(cid)));
    // no puede activar una empresa ajena
    const ajena = db.get<any>("SELECT id FROM companies WHERE nit='901555666'").id;
    assert.equal(await redirectOf(() => login.switchCompany(ajena)), "/sin-acceso");
    // aunque alguien escriba en la sesión una empresa ajena, currentUser la ignora
    db.run("UPDATE sessions SET active_company_id=? WHERE token=?", ajena, ctx.token);
    assert.equal((await auth.currentUser())!.company_id, espiga);
  });

  test("creación individual: vincula el contacto existente en vez de rechazarlo", async () => {
    const acts = await import("@/app/(app)/empresas/actions");
    const n = nit(30);
    await loginAs("admin@compensar.test");
    const url = await redirectOf(() => acts.createCompany(form({ razon_social: "Tercera de Tomás SAS", nit: n.nit, dv: n.dv, program_id: 2, rep: "Tomás", email: "empresa2@textiles.test" })));
    assert.match(url, /ok=Empresa creada.*vinculado/);
    const url2 = await redirectOf(() => acts.createCompany(form({ razon_social: "Con interno", nit: nit(31).nit, dv: nit(31).dv, program_id: 2, rep: "X", email: "gestor@compensar.test" })));
    assert.match(url2, /error=El correo pertenece a un usuario interno/);
  });
});

describe("RNF-REN-07: cargue masivo en segundo plano con aviso al terminar", () => {
  test("300 filas: se encola, el job lo procesa todo o nada y avisa por notificación y correo", async () => {
    const acts = await import("@/app/(app)/empresas/actions");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Empresas");
    ws.addRow(["NIT (sin DV)", "DV", "Razón social", "Sector", "Tamaño", "Ciudad", "Programa", "Representante", "Correo representante", "Celular"]);
    for (let i = 0; i < 300; i++) { const n = nit(1000 + i); ws.addRow([n.nit, n.dv, `Empresa Lote ${i} SAS`, "Comercio", "Micro", "Bogotá", "Territorio MIPYME", `Rep ${i}`, `rep${i}@lote.co`, "3001234567"]); }
    const file = new File([Buffer.from(await wb.xlsx.writeBuffer())], "lote-300.xlsx");
    await loginAs("admin@compensar.test");
    const res = await acts.importCompanies(null, form({ file, source: "dei", activate: "on" }));
    assert.equal(res.ok, true);
    assert.equal(res.background, true);
    assert.equal(res.total, 300);
    const job = db.get<any>("SELECT * FROM import_jobs WHERE id=?", res.jobId);
    assert.equal(job.status, "pendiente");
    assert.equal(db.get<any>("SELECT COUNT(*) n FROM companies WHERE source='dei' AND razon_social LIKE 'Empresa Lote%'").n, 0, "nada se guarda en la petición");
    const t0 = Date.now();
    const r = await P.jobs.find((j) => j.name === "cargue_empresas")!.run();
    assert.match(String(r), /300 empresa/);
    const done = db.get<any>("SELECT * FROM import_jobs WHERE id=?", res.jobId);
    assert.equal(done.status, "ok");
    assert.equal(done.created_count, 300);
    assert.equal(done.payload, null, "el contenido del archivo no queda guardado al terminar");
    assert.equal(db.get<any>("SELECT COUNT(*) n FROM companies WHERE source='dei' AND razon_social LIKE 'Empresa Lote%'").n, 300);
    const aviso = db.get<any>("SELECT * FROM notifications WHERE template_key='cargue_terminado' AND user_id=? ORDER BY id DESC", db.get<any>("SELECT id FROM users WHERE email='admin@compensar.test'").id);
    assert.ok(aviso, "aviso al terminar");
    assert.equal(aviso.channel, "correo");
    assert.match(aviso.body, /300 empresa\(s\) creada\(s\)/);
    assert.ok(Date.now() - t0 < 60000);
  });

  test("un cargue en segundo plano con errores no guarda nada y deja los errores por fila", async () => {
    const admin = await demoUser("admin@compensar.test");
    const rows = Array.from({ length: 60 }, (_, i) => { const n = nit(5000 + i); return { row: i + 2, nit: n.nit, dv: i === 41 ? "X" : n.dv, razon: `Err ${i}`, sector: "", size: "", city: "", program: "Territorio MIPYME", rep: "R", email: `err${i}@lote.co`, phone: "" }; });
    const id = P.createImportJob(admin, "errores.csv", "csv", rows, { activate: false, source: "otro:Feria" }, true);
    await P.processImportJob(id);
    const j = db.get<any>("SELECT * FROM import_jobs WHERE id=?", id);
    assert.equal(j.status, "con_errores");
    assert.deepEqual(JSON.parse(j.errors).map((e: any) => e.row), [43]);
    assert.equal(db.get<any>("SELECT COUNT(*) n FROM companies WHERE razon_social LIKE 'Err %'").n, 0);
  });
});

describe("RF-PAR-02: renombrar ejes, líneas y rutas sin perder el historial", () => {
  test("renombrar conserva el id y queda en auditoría con antes y después", async () => {
    const cfg = await import("@/app/(app)/configuracion/actions");
    const eje = db.get<any>("SELECT * FROM ejes ORDER BY id LIMIT 1");
    await loginAs("admin@compensar.test");
    assert.match(await redirectOf(() => cfg.renameNode(form({ kind: "eje", id: eje.id, name: "Gestión comercial y ventas" }))), /ok=Eje renombrado/);
    assert.equal(db.get<any>("SELECT name FROM ejes WHERE id=?", eje.id).name, "Gestión comercial y ventas");
    const a = db.get<any>("SELECT * FROM audit_log WHERE action='renombrar' AND entity='eje' AND entity_id=?", String(eje.id));
    assert.equal(JSON.parse(a.before).name, eje.name);
    const ruta = db.get<any>("SELECT * FROM rutas ORDER BY id LIMIT 1");
    await redirectOf(() => cfg.renameNode(form({ kind: "ruta", id: ruta.id, name: "Ruta comercial", description: "Nueva descripción" })));
    assert.equal(db.get<any>("SELECT name FROM rutas WHERE id=?", ruta.id).name, "Ruta comercial");
    await loginAs("mentor1@compensar.test");
    assert.equal(await redirectOf(() => cfg.renameNode(form({ kind: "eje", id: eje.id, name: "Hack" }))), "/sin-acceso");
  });
});

describe("RF-NOT-04: todos los mensajes con la marca", () => {
  test("correo con encabezado y pie; SMS y WhatsApp con prefijo; sin romper aprobación ni preferencias", async () => {
    const { notify } = await import("@/lib/notify");
    const ids = notify({ key: "otp", vars: { code: "123456" }, email: "x@y.co", phone: "3001112233" });
    const rows = ids.map((id) => db.get<any>("SELECT * FROM notifications WHERE id=?", id));
    const mail = rows.find((r) => r.channel === "correo");
    assert.match(mail.body, /^Compensar — /);
    assert.match(mail.body, /— Compensar · Plataforma de Fomento Empresarial/);
    assert.match(mail.body, /123456/);
    assert.match(mail.subject, /^Compensar \| /);
    for (const r of rows.filter((r) => r.channel !== "correo")) assert.match(r.body, /^Compensar: /);
    db.setSetting("brand_sms_prefix", "Compensar Empresas");
    const sms = db.get<any>("SELECT body FROM notifications WHERE id=?", notify({ key: "otp", vars: { code: "1" }, phone: "3001112233", channels: ["sms"] })[0]).body;
    assert.match(sms, /^Compensar Empresas: /);
    // plantilla no aprobada sigue sin enviarse
    const wa = db.get<any>("SELECT * FROM notifications WHERE id=?", notify({ key: "remision", vars: {}, phone: "3001112233", channels: ["whatsapp"] })[0]);
    assert.equal(wa.status, "fallido");
    // preferencias del usuario se respetan
    const uid = db.get<any>("SELECT id FROM users WHERE email='empresa3@tecnosoft.test'").id;
    db.run("UPDATE users SET notif_prefs=? WHERE id=?", JSON.stringify({ correo: 1, sms: 0, whatsapp: 1 }), uid);
    notify({ key: "activacion", vars: { company: "X", program: "Y" }, phone: "3001112233", userId: uid, channels: ["sms"] });
    assert.equal(db.get<any>("SELECT status FROM notifications WHERE user_id=? AND channel='sms' ORDER BY id DESC", uid).status, "omitido");
  });
});

describe("Configuración → Roles: guardar no pierde permisos fuera del catálogo ni el comodín", () => {
  test("empresa conserva company.manage_profile y el administrador sigue con *", async () => {
    const cfg = await import("@/app/(app)/configuracion/actions");
    const { PERM_CATALOG } = await import("@/lib/perms");
    await loginAs("admin@compensar.test");
    const emp = db.get<any>("SELECT * FROM roles WHERE key='empresa'");
    const perms: string[] = JSON.parse(emp.perms);
    await redirectOf(() => cfg.saveRole(form({ id: emp.id, name: emp.name, perm: perms.filter((p) => PERM_CATALOG.some(([k]) => k === p)) })));
    assert.deepEqual(JSON.parse(db.get<any>("SELECT perms FROM roles WHERE id=?", emp.id).perms).sort(), [...perms].sort());
    const adm = db.get<any>("SELECT * FROM roles WHERE key='admin'");
    await redirectOf(() => cfg.saveRole(form({ id: adm.id, name: adm.name, perm: PERM_CATALOG.map(([k]) => k) })));
    assert.deepEqual(JSON.parse(db.get<any>("SELECT perms FROM roles WHERE id=?", adm.id).perms), ["*"]);
  });
});
