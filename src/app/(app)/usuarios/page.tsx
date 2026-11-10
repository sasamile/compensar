import { Users as PageIcon } from "lucide-react";
import { all, get } from "@/lib/db";
import { can, requireUser, requirePerm } from "@/lib/auth";
import { Badge, Field, Flash, PageHeader, Table, Td } from "@/components/ui";
import { SCOPES } from "@/lib/perms";
import * as A from "./actions";
import { delegation } from "@/lib/delegation";

export default async function Usuarios({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const isAdmin = can(u, "users.manage");
  if (!isAdmin && !can(u, "users.manage.mentors") && !can(u, "users.manage.aliado") && !(can(u, "company.manage_collab") && u.is_principal)) requirePerm(u, "users.manage");
  const st = sp.estado || "", rl = sp.rol || "";
  let where = "1=1"; const p: any[] = [];
  if (!isAdmin) {
    if (u.company_id) { where = "(u.company_id=? OR u.id IN (SELECT user_id FROM company_contacts WHERE company_id=?))"; p.push(u.company_id, u.company_id); }
    else if (u.aliado_id) { where = "u.aliado_id=?"; p.push(u.aliado_id); }
    else where = "r.key='mentor'";
  }
  if (st) { where += " AND u.status=?"; p.push(st); }
  if (rl) { where += " AND r.key=?"; p.push(rl); }
  const users = all<any>(`SELECT u.*, GROUP_CONCAT(ur.id||'|'||r.name||'|'||ur.scope_type, ';;') roles
    FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE ${where} GROUP BY u.id ORDER BY u.id`, ...p);
  const allRoles = all<any>("SELECT * FROM roles ORDER BY id");
  const assignable = allRoles.filter((r) => delegation(u, r.key));
  const programs = all<any>("SELECT id,name FROM programs");
  const aliados = all<any>("SELECT id,name FROM aliados");
  return (
    <>
      <PageHeader icon={PageIcon} title="Usuarios" subtitle="Invitaciones, roles con alcance y estado" />
      <Flash sp={sp} />
      <form className="mb-3 flex gap-2 text-sm">
        <select name="estado" defaultValue={st} className="input !w-auto"><option value="">Todos los estados</option><option>activo</option><option>invitado</option><option>inactivo</option><option>revocada</option></select>
        {isAdmin && <select name="rol" defaultValue={rl} className="input !w-auto"><option value="">Todos los roles</option>{allRoles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select>}
        <button className="btn-ghost">Filtrar</button>
      </form>
      <Table head={["Usuario", "Roles (alcance)", "Estado", "Acciones"]}>
        {users.map((x) => (
          <tr key={x.id}>
            <Td><b>{x.name}</b><div className="text-xs text-slate-400">{x.email}</div></Td>
            <Td>{(x.roles || "").split(";;").filter(Boolean).map((s: string) => { const [id, n, sc] = s.split("|"); return (
              <div key={id} className="flex items-center gap-1 text-xs">{n} <span className="text-slate-400">({sc})</span>
                {isAdmin && x.id !== u.id && <form action={A.removeRole}><input type="hidden" name="id" value={id} /><button className="text-red-500" title="Revocar rol">×</button></form>}</div>); })}</Td>
            <Td><Badge>{x.status}</Badge></Td>
            <Td>
              {x.id !== u.id && <div className="flex flex-wrap gap-1">
                {x.status === "activo" || x.status === "invitado" ? (
                  <form action={A.setUserStatus}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="to" value={x.status === "invitado" ? "revocada" : "inactivo"} />
                    <button className="btn-ghost btn-sm">{x.status === "invitado" ? "Revocar invitación" : "Desactivar"}</button></form>
                ) : <form action={A.setUserStatus}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="to" value="activo" /><button className="btn-ghost btn-sm">Reactivar</button></form>}
                {x.status !== "activo" && <form action={A.resendInvite}><input type="hidden" name="id" value={x.id} /><button className="btn-ghost btn-sm">Reenviar invitación</button></form>}
              </div>}
            </Td>
          </tr>))}
      </Table>

      {assignable.length > 0 && (
        <form action={A.inviteUser} className="card mt-6 grid gap-3 md:grid-cols-4">
          <div className="font-semibold text-ink md:col-span-4">Invitar usuario</div>
          <Field label="Nombre"><input name="name" required className="input" /></Field>
          <Field label="Correo"><input name="email" type="email" required className="input" /></Field>
          <Field label="Celular"><input name="phone" className="input" /></Field>
          <Field label="Rol"><select name="role_id" className="input">{assignable.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
          {isAdmin && <>
            <Field label="Alcance"><select name="scope_type" className="input">{SCOPES.filter(([k]) => k !== "company").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Programa / aliado (según alcance)"><select name="scope_id" className="input"><option value="">—</option>
              <optgroup label="Programas">{programs.map((p) => <option key={"p" + p.id} value={p.id}>{p.name}</option>)}</optgroup>
              <optgroup label="Aliados">{aliados.map((a) => <option key={"a" + a.id} value={a.id}>{a.name}</option>)}</optgroup></select></Field></>}
          <div className="self-end"><button className="btn">Enviar invitación</button></div>
          <p className="text-xs text-slate-400 md:col-span-4">Funcionarios de Compensar ingresan por SSO (IAM) en producción. La contraseña temporal vence en 3 días y debe cambiarse en el primer ingreso. Los datos de contraseña temporal se muestran solo en modo demo.</p>
        </form>)}

      {isAdmin && (
        <form action={A.addRole} className="card mt-4 grid gap-3 md:grid-cols-5">
          <div className="font-semibold text-ink md:col-span-5">Agregar rol adicional a un usuario (roles combinados)</div>
          <Field label="Usuario"><select name="user_id" className="input">{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <Field label="Rol"><select name="role_id" className="input">{allRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
          <Field label="Alcance"><select name="scope_type" className="input">{SCOPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Programa / aliado"><select name="scope_id" className="input"><option value="">—</option>
            {programs.map((p) => <option key={"p" + p.id} value={p.id}>P: {p.name}</option>)}{aliados.map((a) => <option key={"a" + a.id} value={a.id}>A: {a.name}</option>)}</select></Field>
          <div className="self-end"><button className="btn">Asignar</button></div>
        </form>)}
    </>
  );
}
