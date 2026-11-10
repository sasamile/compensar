/**
 * RF-ACC-07 / ERS §9: «Una prueba automática recorre todas las combinaciones rol-permiso y falla si alguna
 * cambia sin aprobación». Compara la matriz real (semilla + can()) con docs/matriz-permisos-aprobada.json.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { cleanupDb, setupDb } from "./helpers";
import { computeMatrix, diffMatrix, readApproved, type Matrix } from "./matriz";

describe("Matriz de permisos aprobada (RF-ACC-07)", () => {
  let actual: Matrix;
  before(async () => { await setupDb(); actual = await computeMatrix(); });
  after(cleanupDb);

  test("existe la matriz aprobada", () => {
    assert.ok(readApproved(), "Falta docs/matriz-permisos-aprobada.json: ejecuta `npm run aprobar-permisos`");
  });

  test("cubre todos los roles y todos los permisos del catálogo (incluidos los reportes)", async () => {
    const { PERM_CATALOG, REPORTS } = await import("@/lib/perms");
    const aprobada = readApproved()!;
    for (const [k] of PERM_CATALOG) assert.ok(aprobada.permisos.includes(k), `La matriz aprobada no incluye ${k}`);
    for (const [id] of REPORTS) assert.ok(aprobada.permisos.includes(`report:${id}`), `La matriz aprobada no incluye report:${id}`);
    assert.ok(Object.keys(aprobada.roles).length >= 12, "Faltan roles en la matriz aprobada");
    for (const r of Object.values(aprobada.roles)) assert.equal(Object.keys(r.permisos).length, aprobada.permisos.length);
  });

  test("ninguna combinación rol-permiso cambió sin aprobación", () => {
    const aprobada = readApproved()!;
    const diff = diffMatrix(aprobada, actual);
    const total = Object.keys(actual.roles).length * actual.permisos.length;
    assert.deepEqual(diff, [],
      `\n${diff.length} cambio(s) en la matriz de permisos SIN APROBAR (de ${total} combinaciones):\n  · ${diff.join("\n  · ")}\n` +
      "Si el cambio es correcto, apruébalo con `npm run aprobar-permisos` y confirma docs/matriz-permisos-aprobada.json en Git.\n");
  });

  test("la comparación detecta un permiso cambiado (autoverificación)", () => {
    const aprobada = structuredClone(actual);
    const rol = "mentor", perm = "payments.approve";
    aprobada.roles[rol].permisos[perm] = aprobada.roles[rol].permisos[perm] === "sí" ? "no" : "sí";
    const diff = diffMatrix(aprobada, actual);
    assert.equal(diff.length, 1);
    assert.match(diff[0], /mentor.*payments\.approve/);
  });

  test("invariantes de rol: separación de funciones y mínimos privilegios", () => {
    const R = actual.roles;
    // RN-05: el mentor registra horas pero no aprueba pagos ni cierres; el aprobador de pagos no registra horas
    assert.equal(R.mentor.permisos["hours.register"], "sí");
    assert.equal(R.mentor.permisos["payments.approve"], "no");
    assert.equal(R.mentor.permisos["closure.approve"], "no");
    assert.equal(R.aprobador_pagos.permisos["hours.register"], "no");
    assert.equal(R.aprobador_pagos.permisos["closure.approve"], "no");
    // el auditor solo lee
    for (const p of ["config.manage", "users.manage", "companies.activate", "payments.approve", "closure.approve"]) assert.equal(R.auditor.permisos[p], "no", `auditor no debe tener ${p}`);
    // roles externos sin permisos administrativos
    for (const k of ["empresa", "colaborador", "coord_aliado"])
      for (const p of ["config.manage", "users.manage", "audit.view", "security.manage", "api.manage", "payments.approve"]) assert.equal(R[k].permisos[p], "no", `${k} no debe tener ${p}`);
    // el administrador tiene todo
    assert.ok(Object.values(R.admin.permisos).every((v) => v === "sí"));
  });
});
