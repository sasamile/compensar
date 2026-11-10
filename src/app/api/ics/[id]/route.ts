import { redirect } from "next/navigation";

/** Compatibilidad: la invitación completa (asistentes, versión y cancelación) vive en /agenda/[id]/ics. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  redirect(`/agenda/${(await params).id}/ics`);
}
