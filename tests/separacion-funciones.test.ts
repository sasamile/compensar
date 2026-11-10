/**
 * RN-05 Separación de funciones: «quien registra horas de un servicio no las aprueba, y quien aprueba el cierre no
 * aprueba el pago de ese mismo servicio». Ejecuta las server actions reales (cierres y pagos) con sesiones simuladas.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { cleanupDb, form, loginAs, redirectOf, setupDb } from "./helpers";

let db: typeof import("@/lib/db");
let pagos: typeof import("@/app/(app)/pagos/actions");
let cierres: typeof import("@/app/(app)/cierres/actions");
let crecer = 0, company = 0, referral = 0, session = 0, period = "";
const uid = (e: string) => db.get<any>("SELECT id FROM users WHERE email=?", e).id as number;

before(async () => {
  await setupDb();
  db = await import("@/lib/db");
  pagos = await import("@/app/(app)/pagos/actions");
  cierres = await import("@/app/(app)/cierres/actions");
  const { get, insert, now } = db;
  crecer = get<any>("SELECT id FROM aliados WHERE name='Fundación Crecer'").id;
  company = get<any>("SELECT id FROM companies WHERE nit='800333444'").id;
  const svc = get<any>("SELECT id FROM servicios WHERE aliado_id=? LIMIT 1", crecer).id;
  const program = get<any>("SELECT program_id FROM companies WHERE id=?", company).program_id;
  const d = new Date(); d.setUTCDate(15); d.setUTCHours(15, 0, 0, 0);
  period = d.toISOString().slice(0, 7);
  referral = insert("INSERT INTO referrals(company_id,servicio_id,aliado_id,mentor_id,status,created_at) VALUES(?,?,?,?,'aceptada',?)", company, svc, crecer, uid("mentor@crecer.test"), now());
  session = insert(`INSERT INTO mentoring_sessions(company_id,mentor_id,program_id,referral_id,title,scheduled_at,status,hours,registered_by,accepted_by,accepted_at,created_at)
    VALUES(?,?,?,?,'Sesión de prueba',?,'realizada',2,?,?,?,?)`, company, uid("mentor@crecer.test"), program, referral, d.toISOString(), uid("admin@compensar.test"), uid("empresa2@textiles.test"), now(), now());
});
after(cleanupDb);

describe("Separación de funciones (RN-05)", () => {
  test("quien registró las horas no aprueba el pago (aunque tenga el permiso)", async () => {
    await loginAs("admin@compensar.test"); // el administrador tiene todos los permisos
    const url = await redirectOf(() => pagos.approvePayment(form({ aliado_id: crecer, period })));
    assert.match(url, /error=Separación de funciones: registraste horas/);
    assert.equal(db.get("SELECT 1 x FROM payment_reports WHERE aliado_id=? AND period=?", crecer, period), undefined);
  });

  test("quien registró las horas no aprueba el cierre del servicio", async () => {
    const cl = db.insert("INSERT INTO closures(company_id,referral_id,program_id,result,status,created_by,created_at) VALUES(?,?,?,?,'pendiente',?,?)",
      company, referral, 2, "Resultados", uid("gestor@compensar.test"), db.now());
    await loginAs("admin@compensar.test");
    const url = await redirectOf(() => cierres.approveClosure(form({ id: cl })));
    assert.match(url, /error=Separación de funciones: quien registró las horas/);
    assert.equal(db.get<any>("SELECT status FROM closures WHERE id=?", cl).status, "pendiente");
  });

  test("quien aprobó el cierre no aprueba el pago del mismo servicio", async () => {
    // las horas ahora las registró el mentor del aliado; el gestor aprueba el cierre y luego intenta aprobar el pago
    db.run("UPDATE mentoring_sessions SET registered_by=? WHERE id=?", uid("mentor@crecer.test"), session);
    const cl = db.get<any>("SELECT id FROM closures WHERE referral_id=?", referral).id;
    await loginAs("gestor@compensar.test");
    const ok = await redirectOf(() => cierres.approveClosure(form({ id: cl })));
    assert.match(ok, /ok=Cierre aprobado/);
    // el gestor no tiene payments.approve: se le da el rol de aprobador para probar la regla y no el permiso
    const role = db.get<any>("SELECT id FROM roles WHERE key='aprobador_pagos'").id;
    const ur = db.insert("INSERT INTO user_roles(user_id,role_id,scope_type,created_at) VALUES(?,?,'org',?)", uid("gestor@compensar.test"), role, db.now());
    const url = await redirectOf(() => pagos.approvePayment(form({ aliado_id: crecer, period })));
    assert.match(url, /error=Separación de funciones: aprobaste el cierre/);
    db.run("DELETE FROM user_roles WHERE id=?", ur);
  });

  test("sin conflicto de funciones el aprobador de pagos sí aprueba", async () => {
    await loginAs("pagos@compensar.test");
    const url = await redirectOf(() => pagos.approvePayment(form({ aliado_id: crecer, period })));
    assert.match(url, /ok=Reporte aprobado/);
    assert.equal(db.get<any>("SELECT approved_by FROM payment_reports WHERE aliado_id=? AND period=?", crecer, period).approved_by, uid("pagos@compensar.test"));
  });

  test("un rol sin el permiso no llega a aprobar (sin-acceso)", async () => {
    await loginAs("mentor@crecer.test");
    assert.equal(await redirectOf(() => pagos.approvePayment(form({ aliado_id: crecer, period }))), "/sin-acceso");
  });
});
