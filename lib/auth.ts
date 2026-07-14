import { headers } from "next/headers";

export type AdminIdentity = { email: string; name: string; isLocalDemo: boolean };

function decodeName(value: string | null, encoding: string | null): string | null {
  if (!value || encoding !== "percent-encoded-utf-8") return null;
  try { return decodeURIComponent(value); } catch { return null; }
}

export async function getAdminIdentity(request?: Request): Promise<AdminIdentity | null> {
  const requestHeaders = request?.headers ?? (await headers());
  const email = requestHeaders.get("oai-authenticated-user-email");
  const fullName = decodeName(requestHeaders.get("oai-authenticated-user-full-name"), requestHeaders.get("oai-authenticated-user-full-name-encoding"));
  if (email) return { email: email.toLowerCase(), name: fullName ?? email.split("@")[0], isLocalDemo: false };

  const rawHost = requestHeaders.get("host") ?? (request ? new URL(request.url).host : "");
  const hostname = rawHost.replace(/^\[/, "").replace(/\].*$/, "").split(":")[0];
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (process.env.NODE_ENV !== "production" && isLocal) return { email: "demo@pulso.local", name: "Equipo Pulso", isLocalDemo: true };
  return null;
}

export function unauthorizedResponse(): Response {
  return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
}
