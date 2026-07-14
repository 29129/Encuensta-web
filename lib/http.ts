import { getAdminIdentity, type AdminIdentity } from "./auth";
import { PulsoError } from "./surveys";

export async function requireAdmin(request: Request): Promise<AdminIdentity> {
  const identity = await getAdminIdentity(request);
  if (!identity) throw new PulsoError("Inicia sesión para continuar.", 401);
  return identity;
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) throw new PulsoError("Solicitud no permitida.", 403);
}

export function apiError(error: unknown): Response {
  if (error instanceof PulsoError) return Response.json({ error: error.message }, { status: error.status });
  console.error(error);
  return Response.json({ error: "Ocurrió un problema inesperado. Inténtalo nuevamente." }, { status: 500 });
}
