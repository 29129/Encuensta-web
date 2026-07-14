import Link from "next/link";
import type { Metadata } from "next";
import AdminClient from "../../components/AdminClient";
import { chatGPTSignInPath } from "../../chatgpt-auth";
import { getAdminIdentity } from "../../../lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Panel administrativo" };

export default async function AdminPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const user = await getAdminIdentity(); const { path = [] } = await params;
  if (!user) return <main className="signin-page"><section><Link className="brand" href="/"><span className="brand-mark">P</span><span>Pulso</span></Link><span className="signin-mark">↗</span><h1>Tu espacio para escuchar mejor.</h1><p>Inicia sesión para crear encuestas, compartirlas y consultar resultados protegidos.</p><a className="button button-primary button-large" href={chatGPTSignInPath("/admin")}>Iniciar sesión con ChatGPT <span>→</span></a><Link className="text-link" href="/">Volver al inicio</Link></section><aside><div className="signin-quote">“Las respuestas cobran valor cuando puedes ver con claridad lo que tienen en común.”</div><div className="signin-mini"><span>Resultados en vivo</span><strong>326</strong><div><i /><i /><i /><i /><i /></div></div></aside></main>;
  return <AdminClient user={user} path={path} />;
}
