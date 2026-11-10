/**
 * ERS §9 «Ningún rol ve datos fuera de su alcance» (RN-01, RN-02, RN-04): prueba automática de aislamiento sobre
 * una base temporal sembrada. Para cada usuario demo verifica companyFilter, canSeeCompany y sessionFilter
 * contra el alcance esperado de su rol, incluido el acceso por enlace directo a registros ajenos.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { cleanupDb, demoUser, setupDb } from "./helpers";

let db: typeof import("@/lib/db");
let auth: typeof import("@/lib/auth");
let C: Record<string, number> = {};
let S: Record<string, number> = {};
let ALL_COMPANIES: number[] = [];
let ALL_SESSIONS: number[] = [];

const ids = (rows: any[]) => rows.map((r) => r.id).sort((a, b) => a - b);
const sorted = (a: number[]) => [...a].sort((x, y) => x - y);

async function visibleCompanies(email: string) {
  const u = await demoUser(email);
  const f = auth.companyFilter(u, "c");
  return ids(db.all(`SELECT c.id FROM companies c WHERE ${f.sql}`, ...f.params));
}
async function visibleSessions(email: string) {
  const u = await demoUser(email);
  const f = auth.sessionFilter(u, "s");
  return ids(db.all(`SELECT s.id FROM mentoring_sessions s WHERE ${f.sql}`, ...f.params));
}

before(async () => {
  await setupDb();
  db = await import("@/lib/db");
  auth = await import("@/lib/auth");
  const { get, insert, now } = db;
  const id = (sql: string, ...p: any[]) => get<any>(sql, ...p).id as number;
  const user = (e: string) => id("SELECT id FROM users WHERE email=?", e);
  C.espiga = id("SELECT id FROM companies WHERE nit='900111222'");
  C.textiles = id("SELECT id FROM companies WHERE nit='800333444'");
  C.tecnosoft = id("SELECT id FROM companies WHERE nit='901555666'");
  const pEmp = id("SELECT id FROM programs WHERE name='Emprendimiento'");
  const pTer = id("SELECT id FROM programs WHERE name='Territorio MIPYME'");
  const crecer = id("SELECT id FROM aliados WHERE name='Fundación Crecer'");
  const andinos = id("SELECT id FROM aliados WHERE name LIKE 'Consultores Andinos%'");
  // datos adicionales para que cada alcance tenga algo que excluir
  C.emprende = insert("INSERT INTO companies(razon_social,nit,dv,program_id,status,source,created_at) VALUES('Emprende Ya SAS','901222333','1',?,'activa','prueba',?)", pEmp, now());
  const svc = id("SELECT id FROM servicios WHERE aliado_id=? LIMIT 1", crecer);
  const svc2 = id("SELECT id FROM servicios WHERE aliado_id=? LIMIT 1", andinos);
  const r1 = insert("INSERT INTO referrals(company_id,servicio_id,aliado_id,mentor_id,status,created_at) VALUES(?,?,?,?,'aceptada',?)", C.textiles, svc, crecer, user("mentor@crecer.test"), now());
  const r2 = insert("INSERT INTO referrals(company_id,servicio_id,aliado_id,mentor_id,status,created_at) VALUES(?,?,?,?,'aceptada',?)", C.tecnosoft, svc2, andinos, user("mentor@andinos.test"), now());
  const ses = (company: number, mentor: number, program: number, ref: number | null) =>
    insert("INSERT INTO mentoring_sessions(company_id,mentor_id,program_id,referral_id,title,scheduled_at,status,created_at) VALUES(?,?,?,?,'Prueba',?,'programada',?)", company, mentor, program, ref, now(), now());
  S.espiga = id("SELECT id FROM mentoring_sessions WHERE company_id=? AND mentor_id=?", C.espiga, user("mentor1@compensar.test"));
  S.textilesCrecer = ses(C.textiles, user("mentor@crecer.test"), pTer, r1);
  S.tecnosoftAndinos = ses(C.tecnosoft, user("mentor@andinos.test"), pTer, r2);
  S.emprende = ses(C.emprende, user("admin@compensar.test"), pEmp, null);
  ALL_COMPANIES = ids(db.all("SELECT id FROM companies"));
  ALL_SESSIONS = ids(db.all("SELECT id FROM mentoring_sessions"));
});
after(cleanupDb);

/** Alcance esperado de cada usuario demo (empresas y sesiones). */
const EXPECTED = () => ({
  "admin@compensar.test": { companies: ALL_COMPANIES, sessions: ALL_SESSIONS },
  "auditor@compensar.test": { companies: ALL_COMPANIES, sessions: ALL_SESSIONS },
  "mentor2@compensar.test": { companies: [], sessions: [] },
  "mentor1@compensar.test": { companies: [C.espiga], sessions: [S.espiga] },
  "mentor@crecer.test": { companies: [C.textiles], sessions: [S.textilesCrecer] },
  "mentor@andinos.test": { companies: [C.tecnosoft], sessions: [S.tecnosoftAndinos] },
  "coord@crecer.test": { companies: [C.textiles], sessions: [S.textilesCrecer] },
  "empresa1@laespiga.test": { companies: [C.espiga], sessions: [S.espiga] },
  "colab1@laespiga.test": { companies: [C.espiga], sessions: [S.espiga] },
  "empresa2@textiles.test": { companies: [C.textiles], sessions: [S.textilesCrecer] },
  "empresa3@tecnosoft.test": { companies: [C.tecnosoft], sessions: [S.tecnosoftAndinos] },
  // gestor y auxiliar: solo el programa Territorio MIPYME (no ven «Emprende Ya», del programa Emprendimiento)
  "gestor@compensar.test": { companies: ALL_COMPANIES.filter((c) => c !== C.emprende), sessions: ALL_SESSIONS.filter((s) => s !== S.emprende) },
  "aux@compensar.test": { companies: ALL_COMPANIES.filter((c) => c !== C.emprende), sessions: [] },
  // evaluador con alcance «asignados» y sin asignaciones; roles sin companies.view no ven empresas
  "evaluador@compensar.test": { companies: [], sessions: [] },
  "contenidos@compensar.test": { companies: [], sessions: [] },
  "cursos@compensar.test": { companies: [], sessions: [] },
  "pagos@compensar.test": { companies: [], sessions: [] },
});

describe("Aislamiento por rol y alcance (RN-01, RN-02)", () => {
  test("cada usuario demo está cubierto por la prueba", () => {
    const demo = db.all<any>("SELECT email FROM users").map((u) => u.email).sort();
    assert.deepEqual(demo, Object.keys(EXPECTED()).sort(), "Hay usuarios demo sin alcance esperado definido en la prueba");
  });

  test("companyFilter devuelve exactamente las empresas de su alcance", async () => {
    for (const [email, exp] of Object.entries(EXPECTED()))
      assert.deepEqual(await visibleCompanies(email), sorted(exp.companies), `${email} ve empresas fuera de su alcance`);
  });

  test("canSeeCompany niega el acceso por enlace directo a empresas ajenas", async () => {
    for (const [email, exp] of Object.entries(EXPECTED())) {
      const u = await demoUser(email);
      for (const c of ALL_COMPANIES) assert.equal(auth.canSeeCompany(u, c), exp.companies.includes(c), `${email} · empresa ${c}`);
      assert.equal(auth.canSeeCompany(u, 999999), false, `${email} · empresa inexistente`);
    }
  });

  test("sessionFilter devuelve exactamente las sesiones de su alcance", async () => {
    for (const [email, exp] of Object.entries(EXPECTED()))
      assert.deepEqual(await visibleSessions(email), sorted(exp.sessions), `${email} ve sesiones fuera de su alcance`);
  });

  test("casos del criterio: mentor2 nada, mentor1 La Espiga, coordinador su aliado, empresa la suya, gestor su programa, admin todo", async () => {
    assert.deepEqual(await visibleCompanies("mentor2@compensar.test"), []);
    assert.deepEqual(await visibleCompanies("mentor1@compensar.test"), [C.espiga]);
    const coord = await visibleCompanies("coord@crecer.test");
    const crecer = db.get<any>("SELECT aliado_id FROM users WHERE email='coord@crecer.test'").aliado_id;
    assert.deepEqual(coord, ids(db.all("SELECT DISTINCT company_id id FROM referrals WHERE aliado_id=?", crecer)));
    assert.ok(!coord.includes(C.tecnosoft), "el coordinador de Crecer no ve empresas remitidas a otro aliado");
    assert.deepEqual(await visibleCompanies("empresa1@laespiga.test"), [C.espiga]);
    const gestor = await visibleCompanies("gestor@compensar.test");
    const pTer = db.get<any>("SELECT id FROM programs WHERE name='Territorio MIPYME'").id;
    assert.deepEqual(gestor, ids(db.all("SELECT id FROM companies WHERE program_id=?", pTer)));
    assert.deepEqual(await visibleCompanies("admin@compensar.test"), ALL_COMPANIES);
  });

  test("programScope: gestor limitado a su programa, admin a toda la organización", async () => {
    const pTer = db.get<any>("SELECT id FROM programs WHERE name='Territorio MIPYME'").id;
    assert.deepEqual(auth.programScope(await demoUser("gestor@compensar.test"), "companies.activate"), [pTer]);
    assert.equal(auth.programScope(await demoUser("admin@compensar.test"), "companies.activate"), null);
    assert.deepEqual(auth.programScope(await demoUser("mentor1@compensar.test"), "companies.activate"), []);
    const pEmp = db.get<any>("SELECT id FROM programs WHERE name='Emprendimiento'").id;
    assert.equal(auth.canInProgram(await demoUser("gestor@compensar.test"), "companies.activate", pEmp), false);
  });

  test("RN-04: roles combinados suman sus alcances (unión) y nada más", async () => {
    const { insert, get, now } = db;
    const m2 = get<any>("SELECT id FROM users WHERE email='mentor2@compensar.test'").id;
    const coordRole = get<any>("SELECT id FROM roles WHERE key='coord_aliado'").id;
    const andinos = get<any>("SELECT id FROM aliados WHERE name LIKE 'Consultores Andinos%'").id;
    const ur = insert("INSERT INTO user_roles(user_id,role_id,scope_type,scope_id,created_at) VALUES(?,?,?,?,?)", m2, coordRole, "aliado", andinos, now());
    assert.deepEqual(await visibleCompanies("mentor2@compensar.test"), [C.tecnosoft]);
    db.run("DELETE FROM user_roles WHERE id=?", ur);
    assert.deepEqual(await visibleCompanies("mentor2@compensar.test"), []);
  });

  test("contacto multiempresa (RF-EMP-03): solo ve la empresa activa y nunca una ajena", async () => {
    const { get, now } = db;
    const { linkContact } = await import("@/lib/jobs/plataforma");
    const rep = get<any>("SELECT id FROM users WHERE email='empresa1@laespiga.test'").id;
    db.tx(() => linkContact(C.emprende, rep, "representante", null));
    const base = await demoUser("empresa1@laespiga.test");
    assert.equal(base.company_id, C.espiga);
    const raw = { ...base, grants: auth.loadGrants(rep) };
    const enEmprende = auth.withActiveCompany(raw, C.emprende);
    assert.equal(enEmprende.company_id, C.emprende);
    let f = auth.companyFilter(enEmprende, "c");
    assert.deepEqual(ids(db.all(`SELECT c.id FROM companies c WHERE ${f.sql}`, ...f.params)), [C.emprende]);
    assert.equal(auth.canSeeCompany(enEmprende, C.espiga), false, "con otra empresa activa no ve la anterior");
    // una empresa que no es suya no se puede activar: vuelve a la principal
    const ajena = auth.withActiveCompany(raw, C.tecnosoft);
    assert.equal(ajena.company_id, C.espiga);
    f = auth.companyFilter(ajena, "c");
    assert.deepEqual(ids(db.all(`SELECT c.id FROM companies c WHERE ${f.sql}`, ...f.params)), [C.espiga]);
    assert.ok(now());
  });
});
