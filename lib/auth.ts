import { headers } from "next/headers";

export type AdminIdentity = { email: string; name: string; isLocalDemo: boolean };
type JwtHeader = { alg?: string; kid?: string };
type JwtPayload = { sub?: string; azp?: string; exp?: number; nbf?: number };
type Jwk = JsonWebKey & { kid?: string };

let cachedJwks: { expiresAt: number; keys: Jwk[] } | null = null;

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

function decodeJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

function clerkDomain(publishableKey: string): string {
  const encoded = publishableKey.split("_")[2];
  if (!encoded) throw new Error("Clave publicable de Clerk inválida.");
  return new TextDecoder().decode(decodeBase64Url(encoded)).replace(/\$$/, "");
}

async function getJwks(publishableKey: string): Promise<Jwk[]> {
  if (cachedJwks && cachedJwks.expiresAt > Date.now()) return cachedJwks.keys;
  const response = await fetch(`https://${clerkDomain(publishableKey)}/.well-known/jwks.json`);
  if (!response.ok) throw new Error("No se pudieron obtener las claves de Clerk.");
  const payload = await response.json() as { keys: Jwk[] };
  cachedJwks = { keys: payload.keys, expiresAt: Date.now() + 60 * 60 * 1000 };
  return payload.keys;
}

function sessionToken(request: Request): string | null {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) return bearer;
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)__session=([^;]+)/)?.[1];
  return cookie ? decodeURIComponent(cookie) : null;
}

async function verifySession(request: Request, publishableKey: string): Promise<string | null> {
  const token = sessionToken(request);
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const header = decodeJson<JwtHeader>(parts[0]);
    const payload = decodeJson<JwtPayload>(parts[1]);
    if (header.alg !== "RS256" || !header.kid || !payload.sub) return null;
    const jwk = (await getJwks(publishableKey)).find((key) => key.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const signature = decodeBase64Url(parts[2]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature.buffer as ArrayBuffer, new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    const now = Math.floor(Date.now() / 1000);
    if (!valid || (payload.exp && payload.exp <= now) || (payload.nbf && payload.nbf > now + 5)) return null;
    if (payload.azp && payload.azp !== new URL(request.url).origin) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

async function currentRequest(): Promise<Request> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return new Request(`${protocol}://${host}/admin`, { headers: new Headers(requestHeaders) });
}

export async function getAdminIdentity(request?: Request, includeProfile = false): Promise<AdminIdentity | null> {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!publishableKey || !secretKey) return null;
  const userId = await verifySession(request ?? await currentRequest(), publishableKey);
  if (!userId) return null;
  if (!includeProfile) return { email: userId, name: "Administrador", isLocalDemo: false };

  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, { headers: { Authorization: `Bearer ${secretKey}` } });
  if (!response.ok) return { email: userId, name: "Administrador", isLocalDemo: false };
  const user = await response.json() as { first_name?: string | null; last_name?: string | null; email_addresses?: Array<{ id: string; email_address: string }>; primary_email_address_id?: string | null };
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || "Administrador";
  return { email: userId, name, isLocalDemo: false };
}

export function unauthorizedResponse(): Response {
  return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
}
