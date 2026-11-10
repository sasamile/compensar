/**
 * `npm run aprobar-permisos` — regenera docs/matriz-permisos-aprobada.json desde la semilla (src/lib/seed.ts).
 * Es el acto de aprobación de un cambio de permisos: el archivo queda en Git y `npm test` falla mientras la
 * matriz real no coincida con la aprobada.
 */
import { cleanupDb, setupDb } from "./helpers";
import { APPROVED_FILE, computeMatrix, writeApproved } from "./matriz";

(async () => {
  await setupDb();
  const m = await computeMatrix();
  const { changed, diff } = writeApproved(m);
  cleanupDb();
  console.log(`Matriz de permisos: ${Object.keys(m.roles).length} roles × ${m.permisos.length} permisos = ${Object.keys(m.roles).length * m.permisos.length} combinaciones.`);
  if (!changed) console.log("Sin cambios respecto a la matriz aprobada.");
  else {
    console.log(`Matriz aprobada actualizada en ${APPROVED_FILE}. Cambios aprobados:`);
    for (const d of diff) console.log("  · " + d);
    console.log("Confirma el archivo en Git para dejar constancia de la aprobación.");
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
