import { auth, currentUser } from "@clerk/nextjs/server";

export type AdminIdentity = { email: string; name: string; isLocalDemo: boolean };

export async function getAdminIdentity(_request?: Request, includeProfile = false): Promise<AdminIdentity | null> {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) return null;

  const { userId } = await auth();
  if (!userId) return null;
  if (!includeProfile) return { email: userId, name: "Administrador", isLocalDemo: false };

  const user = await currentUser();
  const address = user?.primaryEmailAddress?.emailAddress ?? userId;
  const name = user?.fullName ?? user?.firstName ?? address.split("@")[0] ?? "Administrador";
  return { email: userId, name, isLocalDemo: false };
}

export function unauthorizedResponse(): Response {
  return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
}
