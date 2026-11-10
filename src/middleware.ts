import { NextResponse, type NextRequest } from "next/server";

/** Expone la ruta solicitada a los componentes de servidor (p. ej. para exigir los pasos del primer ingreso). */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/|api/|favicon|_t/).*)"] };
