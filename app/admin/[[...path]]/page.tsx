import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminClient from "../../components/AdminClient";
import { isVoiceFeatureEnabled } from "../../../lib/agent/voice";
import { getAdminIdentity } from "../../../lib/auth";
import { isDemoMode } from "../../../lib/demo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Panel administrativo" };

export default async function AdminPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
  if (!isDemoMode() && !clerkConfigured) {
    return (
      <main className="signin-page">
        <section>
          <Link className="brand" href="/"><span className="brand-mark">P</span><span>Pulso</span></Link>
          <span className="signin-mark">!</span>
          <h1>Configura Clerk para continuar.</h1>
          <p>Agrega tus claves de Clerk en el archivo <code>.env.local</code> y reinicia la aplicación.</p>
          <Link className="text-link" href="/">Volver al inicio</Link>
        </section>
        <aside><div className="signin-quote">Tu panel administrativo quedará protegido con una sesión segura.</div></aside>
      </main>
    );
  }

  const user = await getAdminIdentity(undefined, true);
  const { path = [] } = await params;
  if (!user) redirect("/sign-in?redirect_url=/admin");
  return <AdminClient user={user} path={path} voiceEnabled={isVoiceFeatureEnabled()} />;
}
